// A fake OpenAI-compatible chat completions server for checking the desktop AI settings without
// paying for real calls. Point the app's 「其他（OpenAI 兼容）」 provider at http://127.0.0.1:<port>/v1.
//
//   node scripts/desktop/mock-ai.mjs [port] [record.jsonl] [--prompts]
//
// --prompts also records the system prompt, to check which 资料片段 (retrieved passages) were sent.
// Keys: sk-mock-bad → 401, sk-mock-poor → 402 (余额不足), sk-mock-slow → never answers.
// Model "missing" → 404, model "drip" streams slowly. Every request is appended to record.jsonl with a sha256 of the key
// (never the key itself) so tests can prove which key was used.
import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import http from 'node:http';

const positional = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
const withPrompts = process.argv.includes('--prompts');
const port = Number(positional[0] || 8787);
const record = positional[1];

const server = http.createServer((request, response) => {
  let raw = '';
  request.on('data', chunk => { raw += chunk; });
  request.on('end', () => {
    const key = (request.headers.authorization || '').replace(/^Bearer\s+/i, '');
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch {}
    const system = body.messages?.find(message => message.role === 'system')?.content || '';
    const entry = {
      at: new Date().toISOString(),
      path: request.url,
      keySha256: createHash('sha256').update(key).digest('hex'),
      model: body.model,
      stream: !!body.stream,
      kind: body.response_format ? 'intent' : /合盘解读助手/.test(system) ? 'heming' : body.max_tokens === 1 ? 'test' : 'interpret',
    };
    if (record) appendFileSync(record, `${JSON.stringify(withPrompts ? { ...entry, system } : entry)}\n`);
    console.log(JSON.stringify(entry));
    const json = (status, value) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(value));
    };
    if (request.method !== 'POST' || !request.url.endsWith('/chat/completions')) return json(404, { error: { message: 'Not Found' } });
    if (key === 'sk-mock-slow') return;
    if (!key || key === 'sk-mock-bad') return json(401, { error: { message: 'Authentication Fails, Your api key is invalid', type: 'authentication_error' } });
    if (key === 'sk-mock-poor') return json(402, { error: { message: 'Insufficient Balance', type: 'unknown_error' } });
    if (body.model === 'missing') return json(404, { error: { message: 'Model Not Exist' } });
    if (body.response_format) {
      const question = body.messages?.at(-1)?.content || '{}';
      let query = '';
      try { query = JSON.parse(question).question || ''; } catch {}
      return json(200, { choices: [{ message: { role: 'assistant', content: JSON.stringify({ query, ambiguous: false, relationship: 'general' }) } }] });
    }
    const text = `【模拟回复】这是本地模拟服务返回的${entry.kind === 'heming' ? '合盘' : '单盘'}解读，模型 ${body.model}。`;
    if (!body.stream) return json(200, { choices: [{ message: { role: 'assistant', content: text.slice(0, body.max_tokens === 1 ? 1 : undefined) } }] });
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const pieces = text.match(/.{1,8}/gs);
    const send = piece => response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
    // Model "drip" sends one piece every 500 ms, to check that answers stream instead of arriving at once.
    if (body.model !== 'drip') {
      pieces.forEach(send);
      return response.end('data: [DONE]\n\n');
    }
    let index = 0;
    const timer = setInterval(() => {
      if (index < pieces.length) return send(pieces[index++]);
      clearInterval(timer);
      response.end('data: [DONE]\n\n');
    }, 500);
  });
});
server.listen(port, '127.0.0.1', () => console.log(`mock AI on http://127.0.0.1:${port}/v1`));
