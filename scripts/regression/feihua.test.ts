// 宫干飞化：宫干按寅首起（五虎遁），化星落宫、冲宫、自化都要对。
import assert from 'node:assert/strict';
import { generateChart } from '../../lib/ziwei/algorithm';
import { allFeiHua, feiHuaOf, feiHuaQuery } from '../../lib/ziwei/feihua';

// 虚构命例 1995-03-12 巳时女：乙亥年，寅宫戊干。
const chart = generateChart({ year: 1995, month: 3, day: 12, hour: 5, unknownTime: false, gender: 'female', leapMonthPolicy: 'split' } as never);
const palaces = chart.palaces as never as Parameters<typeof allFeiHua>[0];
const lines = allFeiHua(palaces);
assert.equal(lines.length, 12);
assert.ok(lines.includes('财帛宫（壬干）：化禄 天梁入夫妻宫；化权 紫微入田宅宫；化科 左辅入疾厄宫；化忌 武曲入兄弟宫、冲仆役宫'));
assert.ok(lines.some(line => line.startsWith('迁移宫（庚干）') && line.includes('化科 太阴在本宫（自化科）')));
assert.ok(lines.some(line => line.startsWith('疾厄宫（辛干）') && line.includes('化忌 文昌在本宫（自化忌）')));
const parents = palaces.find(palace => palace.name?.startsWith('父母'))!;
assert.equal(feiHuaQuery(parents, palaces), '父母化禄入迁移 父母化忌入财帛');
// 每个宫的四化都能在盘上找到落宫（十四主星和左右昌曲都在盘上）。
for (const palace of palaces) assert.ok(feiHuaOf(palace, palaces).every(item => item.to), palace.name);
console.log('feihua: ok');

// 回答核对：说错的飞化要拦下，书上条件「本盘不满足」的说法不拦。
import { validateFeiHuaClaims } from '../../lib/ziwei/feihua';
const wrong = '按飞星派的说法，父母化禄入兄弟，等于父母化禄入“父之夫妻”，主父母感情良好。';
assert.deepEqual(validateFeiHuaClaims(wrong, palaces), ['父母宫宫干化禄（太阴）实际入迁移宫，不是入兄弟宫']);
assert.deepEqual(validateFeiHuaClaims('财帛宫（壬干）化忌武曲入兄弟宫、冲仆役宫，钱财容易流向手足。', palaces), []);
assert.deepEqual(validateFeiHuaClaims('书上说父母化禄入兄弟主感情良好，本盘父母化禄入迁移，不满足这一条。', palaces), []);
assert.deepEqual(validateFeiHuaClaims('生年化禄入命宫，大限化忌入夫妻。', palaces), []);
console.log('feihua guard: ok');
