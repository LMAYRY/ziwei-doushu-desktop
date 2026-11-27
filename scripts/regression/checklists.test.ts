import assert from 'node:assert/strict';
import nodeModule from 'node:module';

// chart-context 间接引用了 `server-only`（Next 构建时才有），解析成空模块，因此下面用动态 import。
type HookResult = { url?: string; format?: string; source?: string; shortCircuit?: boolean };
const { registerHooks } = nodeModule as unknown as {
  registerHooks(hooks: {
    resolve(specifier: string, context: unknown, next: (s: string, c: unknown) => HookResult): HookResult;
    load(url: string, context: unknown, next: (u: string, c: unknown) => HookResult): HookResult;
  }): void;
};
const STUB = 'data:text/javascript,';
registerHooks({
  resolve: (specifier, context, next) => specifier === 'server-only' ? { url: STUB, shortCircuit: true } : next(specifier, context),
  load: (url, context, next) => url === STUB ? { format: 'commonjs', source: '', shortCircuit: true } : next(url, context),
});

async function main() {
  const { generateChart } = await import('../../lib/ziwei/algorithm');
  const { buildChartContext, buildChartContextParts } = await import('../../lib/chart-context');
  const { buildFlowConditions } = await import('../../lib/flow-conditions');
  type Checklist = { topic: string; lines: string[]; queries: string[] };
  const checklistsOf = (birth: Record<string, unknown>) =>
    JSON.parse(buildChartContext(generateChart(birth as never), '') ?? 'null').checklists as Record<string, Checklist | null> | null;

  // 只列盘面事实（含庙旺利陷），不打分、不定档：定档交给 AI 依书判断。
  const lists = checklistsOf({ year: 2020, month: 3, day: 5, hour: 4, gender: 'male' })!;
  const wealth = lists.wealth!;
  assert.equal(wealth.topic, '财富');
  assert.match(wealth.lines[0], /^财帛宫（未）：主星 天相得；/);
  assert.match(wealth.lines[0], /煞星 [^；]*地空/);
  assert.match(wealth.lines[0], /煞星 [^；]*陀罗/);
  assert.ok(wealth.lines.some(line => /^命宫（亥）：主星 空宫，借对宫廉贞陷、贪狼陷/.test(line)));
  assert.ok(wealth.lines.some(line => line.startsWith('子女宫（对宫冲照）：生年天同化忌')));
  assert.deepEqual(wealth.queries.slice(0, 2).map(query => query.split(' ').slice(0, 2).join(' ')), ['天相 财帛宫', '天同 天梁']);
  // 第三条检索词按书上的飞化写法，清单里也列出主宫的禄、忌飞化。
  assert.match(wealth.queries[2], /^财帛化禄入\S+ 财帛化忌入\S+ 飞化$/);
  assert.ok(wealth.lines.some(line => /^飞化 财帛宫（\S干）：化禄 \S+入\S+宫；化忌 \S+入\S+宫、冲\S+/.test(line)));
  for (const list of Object.values(lists)) {
    // 财富、姻缘、事业至少三个宫；六亲（父母、兄弟姐妹、子女）是本宫加命宫。
    assert.ok(list && list.lines.length >= 2);
    assert.ok(list.lines.every(line => !/分|档|偏强|偏弱|较强|较弱/.test(line)), '清单里不能有评分或结论');
  }
  assert.match(lists.marriage!.lines[0], /^夫妻宫/);
  assert.match(lists.career!.lines[0], /^官禄宫/);
  // 六亲：检索词以本宫主星 + 宫名开头，好查到书上「某星入某六亲宫」的判法。
  for (const [key, palace] of [['parents', '父母宫'], ['siblings', '兄弟宫'], ['children', '子女宫']] as const) {
    assert.match(lists[key]!.lines[0], new RegExp(`^${palace}`));
    assert.ok(lists[key]!.queries[0].includes(palace), `${key} 的检索词要带宫名`);
  }

  // 流年核对清单（虚构命例 1992-04-17 卯时男）：2026 年流年官禄宫叠本命子女宫（廉贞、天府），有流年廉贞化忌、大限廉贞化禄。
  const parts = buildChartContextParts(generateChart({ year: 1992, month: 4, day: 17, hour: 3, gender: 'male' } as never), '2026年适合跳槽吗')!;
  const career = buildFlowConditions('career', parts.stable, parts.dynamic)!;
  assert.equal(career.year, 2026);
  assert.match(career.lines[0], /^2026年流年官禄宫叠本命子女宫：主星廉贞、天府/);
  assert.match(career.lines[0], /流年廉贞化忌、大限廉贞化禄/);
  assert.ok(career.query.includes('擎羊'), '流羊换成书上的擎羊');
  const marriage = buildFlowConditions('marriage', parts.stable, parts.dynamic)!;
  assert.match(marriage.lines[0], /^2026年流年夫妻宫叠本命田宅宫：主星七杀/);

  // 时辰不详时宫位不可靠，不给清单。
  assert.equal(checklistsOf({ year: 2003, month: 12, day: 3, hour: 0, unknownTime: true, gender: 'male' }), null);
  console.log('checklists: ok');
}

main().catch(error => { console.error(error); process.exit(1); });
