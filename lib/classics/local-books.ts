import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { booksDir, userBooksDir } from '../paths';
import { redactAuthors } from './citation';
import { openSealed } from './sealed';

export const BOOK_ID = /^[a-f0-9]{24}$/;

export type LocalBook = {
  id: string;
  title: string;
  school?: string | null;
  pageCount: number;
  textPages: number;
  sourceKind?: 'preview';
  imagePages?: number[];
  chunks: { page: number; text: string }[];
  /** Set by 「导入我的书」: the book lives in the user's data directory and can be removed. */
  imported?: boolean;
  importedAt?: string;
  /** 随安装包附带的内置书：不提供阅读页，只供 AI 检索。 */
  bundled?: boolean;
};

/** Bundled books first: a user copy of a bundled book never shadows it. */
function bookDirectories() {
  return [booksDir(), userBooksDir()];
}

async function findBook(id: string) {
  if (!BOOK_ID.test(id)) return null;
  for (const root of bookDirectories()) {
    const directory = join(root, id);
    if (await stat(join(directory, 'book.json')).then(file => file.isFile(), () => false)) {
      return { directory, bundled: root === booksDir() };
    }
  }
  return null;
}

// 内置书没有阅读页：原 PDF 和页面图都不提供。
export async function localBookPdf(id: string) {
  const found = await findBook(id);
  return found && !found.bundled ? join(found.directory, 'book.pdf') : null;
}

export async function localBookImage(id: string, page: string) {
  if (!/^[1-9]\d{0,4}$/.test(page)) return null;
  const found = await findBook(id);
  return found && !found.bundled ? join(found.directory, `page-${page}.png`) : null;
}

async function readBookIn(directory: string, id: string, bundled: boolean): Promise<LocalBook | null> {
  try {
    const raw: Omit<LocalBook, 'id'> & { sealed?: string } = JSON.parse(await readFile(join(directory, 'book.json'), 'utf8'));
    // 打包后的内置书正文是加密的（scripts/desktop/seal.mjs），读的时候解开。
    const { sealed, ...book } = raw;
    const chunks: LocalBook['chunks'] = sealed ? JSON.parse(openSealed(sealed)) : book.chunks;
    // 正文里的作者名在读取时就替换掉：阅读页、检索结果和发给 AI 的片段都不会出现。
    return { ...book, id, bundled, chunks: chunks.map(chunk => ({ ...chunk, text: redactAuthors(chunk.text) })) };
  } catch {
    return null;
  }
}

export async function readLocalBook(id: string) {
  const found = await findBook(id);
  return found ? readBookIn(found.directory, id, found.bundled) : null;
}

/** Bundled and imported books, sorted by title. */
export async function readLocalBooks() {
  const seen = new Set<string>();
  const books: LocalBook[] = [];
  for (const root of bookDirectories()) {
    const ids = (await readdir(root).catch(() => [] as string[])).filter(id => BOOK_ID.test(id) && !seen.has(id));
    ids.forEach(id => seen.add(id));
    const read = await Promise.all(ids.map(id => readBookIn(join(root, id), id, root === booksDir())));
    books.push(...read.filter(book => book !== null));
  }
  return books.sort((a, b) => a.title.localeCompare(b.title, 'zh'));
}

/** Whether a book with this id is already on the shelf (bundled or imported). */
export async function hasLocalBook(id: string) {
  return (await findBook(id)) !== null;
}
