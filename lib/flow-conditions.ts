// 流年问题的核对清单：问某年的事业、财运、感情时，列出该年相关流年宫叠到的本命宫、主星、流曜，
// 以及落入这些宫的流年四化和大限四化。不打分，只用来按这些条件查书，并交给 AI 逐条对照书上判法。

/** general：问某年要注意什么、运势如何时，六个宫一起核对。 */
type Topic = 'wealth' | 'marriage' | 'career' | 'general';

const FLOW_PALACES: Record<Topic, string[]> = {
  career: ['官禄宫', '命宫', '迁移宫'],
  wealth: ['财帛宫', '田宅宫', '命宫'],
  marriage: ['夫妻宫', '命宫'],
  general: ['命宫', '疾厄宫', '迁移宫', '官禄宫', '财帛宫', '夫妻宫'],
};

// 流曜名换成书上常用的星名，便于检索。
const FLOW_STAR_NAMES: Record<string, string> = {
  流羊: '擎羊', 流陀: '陀罗', 流禄: '禄存', 流魁: '天魁', 流钺: '天钺', 流昌: '文昌', 流曲: '文曲',
  流鸾: '红鸾', 流喜: '天喜', 流马: '天马',
};

type FocusedYear = { year: number; palaces: { name: string; natalPalace?: string; flowStars: string[] }[] };
type SiHua = { change: string; star: string; natalPalaces?: string[] };
type FlowYear = { year: number; siHua?: SiHua[]; daXian?: { palaceName?: string; startAge?: number; endAge?: number; siHua?: SiHua[] } };
type PalaceSummary = { name: string; majorStars?: string[]; borrowedStars?: string[] };
type NatalPalace = { name?: string; stars?: { name: string }[] };

const SHA = ['擎羊', '陀罗', '火星', '铃星', '地空', '地劫'];
const PEACH = ['红鸾', '天喜', '天姚', '咸池'];

const short = (name: string) => name.replace(/宫$/, '') || name;

export function buildFlowConditions(topic: Topic, stableJson: string, dynamicJson: string) {
  const stable = JSON.parse(stableJson) as { liunian?: FlowYear[]; palaces?: NatalPalace[] };
  const dynamic = JSON.parse(dynamicJson) as { focusedFlowYears?: FocusedYear[]; palaceSummary?: PalaceSummary[] };
  const focused = dynamic.focusedFlowYears?.[0];
  if (!focused) return null;
  const flow = stable.liunian?.find(item => item.year === focused.year);
  const lines: string[] = [];
  const terms: string[] = [];
  for (const flowPalace of FLOW_PALACES[topic]) {
    const entry = focused.palaces.find(palace => palace.name === flowPalace);
    if (!entry?.natalPalace) continue;
    const natal = dynamic.palaceSummary?.find(palace => palace.name === entry.natalPalace);
    const majors = natal?.majorStars?.length ? natal.majorStars : natal?.borrowedStars ?? [];
    const borrowed = !natal?.majorStars?.length && majors.length > 0;
    const stars = entry.flowStars.filter(star => FLOW_STAR_NAMES[star]);
    const inPalace = (list?: SiHua[]) => (list ?? []).filter(item => item.natalPalaces?.includes(entry.natalPalace!));
    const yearly = inPalace(flow?.siHua).map(item => `流年${item.star}化${item.change}`);
    const decade = inPalace(flow?.daXian?.siHua).map(item => `大限${item.star}化${item.change}`);
    // 叠到的本命宫里的煞星，问感情时再加桃花星：判断吉凶和桃花强弱要看它们，不能只看主星。
    const natalStars = (stable.palaces?.find(palace => palace.name === entry.natalPalace)?.stars ?? []).map(star => star.name);
    const sha = natalStars.filter(name => SHA.includes(name));
    const peach = topic === 'marriage' ? natalStars.filter(name => PEACH.includes(name)) : [];
    lines.push(`${focused.year}年流年${flowPalace}叠本命${short(entry.natalPalace)}宫：主星${majors.length ? `${borrowed ? '（空宫借）' : ''}${majors.join('、')}` : '无'}；本命煞星${sha.length ? sha.join('、') : '无'}；${topic === 'marriage' ? `本命桃花星${peach.length ? peach.join('、') : '无'}；` : ''}流曜${stars.length ? stars.join('、') : '无'}；${[...yearly, ...decade].length ? [...yearly, ...decade].join('、') : '无流年或大限四化落入'}`);
    terms.push(`流年${short(flowPalace)}`, ...majors, ...stars.map(star => FLOW_STAR_NAMES[star]),
      ...[...inPalace(flow?.siHua), ...inPalace(flow?.daXian?.siHua)].map(item => `化${item.change}入${short(flowPalace)}`));
  }
  if (!lines.length) return null;
  return { year: focused.year, lines, query: [...new Set(terms)].join(' ') };
}
