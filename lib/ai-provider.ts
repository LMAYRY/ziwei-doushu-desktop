import PROVIDERS from '@/electron/ai-providers.json';

// Which AI service to call, with whose key.
// - Desktop app (ZIWEI_DESKTOP=1, running as an Electron utility process): the settings the user
//   saved in 设置. The Electron main process decrypts the key and hands it over through the
//   utility-process message port right before each request; it never travels over HTTP.
// - `next dev` / tests: environment variables AI_PROVIDER, DEEPSEEK_*, SILICONFLOW_*.

export type AiProviderId = keyof typeof PROVIDERS;

export type AiProvider = {
  name: string;
  url: string;
  key: string;
  model: string;
  options: Record<string, unknown>;
};

export type AiProviderResult = { ok: true; provider: AiProvider } | { ok: false; error: string };

export type AiSettings = { provider: string; model: string; baseUrl: string; key: string };

export const AI_SETUP_HINT = '尚未设置 AI 服务。请点顶栏的「设置」，选择服务商、模型并填写 API Key。';

export function isAiProviderId(value: string): value is AiProviderId {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, value);
}

/** Turn saved settings into a request target. The URL always comes from the preset unless custom. */
export function providerFromSettings(settings: AiSettings | null | undefined): AiProvider | null {
  if (!settings || !isAiProviderId(settings.provider) || !settings.key || !settings.model) return null;
  const preset = PROVIDERS[settings.provider];
  const baseUrl = settings.provider === 'custom' ? settings.baseUrl : preset.baseUrl;
  if (!/^https?:\/\//.test(baseUrl)) return null;
  return {
    name: settings.provider === 'custom' ? 'AI 服务商' : preset.name,
    url: `${baseUrl.replace(/\/+$/, '')}/chat/completions`,
    key: settings.key,
    model: settings.model,
    options: preset.options as Record<string, unknown>,
  };
}

function fromEnvironment(): AiProviderResult {
  const provider = (process.env.AI_PROVIDER || 'deepseek').trim().toLowerCase();
  if (provider !== 'deepseek' && provider !== 'siliconflow') {
    return { ok: false, error: 'AI 服务商配置不正确，请检查 AI_PROVIDER。' };
  }
  const prefix = provider === 'deepseek' ? 'DEEPSEEK' : 'SILICONFLOW';
  const preset = PROVIDERS[provider];
  const key = process.env[`${prefix}_API_KEY`]?.trim();
  if (!key) return { ok: false, error: `尚未配置${preset.name} API Key。` };
  return {
    ok: true,
    provider: providerFromSettings({
      provider,
      key,
      model: process.env[`${prefix}_MODEL`]?.trim() || preset.defaultModel,
      baseUrl: preset.baseUrl,
    })!,
  };
}

type ParentPort = {
  on(event: 'message', listener: (event: { data: unknown }) => void): void;
  postMessage(message: unknown): void;
};

type Pending = Map<number, (settings: AiSettings | null) => void>;
const bridge = globalThis as typeof globalThis & { __ziweiAiBridge?: { pending: Pending; next: number } };

/** Ask the Electron main process for the current settings (null if none, or no answer in time). */
function requestDesktopSettings(port: ParentPort): Promise<AiSettings | null> {
  if (!bridge.__ziweiAiBridge) {
    const pending: Pending = new Map();
    bridge.__ziweiAiBridge = { pending, next: 1 };
    port.on('message', ({ data }) => {
      const message = data as { type?: unknown; id?: unknown; config?: AiSettings | null } | null;
      if (message?.type !== 'ai-config' || typeof message.id !== 'number') return;
      pending.get(message.id)?.(message.config ?? null);
      pending.delete(message.id);
    });
  }
  const state = bridge.__ziweiAiBridge;
  const id = state.next++;
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      state.pending.delete(id);
      resolve(null);
    }, 5000);
    state.pending.set(id, settings => {
      clearTimeout(timer);
      resolve(settings);
    });
    port.postMessage({ type: 'ai-config:get', id });
  });
}

export async function resolveAiProvider(): Promise<AiProviderResult> {
  if (process.env.ZIWEI_DESKTOP !== '1') return fromEnvironment();
  const port = (process as unknown as { parentPort?: ParentPort }).parentPort;
  if (!port) return { ok: false, error: AI_SETUP_HINT };
  const provider = providerFromSettings(await requestDesktopSettings(port));
  return provider ? { ok: true, provider } : { ok: false, error: AI_SETUP_HINT };
}
