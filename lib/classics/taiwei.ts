import { access, readFile } from 'node:fs/promises';
import { openSealed } from './sealed';
import { join } from 'node:path';
import { libraryDir, userBooksDir } from '../paths';
import { searchVectors, type VectorHits } from '../vectors/search';
import { redactAuthors } from './citation';

// 只写书名；书库里这本书的完整标题带注者，比对时用 bookName() 去掉。
export const TAIWEI_TITLE = '《太微赋》';

type TaiweiPassage = { page: number; text: string };

export async function readTaiwei(): Promise<TaiweiPassage[]> {
  try {
    const raw: TaiweiPassage[] | { sealed: string } = JSON.parse(await readFile(join(libraryDir(), 'taiwei.json'), 'utf8'));
    // 打包后是加密的（scripts/desktop/seal.mjs）。
    const passages: TaiweiPassage[] = Array.isArray(raw) ? raw : JSON.parse(openSealed(raw.sealed));
    return passages.map(passage => ({ ...passage, text: redactAuthors(passage.text) }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export async function searchLibraryVectors(question: string): Promise<VectorHits> {
  const empty: VectorHits = { sample: [], books: [] };
  try {
    await access(join(libraryDir(), 'taiwei-model', 'model.onnx'));
  } catch {
    return empty;
  }
  try {
    const hits = await searchVectors(libraryDir(), question.slice(0, 500), [userBooksDir()]);
    return { sample: hits.sample.slice(0, 2), books: hits.books.slice(0, 8) };
  } catch (error) {
    console.error('Vector search failed', error);
    return empty;
  }
}
