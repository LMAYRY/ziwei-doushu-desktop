import { detectPatterns, type PatternChart } from '@/lib/ziwei/patterns';
import { getLiuNianSiHua, getSiHuaByStem } from '@/lib/ziwei/sihua';
import { BRANCHES, PALACE_NAMES_ORDER, STEMS } from '@/lib/ziwei/constants';
import { getAnnualPalaceBranches, getAnnualStars } from '@/lib/ziwei/annual-flow';
import { allChecklists } from './ziwei/checklists';
import { allFeiHua } from './ziwei/feihua';

type JsonRecord = Record<string, unknown>;

export function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

export function safeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function safeString(value: unknown, maxLength = 80): string | undefined {
  return typeof value === 'string' ? value.slice(0, maxLength) : undefined;
}

function safeBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function safeStringArray(value: unknown, maxItems = 12): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, maxItems)
    .flatMap(item => typeof item === 'string' ? [item.slice(0, 80)] : []);
}

function summarizeSiHua(value: unknown) {
  const siHua = asRecord(value);
  if (!siHua) return undefined;

  return {
    stemIndex: safeNumber(siHua.stemIndex),
    stemName: safeString(siHua.stemName, 12),
    lu: safeString(siHua.lu, 24),
    quan: safeString(siHua.quan, 24),
    ke: safeString(siHua.ke, 24),
    ji: safeString(siHua.ji, 24),
  };
}

export function requestedFlowYears(question: string, selectedYear: unknown, birthYear?: number, lastDaXianAge?: number): number[] {
  const currentYear = Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Shanghai' }).format(new Date()));
  const years = [...question.normalize('NFKC').matchAll(
    /(?<!\d)((?:18|19|20|21|22)\d{2})(?!\d)\s*(?=年|的?(?:流年|运势|财运|事业|感情|桃花))/g,
  )].map(match => Number(match[1]));
  const range = question.normalize('NFKC').match(/((?:18|19|20|21|22)\d{2})\s*年?\s*(?:到|至|[-–—~～])\s*((?:18|19|20|21|22)\d{2})\s*年?/);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (end >= start && end - start <= 120) {
      years.push(...Array.from({ length: end - start + 1 }, (_, index) => start + index));
    }
  }
  const pastCount = question.match(/(?:过去|此前|之前|最近|近)([一二三四五六七八九十\d]+)年/);
  if (pastCount) {
    const numbers: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
    const count = numbers[pastCount[1]] ?? Number(pastCount[1]);
    if (Number.isInteger(count) && count > 0 && count <= 120) {
      years.push(...Array.from({ length: count }, (_, index) => currentYear - count + 1 + index));
    }
  } else if (/从出生|出生.{0,8}(?:现在|至今|今年)|过去.{0,8}(?:经历|事件|事情|哪年|哪一年|感情|桃花|事业|财运)|以前.{0,8}(?:经历|事件|事情|哪年|哪一年|感情|桃花|事业|财运)|往年|历史流年|过往经历/.test(question)
    && Number.isInteger(birthYear) && birthYear! >= 1800 && birthYear! <= currentYear) {
    const start = Math.max(birthYear!, currentYear - 120);
    years.push(...Array.from({ length: currentYear - start + 1 }, (_, index) => start + index));
  }
  const future = question.match(/(?:未来|今后|接下来)(?:的)?([一二三四五六七八九十\d]+|几)年/);
  if (future) {
    const numbers: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 几: 3 };
    const count = numbers[future[1]] ?? Number(future[1]);
    if (Number.isInteger(count) && count > 0 && count <= 10) {
      years.push(...Array.from({ length: count }, (_, index) => currentYear + index));
    }
  }
  const relative = [['去年', -1], ['今年', 0], ['明年', 1], ['后年', 2]] as const;
  for (const [word, offset] of relative) {
    if (question.includes(word)) years.push(currentYear + offset);
  }
  const valid = (year: unknown): year is number =>
    typeof year === 'number' && Number.isInteger(year) && year >= 1800 && year <= 2200;
  if (!years.length && valid(selectedYear)) years.push(selectedYear);
  if (!years.length) years.push(currentYear);
  if (Number.isInteger(birthYear) && birthYear! >= 1800 && birthYear! <= currentYear) {
    const lastYear = Number.isInteger(lastDaXianAge) && lastDaXianAge! >= 1 && lastDaXianAge! <= 150
      ? Math.max(currentYear, Math.min(2200, birthYear! + lastDaXianAge! - 1))
      : currentYear;
    years.push(...Array.from({ length: lastYear - birthYear! + 1 }, (_, index) => birthYear! + index));
  }
  return [...new Set(years.filter(valid))].sort((a, b) => a - b);
}

