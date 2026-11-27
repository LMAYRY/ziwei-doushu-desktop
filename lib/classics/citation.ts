import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { libraryDir } from '../paths';
// 引用里只保留书名（和流派），不输出作者、注者姓名。
// 书名来自导入文件名，常带作者，例如「某甲《紫微斗数讲义》某乙补注」「某乙注《太微赋》」。
export function withoutAuthors(source: string): string {
  const [label, ...rest] = source.split(' · ');
  const book = label.match(/《[^》]+》/)?.[0];
  if (!book) return source;
  const prefix = label.startsWith('本站整理节选') ? '本站整理节选' : '';
  const school = label.slice(label.indexOf(book) + book.length).match(/[一-龥]{1,4}派/)?.[0];
  return [`${prefix}${book}${school ? `（${school}）` : ''}`, ...rest].join(' · ');
}

/** 界面上显示的书名（不带书名号、不带作者）：「某甲《紫微斗数讲义》某乙补注」→「紫微斗数讲义」。 */
export function bookName(title: string): string {
  return title.match(/《([^》]+)》/)?.[1] ?? title;
}

/** 流派只保留「某某派」，去掉「中州派补注（含某某原文）」里的人名；以人名命名的流派不显示。 */
export function schoolName(school?: string | null): string | undefined {
  const name = school?.match(/[一-龥]{1,4}派/)?.[0];
  return name && redactAuthors(name) === name ? name : undefined;
}

// 书库里各书的作者、注者、讲者（含繁体写法）。正文、来源里出现时统一替换，不向用户和 AI 透露。
// 名单不写在代码里：放在书库数据目录的 authors.json（字符串数组，随内置书库一起打包，不进开源仓库）。
// 新收录的书如有作者，把名字加到那个文件里。
let authorPattern: RegExp | null | undefined;
function authorsPattern(): RegExp | null {
  if (authorPattern !== undefined) return authorPattern;
  let names: string[] = [];
  try {
    const raw: unknown = JSON.parse(readFileSync(join(libraryDir(), 'authors.json'), 'utf8'));
    if (Array.isArray(raw)) names = raw.filter((name): name is string => typeof name === 'string' && name.trim().length > 0);
  } catch {
    // 没有名单（例如开源代码自己编译、没有内置书库）时不替换。
  }
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  authorPattern = names.length ? new RegExp([...names].sort((a, b) => b.length - a.length).map(escape).join('|'), 'g') : null;
  return authorPattern;
}

export function redactAuthors(text: string): string {
  const pattern = authorsPattern();
  return pattern ? text.replace(pattern, '原作者') : text;
}
