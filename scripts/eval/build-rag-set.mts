// RAG 测评集草稿生成器（不调用 AI）。
// 检索部分：从一批命盘的核对清单里取检索词（主星组合 + 宫名 + 四化 + 煞星），按「宫位 + 主星组合」去重后选题，
//   每题跑一次 retrieveClassics，列出候选书页并自动初判：片段里同一处同时出现该宫位和全部主星 → 很可能对口；
//   只出现宫位和部分主星 → 待定；否则 → 不相关。初判只是为了减少人工标注量，最终以人工确认为准。
// 回答部分：16 位名人 × 好坏各一年（结果已知），作为「区分度」测评的题目。
// 用法：npx tsx scripts/eval/build-rag-set.mts <名人命例 json> <输出目录>
// 输出：retrieval.json、answers.json（数据集，以此为准）以及同名 CSV（浏览用）。
import nodeModule from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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

const [casesPath, outDir] = process.argv.slice(2);
const { generateChart } = await import('../../lib/ziwei/algorithm');
const { buildChartContext } = await import('../../lib/chart-context');
const { retrieveClassics, normalize } = await import('../../lib/classics/retrieval');
const { withoutAuthors } = await import('../../lib/classics/citation');

const MAJORS = ['紫微', '天机', '太阳', '武曲', '天同', '廉贞', '天府', '太阴', '贪狼', '巨门', '天相', '天梁', '七杀', '破军'];
const TOPICS: Record<string, string> = { wealth: '财富', marriage: '姻缘', career: '事业', parents: '父母', siblings: '兄弟姐妹', children: '子女' };

// 一批固定的虚构生辰（可复现），覆盖不同年份、月份、时辰和性别。
const births = Array.from({ length: 80 }, (_, i) => ({
  year: 1950 + ((i * 7) % 55), month: 1 + ((i * 5) % 12), day: 1 + ((i * 11) % 28),
  hour: (i * 3) % 12, gender: i % 2 ? 'female' : 'male',
}));

type Query = { query: string; topic: string; palace: string; stars: string[] };
const byKey = new Map<string, Query>();
for (const birth of births) {
  const ctx = JSON.parse(buildChartContext(generateChart(birth as never), '') ?? 'null');
  for (const [topic, list] of Object.entries((ctx?.checklists ?? {}) as Record<string, { queries: string[] } | null>)) {
    for (const query of (list?.queries ?? []).slice(0, 2)) {
      if (query.includes('飞化')) continue;
      const words = query.split(' ');
      const palace = words.find(word => word.endsWith('宫')) ?? '';
      const stars = words.filter(word => MAJORS.includes(word));
      if (!palace || !stars.length) continue;
      const key = `${palace}|${[...stars].sort().join('')}`;
      if (!byKey.has(key)) byKey.set(key, { query, topic: TOPICS[topic] ?? topic, palace, stars });
    }
  }
}

// 选题：每个宫位轮流取，尽量覆盖不同宫位和不同主星，最多 48 题。
const pools = new Map<string, Query[]>();
for (const item of byKey.values()) pools.set(item.palace, [...(pools.get(item.palace) ?? []), item]);
const picked: Query[] = [];
const seenStars = new Map<string, number>();
while (picked.length < 48 && [...pools.values()].some(pool => pool.length)) {
  for (const pool of pools.values()) {
    if (!pool.length || picked.length >= 48) continue;
    pool.sort((a, b) => a.stars.reduce((n, s) => n + (seenStars.get(s) ?? 0), 0) - b.stars.reduce((n, s) => n + (seenStars.get(s) ?? 0), 0));
    const item = pool.shift()!;
    picked.push(item);
    item.stars.forEach(star => seenStars.set(star, (seenStars.get(star) ?? 0) + 1));
  }
}

function judge(text: string, palace: string, stars: string[]) {
  const plain = normalize(text);
  const short = palace === '命宫' ? '命宫' : palace.replace(/宫$/, '');
  // 书上的别名：中州派把官禄宫叫事业宫，仆役宫也叫交友宫。
  const names = [short, ...({ 官禄: ['事业'], 仆役: ['交友', '奴仆'] } as Record<string, string[]>)[short] ?? []];
  const at = names.flatMap(name => [...plain.matchAll(new RegExp(name, 'g'))].map(match => match.index!));
  let best = 0; let where = -1;
  for (const index of at) {
    const window = plain.slice(Math.max(0, index - 40), index + 40);
    const hits = stars.filter(star => window.includes(star)).length;
    if (hits > best) { best = hits; where = index; }
  }
  const label = best === stars.length ? '很可能对口' : best > 0 ? '待定' : '不相关';
  const excerpt = (where >= 0 ? plain.slice(Math.max(0, where - 50), where + 70) : plain.slice(0, 120)).replace(/\s+/g, '');
  return { label, excerpt };
}

