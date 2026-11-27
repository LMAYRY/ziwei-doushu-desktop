import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { AI_SETUP_HINT, providerFromSettings, resolveAiProvider } from '../../lib/ai-provider';

// electron/ai-config.js only touches Electron's safeStorage inside its functions, so its pure
// error classifier can be loaded under plain Node.
const { classify } = createRequire(import.meta.url)('../../electron/ai-config.js') as {
  classify(status: number, body: string, name: string): { ok: boolean; kind: string };
};

// Presets fix the URL; a saved custom address is only used for the custom provider.
const deepseek = providerFromSettings({ provider: 'deepseek', model: 'deepseek-flash', baseUrl: 'http://evil.test', key: 'sk-a' });
assert.equal(deepseek?.url, 'https://api.deepseek.com/chat/completions');
assert.deepEqual(deepseek?.options, { thinking: { type: 'disabled' } });
assert.equal(providerFromSettings({ provider: 'siliconflow', model: 'm', baseUrl: '', key: 'k' })?.url, 'https://api.siliconflow.cn/v1/chat/completions');
assert.equal(providerFromSettings({ provider: 'custom', model: 'm', baseUrl: 'http://127.0.0.1:9/v1/', key: 'k' })?.url, 'http://127.0.0.1:9/v1/chat/completions');
assert.equal(providerFromSettings({ provider: 'custom', model: 'm', baseUrl: 'file:///etc', key: 'k' }), null);
assert.equal(providerFromSettings({ provider: 'deepseek', model: 'm', baseUrl: '', key: '' }), null);
assert.equal(providerFromSettings({ provider: 'nope', model: 'm', baseUrl: '', key: 'k' }), null);
assert.equal(providerFromSettings(null), null);

// Test-connection outcomes.
const kind = (status: number, body = '') => classify(status, body, 'X').kind;
assert.equal(kind(200, '{"choices":[]}'), 'ok');
assert.equal(kind(200, 'not json'), 'other');
assert.equal(kind(401), 'auth');
assert.equal(kind(403, '{"message":"Invalid token"}'), 'auth');
assert.equal(kind(402, '{"error":{"message":"Insufficient Balance"}}'), 'balance');
assert.equal(kind(403, '{"code":30001,"message":"Sorry, your account balance is insufficient"}'), 'balance');
assert.equal(kind(429, '{"error":{"code":"insufficient_quota"}}'), 'balance');
assert.equal(kind(429), 'rate');
assert.equal(kind(404), 'model');
assert.equal(kind(400, '{"error":{"message":"Model Not Exist"}}'), 'model');
assert.equal(kind(503), 'server');

async function main() {
const saved = { ...process.env };
const parentPort = Object.getOwnPropertyDescriptor(process, 'parentPort');
try {
  // Development: environment variables.
  delete process.env.ZIWEI_DESKTOP;
  process.env.AI_PROVIDER = 'siliconflow';
  process.env.SILICONFLOW_API_KEY = ' sk-env ';
  delete process.env.SILICONFLOW_MODEL;
  let result = await resolveAiProvider();
  assert.ok(result.ok);
  assert.equal(result.provider.key, 'sk-env');
  assert.equal(result.provider.model, 'deepseek-ai/DeepSeek-V4.1-Flash');
  delete process.env.SILICONFLOW_API_KEY;
  result = await resolveAiProvider();
  assert.ok(!result.ok && /硅基流动 API Key/.test(result.error));
  process.env.AI_PROVIDER = 'other';
  assert.equal((await resolveAiProvider()).ok, false);

  // Desktop: asks the Electron main process over the parent port, ignoring env keys.
  process.env.ZIWEI_DESKTOP = '1';
  process.env.AI_PROVIDER = 'deepseek';
  process.env.DEEPSEEK_API_KEY = 'sk-env-must-not-be-used';
  let reply: unknown = { provider: 'deepseek', model: 'deepseek-flash', baseUrl: 'https://api.deepseek.com', key: 'sk-user' };
  const listeners: Array<(event: { data: unknown }) => void> = [];
  const asked: unknown[] = [];
  Object.defineProperty(process, 'parentPort', {
    configurable: true,
    value: {
      on: (_event: string, listener: (event: { data: unknown }) => void) => listeners.push(listener),
      postMessage(message: { id: number }) {
        asked.push(message);
        // Unrelated messages and other ids are ignored.
        setImmediate(() => listeners.forEach(listener => {
          listener({ data: { type: 'other', id: message.id } });
          listener({ data: { type: 'ai-config', id: message.id + 1000, config: null } });
          listener({ data: { type: 'ai-config', id: message.id, config: reply } });
        }));
      },
    },
  });
  result = await resolveAiProvider();
  assert.ok(result.ok);
  assert.equal(result.provider.key, 'sk-user');
  assert.equal(result.provider.url, 'https://api.deepseek.com/chat/completions');
  reply = null;
  assert.deepEqual(await resolveAiProvider(), { ok: false, error: AI_SETUP_HINT });
  assert.equal(listeners.length, 1, 'the port listener is installed once');
  assert.equal(asked.length, 2);
} finally {
  process.env = saved;
  if (parentPort) Object.defineProperty(process, 'parentPort', parentPort);
  else delete (process as unknown as { parentPort?: unknown }).parentPort;
}

}

main().then(() => console.log('ai-provider: ok'), error => {
  console.error(error);
  process.exit(1);
});
