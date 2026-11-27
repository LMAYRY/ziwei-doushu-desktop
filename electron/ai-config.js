// AI settings chosen by the user: provider, model and API key.
//
// Stored in <userData>/ai-config.json. The key is encrypted with Electron safeStorage (macOS
// Keychain) and only ever decrypted here, in the main process. The local Next server asks for
// it over the utility-process message port (see main.js), never over HTTP, so no other process
// on this machine can read it from the server's 127.0.0.1 port. Nothing here logs the key.
const { safeStorage } = require('electron');
const { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const PROVIDERS = require('./ai-providers.json');

const TEST_TIMEOUT_MS = 20_000;

function createAiConfig(directory) {
  const file = path.join(directory, 'ai-config.json');

  function read() {
    if (!existsSync(file)) return null;
    try {
      const value = JSON.parse(readFileSync(file, 'utf8'));
      return value && typeof value === 'object' ? value : null;
    } catch {
      return null;
    }
  }

  function write(value) {
    mkdirSync(directory, { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    renameSync(temp, file);
  }

  function decrypt(stored) {
    if (!stored?.encryptedKey) return { key: '' };
    try {
      return { key: safeStorage.decryptString(Buffer.from(stored.encryptedKey, 'base64')) };
    } catch {
      return { key: '', error: '无法读取已保存的 API Key（钥匙串拒绝访问或数据已损坏），请重新填写。' };
    }
  }

  /** Normalize and validate what the settings page sent. Throws a user-facing message. */
  function normalize(input) {
    const provider = String(input?.provider ?? '');
    const preset = PROVIDERS[provider];
    if (!preset) throw new Error('请选择 AI 服务商。');
    const model = String(input?.model ?? '').trim();
    if (!model || model.length > 200 || /\s/.test(model)) throw new Error('请填写正确的模型名称。');
    let baseUrl = preset.baseUrl;
    if (provider === 'custom') {
      baseUrl = String(input?.baseUrl ?? '').trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
      let url;
      try {
        url = new URL(baseUrl);
      } catch {
        throw new Error('请填写正确的接口地址，例如 https://api.example.com/v1');
      }
      const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
        throw new Error('接口地址必须以 https:// 开头（本机地址除外），以免 Key 被明文传输。');
      }
      if (url.username || url.password || url.search || url.hash) throw new Error('接口地址不能包含账号、参数或 #。');
    }
    const key = String(input?.key ?? '').trim();
    if (key && (key.length > 400 || /\s/.test(key))) throw new Error('API Key 格式不正确。');
    return { provider, model, baseUrl, key };
  }

  /**
   * The key to use for `settings`: the newly typed one, or the saved one if provider and address
   * are unchanged. A saved key is never sent to a different provider or address.
   */
  function keyFor(settings) {
    if (settings.key) return settings.key;
    const stored = read();
    if (!stored?.encryptedKey) throw new Error('请填写 API Key。');
    if (stored.provider !== settings.provider || stored.baseUrl !== settings.baseUrl) {
      throw new Error('更换服务商或接口地址后，需要重新填写 API Key。');
    }
    const { key, error } = decrypt(stored);
    if (!key) throw new Error(error || '请填写 API Key。');
    return key;
  }

  return {
    /** What the settings page may see: never the key itself. */
    view() {
      const stored = read();
      const encryption = safeStorage.isEncryptionAvailable();
      if (!stored?.provider) return { configured: false, skipped: !!stored?.skipped, encryption, providers: PROVIDERS };
      const { key, error } = decrypt(stored);
      return {
        configured: !!key,
        skipped: !!stored.skipped,
        encryption,
        providers: PROVIDERS,
        provider: stored.provider,
        model: stored.model,
        baseUrl: stored.baseUrl,
        keyHint: key ? `…${key.slice(-4)}` : '',
        keyError: error || '',
        updatedAt: stored.updatedAt,
      };
    },

    /** Whether the first-run setup page should be shown. */
    needsSetup() {
      const stored = read();
      return !stored?.encryptedKey && !stored?.skipped;
    },

    skip() {
      write({ ...(read() ?? {}), skipped: true });
    },

    save(input) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('系统钥匙串不可用，无法加密保存 API Key。');
      const settings = normalize(input);
      const key = keyFor(settings);
      write({
        version: 1,
        provider: settings.provider,
        model: settings.model,
        baseUrl: settings.baseUrl,
        encryptedKey: safeStorage.encryptString(key).toString('base64'),
        skipped: false,
        updatedAt: new Date().toISOString(),
      });
    },

    /** Decrypted settings for the local server, or null when nothing usable is saved. */
    resolve() {
      const stored = read();
      if (!stored?.provider || !PROVIDERS[stored.provider] || !stored.baseUrl || !stored.model) return null;
      const { key } = decrypt(stored);
      if (!key) return null;
      return { provider: stored.provider, model: stored.model, baseUrl: stored.baseUrl, key };
    },

    /** Send a tiny request and explain the outcome: ok, auth, balance, network, model, rate, server, other. */
    async test(input) {
      let settings;
      let key;
      try {
        settings = normalize(input);
        key = keyFor(settings);
      } catch (error) {
        return { ok: false, kind: 'input', message: error.message };
      }
      const preset = PROVIDERS[settings.provider];
      const url = `${settings.baseUrl}/chat/completions`;
      let response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: settings.model,
            messages: [{ role: 'user', content: '你好' }],
            stream: false,
            max_tokens: 1,
            ...preset.options,
          }),
          signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
        });
      } catch (error) {
        const timeout = error?.name === 'TimeoutError';
        return {
          ok: false,
          kind: 'network',
          message: timeout
            ? `网络异常：连接 ${new URL(url).host} 超时，请检查网络或代理后重试。`
            : `网络异常：无法连接 ${new URL(url).host}，请检查网络或代理后重试。`,
        };
      }
      const body = await response.text().catch(() => '');
      return classify(response.status, body, settings.provider === 'custom' ? '服务商' : preset.name);
    },
  };
}

