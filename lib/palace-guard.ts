type Palace = { name?: unknown; branchName?: unknown };
const branches = '子丑寅卯辰巳午未申酉戌亥';

/** Check only explicit natal-palace branch claims; ambiguous or annual claims are left alone. */
export function validateNatalBranches(text: string, palaces: Palace[]): string[] {
  const expected = new Map<string, string>();
  for (const palace of palaces) {
    if (typeof palace.name !== 'string' || typeof palace.branchName !== 'string') continue;
    expected.set(palace.name.replace(/宫$/, ''), palace.branchName);
  }
  const names = '命|兄弟|夫妻|子女|财帛|疾厄|迁移|仆役|交友|官禄|事业|田宅|福德|父母';
  const re = new RegExp(`本命(?:的)?(${names})(?:宫)?(?:是|在|落在|位于|处于|坐落在|坐落于)\\s*([${branches}])(?:宫)?`, 'g');
  const errors = new Set<string>();
  for (const match of text.matchAll(re)) {
    const name = match[1] === '事业' ? '官禄' : match[1] === '交友' ? '仆役' : match[1];
    const branch = expected.get(name);
    if (branch && branch !== match[2]) errors.add(`本命${name}宫应在${branch}，不是${match[2]}`);
  }
  const contextual = new RegExp(`(${names})(?:宫)?(?:是|在|落在|位于|处于|坐落在|坐落于)\\s*([${branches}])(?:宫)?`, 'g');
  for (const match of text.matchAll(contextual)) {
    const before = text.slice(Math.max(0, (match.index ?? 0) - 50), match.index).split(/[。！？\n]/).at(-1) ?? '';
    const markers = [...before.matchAll(/本命|先天|流年|大限/g)];
    if (!markers.length || !['本命', '先天'].includes(markers[markers.length - 1][0])) continue;
    const name = match[1] === '事业' ? '官禄' : match[1] === '交友' ? '仆役' : match[1];
    const branch = expected.get(name);
    if (branch && branch !== match[2]) errors.add(`本命${name}宫应在${branch}，不是${match[2]}`);
  }
  return [...errors];
}