// 数据集以 JSON 为准（retrieval.json、answers.json），CSV 只是方便浏览的视图。
// 人工标注：检索题把候选的 relevant 改成 true / false；回答题核对后把 verified 改成 true（不可靠的删掉）。
const now = new Date().toISOString().slice(0, 10);
type Candidate = { rank: number; book: string; page: number | null; url: string; auto_label: string; excerpt: string; relevant: boolean | null };
const retrieval: { id: string; topic: string; palace: string; stars: string[]; query: string; candidates: Candidate[] }[] = [];
for (const [index, item] of picked.entries()) {
  const hits = await retrieveClassics(item.query);
  retrieval.push({
    id: `R${String(index + 1).padStart(2, '0')}`, topic: item.topic, palace: item.palace, stars: item.stars, query: item.query,
    candidates: hits.map((hit, rank) => {
      const { label, excerpt } = judge(hit.text, item.palace, item.stars);
      return {
        rank: rank + 1, book: withoutAuthors(hit.source).split(' · ')[0], page: Number(hit.title.match(/\d+/)?.[0]) || null,
        url: hit.url, auto_label: label, excerpt, relevant: null,
      };
    }),
  });
}

const cases = JSON.parse(readFileSync(casesPath, 'utf8')) as {
  name: string; birth: string; gender: string; chart: { birthInfo: Record<string, unknown> };
  events: { year: number; valence: string; description: string }[];
}[];
const answers = cases.flatMap(person => person.events.map(event => ({
  person: person.name, birth: person.birth, gender: person.gender, birth_info: person.chart.birthInfo,
  year: event.year, outcome: event.valence, event: event.description,
  question: `${event.year}年运势如何，要注意什么？`,
  expectation: event.valence === 'good' ? '整体判断偏有利，不应主要讲凶' : '能指出该年对应领域的不利信号，不应判为偏顺',
  verified: false,
}))).map((item, index) => ({ id: `A${String(index + 1).padStart(2, '0')}`, ...item }));

const meta = (description: string) => ({ version: 1, created: now, status: 'draft', description });
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'retrieval.json'), JSON.stringify({
  ...meta('检索测评集：每题是软件实际使用的检索词（主星组合 + 宫名 + 四化 + 煞星），candidates 为检索返回的书页。auto_label 是程序初判；relevant 为人工标注（true 对口 / false 不对口 / null 未标）。对口的标准：这一页在讲该宫位里这组主星的判法。'),
  source: { charts: births.length, unique_combos: byKey.size }, items: retrieval,
}, null, 2) + '\n');
writeFileSync(join(outDir, 'answers.json'), JSON.stringify({
  ...meta('回答测评集：结果已知的命例年份，用来测好坏年份的区分度。outcome 为实际结果（good / bad）；verified 为人工核对生辰和事件后改成 true。'),
  items: answers,
}, null, 2) + '\n');

// 浏览用的 CSV（Excel / Numbers 直接打开）。
const csv = (cells: (string | number | null)[]) => cells.map(cell => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',');
writeFileSync(join(outDir, 'retrieval.csv'), '\uFEFF' + [csv(['题号', '主题', '宫位', '主星组合', '检索词', '排名', '书', '页', '自动初判', '片段摘录']),
  ...retrieval.flatMap(item => item.candidates.map(c => csv([item.id, item.topic, item.palace, item.stars.join('、'), item.query, c.rank, c.book, c.page, c.auto_label, c.excerpt])))].join('\n'));
writeFileSync(join(outDir, 'answers.csv'), '\uFEFF' + [csv(['题号', '人物', '出生', '年份', '实际', '事件', '提问', '期望']),
  ...answers.map(a => csv([a.id, a.person, a.birth, a.year, a.outcome === 'good' ? '好' : '坏', a.event, a.question, a.expectation]))].join('\n'));
console.log(JSON.stringify({ unique_combos: byKey.size, retrieval_items: retrieval.length, candidates: retrieval.reduce((n, item) => n + item.candidates.length, 0), answers: answers.length }));
