'use client';
import { useEffect, useState } from 'react';
import s from './settings.module.css';

type Preset = { name: string; baseUrl: string; defaultModel: string; models: string[]; keyUrl: string };
type ConfigView = {
  configured: boolean;
  skipped: boolean;
  encryption: boolean;
  providers: Record<string, Preset>;
  provider?: string;
  model?: string;
  baseUrl?: string;
  keyHint?: string;
  keyError?: string;
};
type Settings = { provider: string; model: string; baseUrl: string; key: string };
type TestResult = { ok: boolean; kind: string; message: string };
type DesktopApi = {
  ai: {
    getConfig(): Promise<ConfigView>;
    save(settings: Settings): Promise<{ ok: boolean; message?: string; config?: ConfigView }>;
    test(settings: Settings): Promise<TestResult>;
    skip(): Promise<{ ok: boolean }>;
  };
};

function desktopApi(): DesktopApi | undefined {
  return (window as unknown as { ziweiDesktop?: DesktopApi }).ziweiDesktop;
}

/** AI 服务设置：桌面版通过 Electron 主进程加密保存；开发模式只读环境变量。 */
export default function AiSettings() {
  const [api, setApi] = useState<DesktopApi | null | undefined>(undefined);
  const [welcome, setWelcome] = useState(false);
  const [view, setView] = useState<ConfigView | null>(null);
  const [form, setForm] = useState<Settings>({ provider: 'deepseek', model: '', baseUrl: '', key: '' });
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState<'' | 'test' | 'save'>('');

  useEffect(() => {
    const desktop = desktopApi();
    setApi(desktop ?? null);
    setWelcome(new URLSearchParams(window.location.search).has('welcome'));
    if (!desktop) return;
    desktop.ai.getConfig().then(config => {
      setView(config);
      const provider = config.provider && config.providers[config.provider] ? config.provider : 'deepseek';
      setForm({
        provider,
        model: config.model || config.providers[provider].defaultModel,
        baseUrl: config.provider === 'custom' ? config.baseUrl ?? '' : '',
        key: '',
      });
      if (config.keyError) setStatus({ ok: false, message: config.keyError });
    }).catch(() => setStatus({ ok: false, message: '读取设置失败，请重启应用后再试。' }));
  }, []);

  if (api === undefined) return null;

  if (!api) {
    return (
      <>
        <Head welcome={false} />
        <div className="wrap"><div className={s.body}>
          <p className={s.status}>当前不是桌面版。开发模式（<code>next dev</code>）从环境变量读取 AI 配置：<code>AI_PROVIDER</code>、<code>DEEPSEEK_API_KEY</code> / <code>DEEPSEEK_MODEL</code>、<code>SILICONFLOW_API_KEY</code> / <code>SILICONFLOW_MODEL</code>。</p>
        </div></div>
      </>
    );
  }

  if (!view) {
    return (
      <>
        <Head welcome={welcome} />
        <div className="wrap"><div className={s.body}>{status && <p className={`${s.status} ${s.bad}`}>{status.message}</p>}</div></div>
      </>
    );
  }

  const preset = view.providers[form.provider];
  const sameTarget = view.provider === form.provider && (form.provider !== 'custom' || view.baseUrl === form.baseUrl.trim().replace(/\/+$/, ''));
  const keepsKey = sameTarget && !!view.keyHint;
  const update = (patch: Partial<Settings>) => {
    setForm(previous => ({ ...previous, ...patch }));
    setStatus(null);
  };
  const chooseProvider = (provider: string) => update({
    provider,
    model: provider === view.provider ? view.model ?? '' : view.providers[provider].defaultModel,
    baseUrl: provider === 'custom' && view.provider === 'custom' ? view.baseUrl ?? '' : '',
    key: '',
  });

  const run = async (action: 'test' | 'save') => {
    setBusy(action);
    setStatus(null);
    try {
      if (action === 'test') {
        const result = await api.ai.test(form);
        setStatus({ ok: result.ok, message: result.message });
        return;
      }
      const result = await api.ai.save(form);
      if (!result.ok || !result.config) {
        setStatus({ ok: false, message: result.message || '保存失败。' });
        return;
      }
      setView(result.config);
      setForm(previous => ({ ...previous, key: '' }));
      if (welcome) {
        window.location.assign('/');
        return;
      }
      setStatus({ ok: true, message: '已保存。之后的单盘解读、合盘解读和追问都会使用这个 Key。' });
    } catch {
      setStatus({ ok: false, message: action === 'test' ? '测试失败，请重试。' : '保存失败，请重试。' });
    } finally {
      setBusy('');
    }
  };

  const skip = async () => {
    await api.ai.skip().catch(() => undefined);
    window.location.assign('/');
  };

  return (
    <>
      <Head welcome={welcome} />
      <div className="wrap">
      <form
        className={s.body}
        onSubmit={event => { event.preventDefault(); run('save'); }}
      >
        <fieldset className={s.row}>
          <legend className={s.label}>AI 服务商</legend>
          <div className={`seg ${s.providers}`}>
            {Object.entries(view.providers).map(([id, item]) => (
              <button key={id} type="button" aria-pressed={form.provider === id} onClick={() => chooseProvider(id)}>
                {item.name}
              </button>
            ))}
          </div>
          {preset.keyUrl && (
            <p className={s.hint}>
              在 <a href={preset.keyUrl} target="_blank" rel="noreferrer">{preset.name}控制台</a> 创建 API Key 并充值，费用由服务商直接向你收取。
            </p>
          )}
        </fieldset>

        {form.provider === 'custom' && (
          <div className={s.row}>
            <label className={s.label} htmlFor="ai-base-url">接口地址</label>
            <input
              id="ai-base-url"
              className="field"
              value={form.baseUrl}
              onChange={event => update({ baseUrl: event.target.value })}
              placeholder="https://api.example.com/v1"
              autoComplete="off"
              spellCheck={false}
            />
            <p className={s.hint}>兼容 OpenAI 格式的接口地址，程序会请求「地址 + /chat/completions」。必须是 https（本机地址除外）。</p>
          </div>
        )}

        <div className={s.row}>
          <label className={s.label} htmlFor="ai-model">模型</label>
          <input
            id="ai-model"
            className="field"
            value={form.model}
            onChange={event => update({ model: event.target.value })}
            list="ai-models"
            placeholder={preset.defaultModel || '模型名称'}
            autoComplete="off"
            spellCheck={false}
          />
          <datalist id="ai-models">
            {preset.models.map(model => <option key={model} value={model} />)}
          </datalist>
          {preset.defaultModel && <p className={s.hint}>推荐：{preset.defaultModel}</p>}
        </div>

        <div className={s.row}>
          <label className={s.label} htmlFor="ai-key">API Key</label>
          <input
            id="ai-key"
            className="field"
            type="password"
            value={form.key}
            onChange={event => update({ key: event.target.value })}
            placeholder={keepsKey ? `已保存（${view.keyHint}），不修改请留空` : '粘贴 API Key'}
            autoComplete="off"
            spellCheck={false}
          />
          <p className={s.hint}>
            {view.encryption
              ? 'Key 用系统钥匙串加密保存在本机，只发给你选择的服务商。'
              : '系统钥匙串不可用，暂时无法保存 Key。'}
            {view.keyHint && !sameTarget && ' 更换服务商或接口地址后需要重新填写 Key。'}
          </p>
        </div>

        <div className={s.actions}>
          <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => run('test')}>
            {busy === 'test' ? '正在测试…' : '测试连接'}
          </button>
          <button type="submit" className="btn-accent" disabled={!!busy || !view.encryption}>
            {busy === 'save' ? '正在保存…' : welcome ? '保存并开始' : '保存'}
          </button>
          {welcome && (
            <button type="button" className={`btn-ghost ${s.skip}`} disabled={!!busy} onClick={skip}>
              先跳过，只排盘
            </button>
          )}
        </div>

        {status && <p className={`${s.status} ${status.ok ? s.ok : s.bad}`} role="status">{status.message}</p>}

        <ul className={s.note}>
          <li>排盘、合盘、古籍阅读不需要 AI，也不联网。</li>
          <li>「测试连接」会用这个 Key 发一次很短的请求（约十几个 token）。</li>
          <li>以后可以随时在顶栏「设置」或菜单「紫微斗数 › 设置 AI…」（⌘,）里修改。</li>
        </ul>
      </form>
      </div>
    </>
  );
}

function Head({ welcome }: { welcome: boolean }) {
  return (
    <header className={s.head}>
      <div className="wrap">
        <p className={s.eyebrow}>{welcome ? '欢迎使用' : '设置'}</p>
        <h1 className={s.h1}>{welcome ? '先设置 AI 解读' : 'AI 服务'}</h1>
        <p className={s.lead}>
          AI 单盘解读、合盘解读和追问会调用你自己的 AI 服务商账户，费用由你直接支付给服务商。
          {welcome && '不设置也可以先排盘、合盘和读古籍。'}
        </p>
      </div>
    </header>
  );
}
