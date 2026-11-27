/**
 * 模型有时把出处写成普通文字「（《书名》第 41 页）」而不是 citation 链接。
 * 与本轮检索资料（references）里书名、页码都对得上的，补成可点击的 citation；对不上的保持原样。
 */
export function linkPlainCitations(text: string, references: string[] = []) {
  const byKey = new Map<string, string>();
  for (const reference of references) {
    const match = reference.match(/^\[(.+?)\]\(([^)]+)\)$/);
    const title = match?.[1].match(/《([^》]+)》/)?.[1];
    const page = match?.[1].match(/第\s*(\d+)\s*页/)?.[1];
    if (match && title && page) byKey.set(`${title}#${page}`, reference);
  }
  if (!byKey.size) return text;
  return text.replace(/(\[)?《([^》\n]{1,40})》\s*(?:（[^）\n]{1,30}）)?\s*[·・]?\s*第\s*(\d+)\s*页(\]\()?/g,
    (whole, open, title, page, linked) => (open || linked) ? whole : byKey.get(`${title}#${page}`) ?? whole);
}