export function summarizeChart(value: unknown, flowYears: number[], focusYears: number[]): string | null {
  const chart = asRecord(value);
  const birthInfo = asRecord(chart?.birthInfo);
  const lunarInfo = asRecord(chart?.lunarInfo);
  const rawPalaces = chart?.palaces;

  if (!chart || !birthInfo || !lunarInfo || !Array.isArray(rawPalaces) || rawPalaces.length !== 12) {
    return null;
  }

  const palaces = rawPalaces.flatMap(rawPalace => {
    const palace = asRecord(rawPalace);
    if (!palace) return [];

    const stars = Array.isArray(palace.stars)
      ? palace.stars.flatMap(rawStar => {
          const star = asRecord(rawStar);
          const name = safeString(star?.name, 32);
          const brightness = star?.brightness;
          const brightnessForRules: PatternChart['palaces'][number]['stars'][number]['brightness'] =
            brightness === 'bright' || brightness === 'normal' || brightness === 'dim' ? brightness : undefined;
          return name ? [{
            name,
            type: safeString(star?.type, 16),
            siHua: safeString(star?.siHua, 8),
            brightness: safeString(star?.brightnessRaw ?? brightness, 16),
            brightnessForRules,
          }] : [];
        })
      : [];

    const selfSihua = Array.isArray(palace.selfSihua)
      ? palace.selfSihua.flatMap(rawMark => {
          const mark = asRecord(rawMark);
          const starName = safeString(mark?.starName, 32);
          const siHua = safeString(mark?.siHua, 8);
          return starName && siHua ? [{ starName, siHua }] : [];
        })
      : [];

    const ageRange = Array.isArray(palace.daXianAge)
      ? palace.daXianAge.slice(0, 2).map(safeNumber)
      : undefined;

    return [{
      name: safeString(palace.name, 16),
      branch: safeNumber(palace.branch),
      stem: safeNumber(palace.stem),
      stars,
      selfSihua,
      daXianAge: ageRange,
      isMingGong: safeBoolean(palace.isMingGong),
      isShenGong: safeBoolean(palace.isShenGong),
      isCurrentDaXian: safeBoolean(palace.isCurrentDaXian),
      isEmpty: safeBoolean(palace.isEmpty),
      borrowedFromName: safeString(palace.borrowedFromName, 16),
      borrowedStars: safeStringArray(palace.borrowedStars, 8),
    }];
  });

  if (palaces.length !== 12) return null;

  const isBranch = (n: number | undefined): n is number =>
    typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < 12;
  const mingGongBranch = safeNumber(chart.mingGongBranch);
  const shenGongBranch = safeNumber(chart.shenGongBranch);
  const rulePalaces: PatternChart['palaces'] = palaces.flatMap(({ name, branch, stars }) =>
    name && isBranch(branch) ? [{
      name,
      branch,
      stars: stars.map(({ name, type, siHua, brightnessForRules }) => ({
        name, type, siHua, brightness: brightnessForRules,
      })),
    }] : [],
  );
  const unknownTime = birthInfo.unknownTime === true;
  const canMatch = !unknownTime && isBranch(mingGongBranch) && isBranch(shenGongBranch)
    && new Set(rulePalaces.map(palace => palace.branch)).size === 12;
  const matchedPatterns = canMatch
    ? detectPatterns({ mingGongBranch, shenGongBranch, palaces: rulePalaces }).map(pattern => ({
        name: pattern.name,
        palaces: pattern.palaces,
        conditions: pattern.conditions,
        reference: pattern.source,
      }))
    : [];
  const relationshipRules = canMatch ? rulePalaces
    .filter(palace => palace.name === '夫妻' || palace.name === '夫妻宫')
    .flatMap(palace => palace.stars.flatMap(star => {
      if (star.type !== 'major' || (star.siHua !== '禄' && star.siHua !== '忌')) return [];
      return [{
        name: `夫妻宫${star.name}化${star.siHua}`,
        condition: `本命夫妻宫的主星${star.name}带生年化${star.siHua}`,
        interpretation: star.siHua === '禄'
          ? '传统上可从亲密关系中愿意投入、重视相处感受的角度解读。'
          : '传统上可从亲密关系中容易在意或反复纠结的议题切入。',
        reference: `本站《紫微斗数全书》四化节选 /library/quanshu/4#qs-5-${star.siHua === '禄' ? '3' : '4'}`,
      }];
    })) : [];

  const fourPillars = safeStringArray(lunarInfo.fourPillars, 4);
  const fourPillarsLunar = safeStringArray(lunarInfo.fourPillarsLunar, 4);
  const daXians = Array.isArray(chart.daXians)
    ? chart.daXians.flatMap(rawDaXian => {
        const daXian = asRecord(rawDaXian);
        if (!daXian) return [];
        const branch = safeNumber(daXian.palaceBranch);
        const palace = isBranch(branch) ? palaces.find(item => item.branch === branch) : undefined;
        const stem = palace?.stem;
        const transforms = !unknownTime && Number.isInteger(stem) && stem! >= 0 && stem! < 10
          ? Object.entries(getSiHuaByStem(stem!)).map(([change, star]) => ({
              change, star,
              natalPalaces: palaces.filter(item => item.stars.some(entry => entry.name === star)).map(item => item.name),
            }))
          : undefined;
        return [{
          startAge: safeNumber(daXian.startAge),
          endAge: safeNumber(daXian.endAge),
          palaceName: safeString(daXian.palaceName, 16),
          palaceBranch: branch,
          palaceStemIndex: stem,
          palaceStemName: Number.isInteger(stem) && stem! >= 0 && stem! < STEMS.length ? STEMS[stem!] : undefined,
          siHua: transforms ?? summarizeSiHua(daXian.siHua),
        }];
      })
    : [];

  const birthYear = safeNumber(lunarInfo.lunarYear);
  const liunian = flowYears.filter(year => birthYear !== undefined && year >= birthYear).map(year => {
    const { stemName, transforms } = getLiuNianSiHua(year);
    const age = year - birthYear! + 1;
    const palaceBranches = getAnnualPalaceBranches(year);
    return {
      year,
      virtualAge: age,
      stemName,
      palaceBranches,
      palaceBranchNames: palaceBranches.map(branch => BRANCHES[branch]),
      flowStars: getAnnualStars(year).map(item => ({ ...item, branchName: BRANCHES[item.branch] })),
      daXian: daXians.find(period => period.startAge !== undefined && period.endAge !== undefined && age >= period.startAge && age <= period.endAge),
      siHua: Object.entries(transforms).map(([change, star]) => ({
        change, star,
        natalPalaces: palaces.filter(palace => palace.stars.some(entry => entry.name === star)).map(palace => palace.name),
      })),
    };
  });
  return JSON.stringify({
    flowPalaceOrder: PALACE_NAMES_ORDER,
    focusedFlowYears: liunian.filter(item => focusYears.includes(item.year)).map(item => ({
      year: item.year,
      palaces: PALACE_NAMES_ORDER.map((name, index) => {
        const branch = item.palaceBranches[index];
        return {
          name,
          branchName: BRANCHES[branch],
          natalPalace: palaces.find(palace => palace.branch === branch)?.name,
          flowStars: item.flowStars.find(stars => stars.branch === branch)?.stars ?? [],
        };
      }),
    })),
    liunian,
    ruleMatches: { unknownTime, evaluated: canMatch, patterns: matchedPatterns, relationship: relationshipRules },
    checklists: canMatch ? allChecklists(palaces) : null,
    // 十二宫宫干飞化（只列事实）。时辰不详时宫干不可靠，不提供。
    feiHua: canMatch ? allFeiHua(palaces) : null,
    gender: safeString(birthInfo.gender, 16),
    lunarInfo: {
      lunarYear: safeNumber(lunarInfo.lunarYear),
      lunarMonth: safeNumber(lunarInfo.lunarMonth),
      lunarDay: safeNumber(lunarInfo.lunarDay),
      yearStem: safeNumber(lunarInfo.yearStem),
      yearBranch: safeNumber(lunarInfo.yearBranch),
      isLeapMonth: safeBoolean(lunarInfo.isLeapMonth),
      fourPillars: fourPillars.length ? fourPillars : undefined,
      fourPillarsLunar: fourPillarsLunar.length ? fourPillarsLunar : undefined,
    },
    mingGongBranch: safeNumber(chart.mingGongBranch),
    shenGongBranch: safeNumber(chart.shenGongBranch),
    wuxingJuName: safeString(chart.wuxingJuName, 16),
    ziweiPos: safeNumber(chart.ziweiPos),
    currentAge: safeNumber(chart.currentAge),
    currentDaXianIndex: safeNumber(chart.currentDaXianIndex),
    mingZhu: safeString(chart.mingZhu, 24),
    shenZhu: safeString(chart.shenZhu, 24),
    yinYangGender: safeString(chart.yinYangGender, 16),
    palaces: palaces.map(palace => ({
      ...palace,
      branchName: isBranch(palace.branch) ? BRANCHES[palace.branch] : undefined,
      stars: palace.stars.map(({ name, type, siHua, brightness }) => ({ name, type, siHua, brightness })),
    })),
    daXians,
  });
}