/** Map an HTTP result of a chat completion to a user-facing explanation. */
function classify(status, body, name) {
  const text = String(body).slice(0, 2000);
  const balance = /insufficient[_ ]?(balance|quota|funds)|balance|余额|欠费|arrear|quota/i.test(text);
  if (status >= 200 && status < 300) {
    try {
      const payload = JSON.parse(text);
      if (Array.isArray(payload?.choices)) return { ok: true, kind: 'ok', message: `连接成功，${name}可以正常使用。` };
    } catch {}
    return { ok: false, kind: 'other', message: `${name}返回了无法识别的内容，请检查接口地址。` };
  }
  if (status === 402 || (balance && [400, 403, 429].includes(status))) {
    return { ok: false, kind: 'balance', message: `余额不足：${name}账户余额不足或额度已用完，请充值后重试。` };
  }
  if (status === 401 || status === 403) {
    return { ok: false, kind: 'auth', message: `API Key 错误：${name}拒绝了这个 Key，请检查是否填错、已删除或已过期。` };
  }
  if (status === 404 || (status === 400 && /model/i.test(text))) {
    return { ok: false, kind: 'model', message: `模型不可用：${name}找不到这个模型，请检查模型名称${status === 404 ? '或接口地址' : ''}。` };
  }
  if (status === 429) return { ok: false, kind: 'rate', message: `${name}当前请求过于频繁，请稍后再试。` };
  if (status >= 500) return { ok: false, kind: 'server', message: `${name}服务暂时不可用（HTTP ${status}），请稍后再试。` };
  return { ok: false, kind: 'other', message: `${name}请求失败（HTTP ${status}）。` };
}

module.exports = { createAiConfig, classify, PROVIDERS };
