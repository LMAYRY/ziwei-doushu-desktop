// 宫干飞化（飞星派）：每个宫按自己的宫干化出禄、权、科、忌，看化星落在哪个宫（飞入）、冲哪个宫（对宫），
// 化星就在本宫的叫「自化」。只列事实，不判吉凶；判法由 AI 对照检索到的飞星书籍（如《四化泄天机》
// 《飞星紫微斗数·四化专论》《斗数四化断诀》）自己核对。

import { SI_HUA_TABLE, STEMS } from './constants';

type FStar = { name: string };
export type FPalace = { name?: string; branch?: number; stem?: number; stars: FStar[] };

const HUA = ['禄', '权', '科', '忌'] as const;
export type Hua = typeof HUA[number];
export type FeiHua = { hua: Hua; star: string; to?: string; chong?: string; self: boolean };

/** 宫名统一成书上常用的写法：「命宫」保留，其余去掉「宫」字（父母、兄弟、官禄……）。 */
export const palaceShort = (name = '') => {
  const value = name.replace(/宫$/, '') || name;
  return value === '命' ? '命宫' : value;
};
const withGong = (name: string) => (name === '命宫' ? name : `${name}宫`);

/** 某个宫的宫干四化：化星落在哪个宫、冲哪个宫。宫干缺失或化星不在盘上时对应项没有 to。 */
export function feiHuaOf(palace: FPalace, palaces: FPalace[]): FeiHua[] {
  const table = palace.stem === undefined ? undefined : SI_HUA_TABLE[palace.stem];
  if (!table) return [];
  return HUA.map((hua, index) => {
    const star = table[index];
    const target = palaces.find(entry => entry.stars.some(item => item.name === star));
    const opposite = target?.branch === undefined ? undefined
      : palaces.find(entry => entry.branch === (target.branch! + 6) % 12);
    return {
      hua,
      star,
      to: target ? palaceShort(target.name) : undefined,
      chong: opposite ? palaceShort(opposite.name) : undefined,
      self: target === palace,
    };
  });
}

/** 一行文字：「父母宫（甲干）：化禄 廉贞入官禄宫；……化忌 太阳入仆役宫、冲兄弟宫」。 */
export function describeFeiHua(palace: FPalace, palaces: FPalace[], only?: Hua[]): string | null {
  const items = feiHuaOf(palace, palaces).filter(item => !only || only.includes(item.hua));
  if (!items.length) return null;
  const name = palaceShort(palace.name);
  const stem = palace.stem === undefined ? '' : STEMS[palace.stem];
  const parts = items.map(item => {
    if (!item.to) return `化${item.hua} ${item.star}不在盘上`;
    if (item.self) return `化${item.hua} ${item.star}在本宫（自化${item.hua}）`;
    return `化${item.hua} ${item.star}入${withGong(item.to)}${item.hua === '忌' && item.chong ? `、冲${withGong(item.chong)}` : ''}`;
  });
  return `${withGong(name)}（${stem}干）：${parts.join('；')}`;
}

/** 十二宫的宫干飞化，命宫在前，按盘上宫序。 */
export function allFeiHua(palaces: FPalace[]): string[] {
  return palaces.flatMap(palace => describeFeiHua(palace, palaces) ?? []);
}

/** 检索词：按书上的写法「财帛化忌入田宅」「父母化禄入兄弟」，只取禄、忌。 */
export function feiHuaQuery(palace: FPalace, palaces: FPalace[]): string {
  const name = palaceShort(palace.name);
  return feiHuaOf(palace, palaces)
    .filter(item => (item.hua === '禄' || item.hua === '忌') && item.to)
    .map(item => (item.self ? `${name}自化${item.hua}` : `${name}化${item.hua}入${item.to}`))
    .join(' ');
}

// ─── 回答核对：回答里说「某宫化禄（化忌……）入某宫」时，必须和本盘宫干飞化一致 ───
// 只核对肯定的说法；同一句里有「不满足、不是、并非、不成立、没有、不能套用」等否定词的（多半是在说书上的条件本盘不符），不核对。
const NAMES = '命宫|命|兄弟|兄友|夫妻|子女|财帛|疾厄|迁移|仆役|交友|奴仆|官禄|事业|田宅|福德|父母';
const NORMAL: Record<string, string> = { 命: '命宫', 兄友: '兄弟', 交友: '仆役', 奴仆: '仆役', 事业: '官禄' };
const norm = (name: string) => NORMAL[name] ?? name;
const NEGATION = /不满足|不是|并非|不成立|没有|不能套用|不适用|不符|而非|不同于|假如|如果|若是/;
const CLAIM = new RegExp(
  `(?<!生年|大限|流年)(${NAMES})(?:宫)?(?:（[甲乙丙丁戊己庚辛壬癸]干）|[甲乙丙丁戊己庚辛壬癸]干|宫干)?` +
  `化(禄|权|科|忌)(?:[\\u4e00-\\u9fa5]{1,3}?)?(?:飞入|落入|落在|进入|入)(${NAMES})(?:宫)?`, 'g');

export function validateFeiHuaClaims(text: string, palaces: FPalace[]): string[] {
  const byName = new Map(palaces.map(palace => [palaceShort(palace.name), palace]));
  const issues = new Set<string>();
  for (const sentence of text.split(/[。！？；\n]/)) {
    if (NEGATION.test(sentence)) continue;
    for (const match of sentence.matchAll(CLAIM)) {
      const from = norm(match[1]);
      const hua = match[2] as Hua;
      const to = norm(match[3]);
      const palace = byName.get(from);
      if (!palace || from === to) continue;
      const fact = feiHuaOf(palace, palaces).find(item => item.hua === hua);
      if (!fact?.to || fact.to === to) continue;
      issues.add(`${withGong(from)}宫干化${hua}（${fact.star}）实际入${withGong(fact.to)}，不是入${withGong(to)}`);
    }
  }
  return [...issues];
}