export function buildChartContext(value: unknown, question: string, selectedYear?: unknown): string | null {
  const chart = asRecord(value);
  const birthYear = safeNumber(asRecord(chart?.lunarInfo)?.lunarYear);
  const daXians = Array.isArray(chart?.daXians) ? chart.daXians : [];
  const endAges = daXians.map(entry => safeNumber(asRecord(entry)?.endAge))
    .filter((age): age is number => age !== undefined && Number.isInteger(age) && age >= 1 && age <= 150);
  const lastDaXianAge = endAges.length ? Math.max(...endAges) : undefined;
  const focusYears = requestedFlowYears(question, selectedYear).slice(0, 10);
  return summarizeChart(value, requestedFlowYears(question, selectedYear, birthYear, lastDaXianAge), focusYears);
}

/** Keep the chart's usual complete cycle stable while appending question-specific years separately. */
export function buildChartContextParts(value: unknown, question: string, selectedYear?: unknown) {
  const baselineText = buildChartContext(value, '');
  const currentText = buildChartContext(value, question, selectedYear);
  if (!baselineText || !currentText) return null;
  const baseline = JSON.parse(baselineText) as JsonRecord;
  const current = JSON.parse(currentText) as JsonRecord;
  const baselineYears = new Set((baseline.liunian as JsonRecord[]).map(item => item.year));
  const extraYears = (current.liunian as JsonRecord[]).filter(item => !baselineYears.has(item.year));
  const palaceSummary = (baseline.palaces as JsonRecord[]).map(palace => ({
    name: palace.name, branchName: palace.branchName,
    majorStars: (palace.stars as JsonRecord[]).filter(star => star.type === 'major').map(star => star.name),
    borrowedStars: palace.borrowedStars,
  }));
  delete baseline.focusedFlowYears;
  return {
    stable: JSON.stringify(baseline),
    dynamic: JSON.stringify({ palaceSummary, focusedFlowYears: current.focusedFlowYears, extraFlowYears: extraYears }),
    palaceSummary,
  };
}

