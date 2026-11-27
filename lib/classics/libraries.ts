// 书库：AI 检索用哪些书。
// - 内置书库（builtin）：随安装包附带的参考书，正文加密、不提供阅读，只供检索。
// - 用户书库：用户自己建、自己导入书，可以有多个，书可以阅读。
// 清单存在用户数据目录的 library/libraries.json：
//   { libraries: [{ id, name }], selected: ['builtin', …], books: { 书 id: 书库 id } }
// 书属于哪个书库记在这里而不是 book.json 里：book.json 一改，它的向量校验（sha256）就失效。
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { dataDir } from '../paths';

export const BUILTIN_LIBRARY = 'builtin';
export const DEFAULT_LIBRARY = 'mine';
const MAX_LIBRARIES = 20;

export type Library = { id: string; name: string };
export type LibraryState = { libraries: Library[]; selected: string[]; books: Record<string, string> };

const LIBRARY_ID = /^[a-z0-9]{1,16}$/;
const file = () => join(dataDir(), 'library', 'libraries.json');
// 默认内置书库和「我的书库」都参与检索：导入的书马上能用上，升级前导入的书也照旧被检索。
const defaults = (): LibraryState => ({ libraries: [{ id: DEFAULT_LIBRARY, name: '我的书库' }], selected: [BUILTIN_LIBRARY, DEFAULT_LIBRARY], books: {} });

export function cleanName(value: unknown) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 24) : '';
}

/** 读清单；文件不存在或损坏时用默认值（一个「我的书库」，和内置书库一起参与检索）。 */
export async function readLibraries(): Promise<LibraryState> {
  let raw: Partial<LibraryState> = {};
  try {
    raw = JSON.parse(await readFile(file(), 'utf8'));
  } catch {
    return defaults();
  }
  const libraries = (Array.isArray(raw.libraries) ? raw.libraries : [])
    .filter((item): item is Library => !!item && LIBRARY_ID.test(String(item.id)) && item.id !== BUILTIN_LIBRARY && !!cleanName(item.name))
    .map(item => ({ id: item.id, name: cleanName(item.name) }))
    .slice(0, MAX_LIBRARIES);
  if (!libraries.length) libraries.push(...defaults().libraries);
  const known = new Set([BUILTIN_LIBRARY, ...libraries.map(item => item.id)]);
  const selected = Array.isArray(raw.selected) ? [...new Set(raw.selected.filter(id => known.has(id)))] : defaults().selected;
  const books: Record<string, string> = {};
  for (const [book, library] of Object.entries(raw.books && typeof raw.books === 'object' ? raw.books : {})) {
    if (/^[a-f0-9]{24}$/.test(book) && known.has(library) && library !== BUILTIN_LIBRARY) books[book] = library;
  }
  return { libraries, selected, books };
}

export async function writeLibraries(state: LibraryState) {
  const path = file();
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`);
  await rename(temp, path);
}

/** 导入的书属于哪个书库；清单里没记的（旧数据）算第一个用户书库。 */
export function libraryOf(state: LibraryState, bookId: string) {
  const id = state.books[bookId];
  return id && state.libraries.some(item => item.id === id) ? id : state.libraries[0].id;
}

/** AI 检索时这本书用不用：内置书看「内置书库」有没有勾，导入的书看它所在的书库有没有勾。 */
export function bookSelected(state: LibraryState, book: { id: string; bundled?: boolean }) {
  return book.bundled ? state.selected.includes(BUILTIN_LIBRARY) : state.selected.includes(libraryOf(state, book.id));
}

export function newLibraryId() {
  return randomBytes(4).toString('hex');
}

export { MAX_LIBRARIES, LIBRARY_ID };

/** 记下导入的书放进了哪个书库。 */
export async function setBookLibrary(bookId: string, libraryId: string) {
  const state = await readLibraries();
  if (!state.libraries.some(item => item.id === libraryId)) return false;
  state.books[bookId] = libraryId;
  await writeLibraries(state);
  return true;
}

/** 书删了，清单里也去掉。 */
export async function forgetBook(bookId: string) {
  const state = await readLibraries();
  if (!(bookId in state.books)) return;
  delete state.books[bookId];
  await writeLibraries(state);
}
