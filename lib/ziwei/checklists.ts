// 本命分项核对清单：财富、姻缘、事业，以及六亲（父母、兄弟姐妹、子女）各列出相关宫位的盘面事实
// （主星及庙旺利陷、空宫借星、生年四化、吉星、煞星等），不打分、不定档，也不给星曜贴吉凶标签。
// 判断由 AI 逐项对照检索到的书籍判法自己做（见 app/api/interpret/route.ts）；检索词按「主星 + 宫名」生成，
// 好让书上专讲这颗星在这个宫的段落（例如武曲入六亲宫）被查到。

export type Topic = 'wealth' | 'marriage' | 'career' | 'parents' | 'siblings' | 'children';

type CStar = { name: string; type?: string; siHua?: string; brightness?: string };
type CPalace = { name?: string; branch?: number; stem?: number; stars: CStar[]; borrowedStars?: string[] };

import { describeFeiHua, feiHuaQuery } from './feihua';

const BRANCH_NAMES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const GOOD = ['左辅', '右弼', '天魁', '天钺', '文昌', '文曲', '禄存', '天马'];
const BAD = ['擎羊', '陀罗', '火星', '铃星', '地空', '地劫'];

/** 每项看哪些宫：主看的宫在前；「对宫」只看冲照的生年四化。 */
const TOPIC_PALACES: Record<Topic, { label: string; palaces: string[]; extra?: string[]; opposite?: string[] }> = {
  wealth: { label: '财富', palaces: ['财帛', '田宅', '命宫', '官禄'], opposite: ['福德', '子女'] },
  marriage: { label: '姻缘', palaces: ['夫妻', '命宫', '福德'], extra: ['红鸾', '天喜', '孤辰', '寡宿', '天姚', '咸池'], opposite: ['官禄'] },
  career: { label: '事业', palaces: ['官禄', '命宫', '迁移', '财帛'], opposite: ['夫妻'] },
  parents: { label: '父母', palaces: ['父母', '命宫'], opposite: ['疾厄'] },
  siblings: { label: '兄弟姐妹', palaces: ['兄弟', '命宫'], opposite: ['仆役'] },
  children: { label: '子女', palaces: ['子女', '命宫'], opposite: ['田宅'] },
};

const baseName = (name = '') => {
  const value = name.replace(/宫$/, '') || name;
  return value === '命' ? '命宫' : value;
};
const withBrightness = (star: CStar) => `${star.name}${star.brightness ?? ''}`;

function describe(palace: CPalace, palaces: CPalace[], extra: string[] = []): string {
  const name = baseName(palace.name);
  const branch = palace.branch !== undefined ? BRANCH_NAMES[palace.branch] : '';
  const majors = palace.stars.filter(star => star.type === 'major');
  let mains: string;
  if (majors.length) mains = majors.map(withBrightness).join('、');
  else {
    const find = (starName: string) => palaces.flatMap(entry => entry.stars).find(star => star.name === starName);
    const borrowed = (palace.borrowedStars ?? []).map(find).filter((star): star is CStar => !!star);
    mains = borrowed.length ? `空宫，借对宫${borrowed.map(withBrightness).join('、')}` : '空宫，无可借主星';
  }
  const hua = palace.stars.filter(star => star.siHua).map(star => `${star.name}化${star.siHua}`);
  const good = palace.stars.filter(star => GOOD.includes(star.name)).map(withBrightness);
  const bad = palace.stars.filter(star => BAD.includes(star.name)).map(withBrightness);
  const others = palace.stars.filter(star => extra.includes(star.name)).map(star => star.name);
  return [
    `${name}${name === '命宫' ? '' : '宫'}（${branch}）：主星 ${mains}`,
    `生年四化 ${hua.length ? hua.join('、') : '无'}`,
    `吉星 ${good.length ? good.join('、') : '无'}`,
    `煞星 ${bad.length ? bad.join('、') : '无'}`,
    ...(others.length ? [`相关杂曜 ${others.join('、')}`] : []),
  ].join('；');
}

/** queries：主看的宫各查一次书（主星组合 + 宫名 + 四化 + 煞星），便于找到书上专讲这个组合的段落。 */
export type Checklist = { topic: string; lines: string[]; queries: string[] };

export function checklist(topic: Topic, palaces: CPalace[]): Checklist | null {
  const config = TOPIC_PALACES[topic];
  const byName = new Map(palaces.map(palace => [baseName(palace.name), palace]));
  if (!config.palaces.every(name => byName.has(name))) return null;
  const lines = config.palaces.map(name => describe(byName.get(name)!, palaces, config.extra));
  for (const name of config.opposite ?? []) {
    const hua = (byName.get(name)?.stars ?? []).filter(star => star.siHua === '禄' || star.siHua === '忌');
    if (hua.length) lines.push(`${name}宫（对宫冲照）：${hua.map(star => `生年${star.name}化${star.siHua}`).join('、')}`);
  }
  // 宫干飞化（飞星派）：主看的两个宫各列禄、忌飞到哪里、冲哪里，只是事实。
  for (const name of config.palaces.slice(0, 2)) {
    const line = describeFeiHua(byName.get(name)!, palaces, ['禄', '忌']);
    if (line) lines.push(`飞化 ${line}`);
  }
  // 检索词：主看的两个宫各一条（主星 + 宫名 + 四化 + 煞星）。
  const queries = config.palaces.slice(0, 2).map(name => {
    const palace = byName.get(name)!;
    const majors = palace.stars.filter(star => star.type === 'major').map(star => star.name);
    const mains = majors.length ? majors : palace.borrowedStars ?? [];
    return [...mains, `${name}${name === '命宫' ? '' : '宫'}`,
      ...palace.stars.filter(star => star.siHua).map(star => `${star.name}化${star.siHua}`),
      ...palace.stars.filter(star => BAD.includes(star.name)).map(star => star.name)].join(' ');
  });
  // 再按书上的飞化写法查一次（例如「父母化忌入兄弟」「财帛化禄入田宅」）。
  const fly = feiHuaQuery(byName.get(config.palaces[0])!, palaces);
  if (fly) queries.push(`${fly} 飞化`);
  return { topic: config.label, lines, queries };
}

export function allChecklists(palaces: CPalace[]) {
  return {
    wealth: checklist('wealth', palaces),
    marriage: checklist('marriage', palaces),
    career: checklist('career', palaces),
    parents: checklist('parents', palaces),
    siblings: checklist('siblings', palaces),
    children: checklist('children', palaces),
  };
}
