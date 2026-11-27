import { getHoroscopeStar } from 'iztro/lib/star/horoscopeStar';
import { BRANCHES, PALACE_NAMES_ORDER, STEMS } from './constants';
import { getYearBranchIndex, getYearStemIndex } from './sihua';

/** 各流年宫按命、兄弟、夫妻等顺序返回地支索引。农历流年以年支所在宫起命。 */
export function getAnnualPalaceBranches(year: number): number[] {
  const ming = getYearBranchIndex(year);
  return PALACE_NAMES_ORDER.map((_, index) => (ming - index + 12) % 12);
}

/** iztro 流曜数组从寅宫起；转换为项目使用的子宫起地支索引。 */
export function getAnnualStars(year: number): Array<{ branch: number; stars: string[] }> {
  const stem = STEMS[getYearStemIndex(year)] as Parameters<typeof getHoroscopeStar>[0];
  const branch = BRANCHES[getYearBranchIndex(year)] as Parameters<typeof getHoroscopeStar>[1];
  return getHoroscopeStar(stem, branch, 'yearly').flatMap((stars, index) =>
    stars.length ? [{ branch: (index + 2) % 12, stars: stars.map(star => star.name) }] : [],
  );
}
