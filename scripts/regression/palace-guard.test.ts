import assert from 'node:assert/strict';
import { validateNatalBranches } from '../../lib/palace-guard';
import { streamDeepSeek } from '../../lib/deepseek-stream';
import { consumeSseText } from '../../lib/ai-stream';

async function main() {
  const palaces = [{ name: '财帛', branchName: '午' }, { name: '官禄', branchName: '寅' }];
  assert.deepEqual(validateNatalBranches('本命财帛宫在辰。', palaces), ['本命财帛宫应在午，不是辰']);
  assert.deepEqual(validateNatalBranches('本命财帛宫在午；流年财帛宫在辰。', palaces), []);
  assert.deepEqual(validateNatalBranches('本命底子：财帛宫在戌。', palaces), ['本命财帛宫应在午，不是戌']);
  assert.deepEqual(validateNatalBranches('本命底子：财帛宫在午；流年财帛宫在辰。', palaces), []);
  assert.deepEqual(validateNatalBranches('本命财帛宫在午。2028年财帛宫在辰。', palaces), []);
  const previousFetch = global.fetch;
  const previousProvider = process.env.AI_PROVIDER;
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.AI_PROVIDER = 'deepseek';
  process.env.DEEPSEEK_API_KEY = 'test-only';
  let calls = 0;
  global.fetch = async () => {
    calls++;
    const text = calls === 1 ? '本命财帛宫在辰。' : '本命财帛宫在午。';
    return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`);
  };
  try {
    const response = await streamDeepSeek([{ role: 'user', content: '测试' }], new AbortController().signal, [], [], text => validateNatalBranches(text, palaces));
    let answer = '';
    await consumeSseText(response, text => { answer += text; });
    assert.equal(calls, 2);
    assert.equal(answer, '本命财帛宫在午。');
    calls = 0;
    global.fetch = async () => { calls++; return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: '本命财帛宫在辰。' } }] })}\n\ndata: [DONE]\n\n`); };
    const failure = await streamDeepSeek([{ role: 'user', content: '测试' }], new AbortController().signal, [], [], text => validateNatalBranches(text, palaces));
    let final = '';
    await consumeSseText(failure, text => { final += text; });
    assert.equal(calls, 3);
    assert.match(final, /本命财帛宫在辰/);
    assert.match(final, /两次修改/);
  } finally {
    global.fetch = previousFetch;
    if (previousProvider === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = previousProvider;
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = previousKey;
  }
  console.log('Palace validation and retry passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
