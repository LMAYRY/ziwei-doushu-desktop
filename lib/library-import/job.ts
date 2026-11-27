// 「导入我的书」: PDF → text (pdf.js, Vision OCR for scanned pages) → chunks → vectors,
// saved under userBooksDir()/<id>/ in the same layout as the bundled books:
//   book.pdf     the original file (read in the book page)
//   book.json    { title, pageCount, textPages, imagePages, chunks, imported, importedAt }
//   vectors.npz  { source_sha256: sha256(book.json), vectors: float32 [chunks, 512] }
// One import runs at a time. Its state lives on globalThis because Next bundles each route separately.
import { createHash, randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { hasLocalBook, readLocalBook } from '../classics/local-books';
import { forgetBook, setBookLibrary } from '../classics/libraries';
import { libraryDir, userBooksDir } from '../paths';
import { getEncoder } from '../vectors/search';
import { buildVectors, overlappingTexts } from '../vectors/build';
import { encodeNpz } from '../vectors/npy';
import { VECTOR_DIMENSIONS } from '../vectors/encoder';
import { ocrPages, OcrUnavailableError } from './ocr';
import { fixRadicals, PdfError, readPdfText } from './pdf-text';
import { splitPages } from './split';

export const MAX_PDF_BYTES = 1024 * 1024 * 1024;
/** Pages with fewer Han characters than this are treated as scans (same rule as extract-library-pdf.swift). */
// 文字层里的汉字少于这个数就当扫描页去 OCR：有些扫描 PDF 自带只含页码或乱码的文字层。
const MIN_TEXT_LAYER = 60;
const STAGING = /^\.import-/;

export type ImportStage = 'read' | 'ocr' | 'vectors' | 'save';
export type ImportJob = {
  id: string;
  title: string;
  status: 'running' | 'done' | 'failed' | 'cancelled';
  stage: ImportStage;
  done: number;
  total: number;
  message?: string;
  book?: { id: string; title: string; pageCount: number; chunks: number; ocrPages: number };
};

type Store = { job: ImportJob | null; controller: AbortController | null };
const store: Store = ((globalThis as { __ziweiBookImport?: Store }).__ziweiBookImport ??= { job: null, controller: null });

export class ImportError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export function currentImport() {
  return store.job;
}

export function cancelImport() {
  if (store.job?.status === 'running') store.controller?.abort(new ImportError('已取消'));
  return store.job;
}

const hanCount = (text: string) => text.match(/\p{Script=Han}/gu)?.length ?? 0;

function update(job: ImportJob, patch: Partial<ImportJob>) {
  Object.assign(job, patch);
}

/** Leftovers of imports interrupted by a crash or quit. */
async function removeStaging(root: string) {
  for (const name of await readdir(root).catch(() => [] as string[])) {
    if (STAGING.test(name)) await rm(join(root, name), { recursive: true, force: true });
  }
}

/**
 * Receives the PDF, checks it is new, then continues in the background.
 * Throws ImportError (409 when an import is running or the book is already on the shelf).
 */
export async function startImport(fileName: string, body: ReadableStream<Uint8Array>, library?: string) {
  if (store.job?.status === 'running') throw new ImportError('正在导入另一本书，请等它完成或取消', 409);
  const title = fileName.replace(/\.pdf$/i, '').trim().slice(0, 120) || '未命名';
  const root = userBooksDir();
  await mkdir(root, { recursive: true });
  await removeStaging(root);
  const staging = join(root, `.import-${randomBytes(6).toString('hex')}`);
  await mkdir(staging);
  const pdfPath = join(staging, 'book.pdf');
  try {
    // Stream to disk while hashing, so a large PDF is never held twice in memory.
    const hash = createHash('sha256');
    let size = 0;
    const source = Readable.fromWeb(body as import('node:stream/web').ReadableStream<Uint8Array>);
    source.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_PDF_BYTES) source.destroy(new ImportError('文件太大（超过 1 GB）', 413));
      hash.update(chunk);
    });
    await pipeline(source, createWriteStream(pdfPath));
    if (!size) throw new ImportError('文件是空的');
    const id = hash.digest('hex').slice(0, 24);
    if (await hasLocalBook(id)) {
      const existing = await readLocalBook(id);
      throw new ImportError(`这本书已经在书架上了：${existing?.title ?? title}`, 409);
    }
    // 放进用户选的书库（没选就是第一个用户书库）。
    if (library) await setBookLibrary(id, library);
    const controller = new AbortController();
    const job: ImportJob = { id: randomBytes(8).toString('hex'), title, status: 'running', stage: 'read', done: 0, total: 0 };
    store.job = job;
    store.controller = controller;
    void run(job, { id, staging, pdfPath, root, signal: controller.signal });
    return job;
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

async function run(
  job: ImportJob,
  { id, staging, pdfPath, root, signal }: { id: string; staging: string; pdfPath: string; root: string; signal: AbortSignal },
) {
  try {
    const data = new Uint8Array(await readFile(pdfPath));
    const pages = await readPdfText(data, { signal, onPage: (done, total) => update(job, { done, total }) });
    if (!pages.length) throw new ImportError('PDF 里没有页面');

    const scanned = pages.flatMap((text, index) => (hanCount(text) < MIN_TEXT_LAYER ? [index + 1] : []));
    const imagePages: number[] = [];
    if (scanned.length) {
      update(job, { stage: 'ocr', done: 0, total: scanned.length });
      try {
        const recognised = await ocrPages(pdfPath, scanned, { signal, onPage: () => update(job, { done: job.done + 1 }) });
        for (const [page, raw] of recognised) {
          const text = fixRadicals(raw);
          if (hanCount(text) > hanCount(pages[page - 1])) {
            pages[page - 1] = text;
            imagePages.push(page);
          }
        }
      } catch (error) {
        // A text PDF with a few blank pages (cover, end papers) imports fine without OCR.
        if (!(error instanceof OcrUnavailableError) || scanned.length > pages.length / 2) throw error;
      }
    }

    const chunks = splitPages(pages);
    if (!chunks.length) throw new ImportError('没有从这个 PDF 里读出文字');
    signal.throwIfAborted();
    update(job, { stage: 'vectors', done: 0, total: chunks.length });
    const encoder = await getEncoder(join(libraryDir(), 'taiwei-model'));
    const vectors = await buildVectors(encoder, overlappingTexts(chunks), { signal, onBatch: done => update(job, { done }) });

    update(job, { stage: 'save', done: 0, total: 1 });
    const bookJson = Buffer.from(JSON.stringify({
      title: job.title,
      school: null,
      pageCount: pages.length,
      textPages: pages.filter(text => text.trim()).length,
      imagePages: imagePages.sort((a, b) => a - b),
      imported: true,
      importedAt: new Date().toISOString(),
      chunks,
    }), 'utf8');
    await writeFile(join(staging, 'book.json'), bookJson);
    await writeFile(join(staging, 'vectors.npz'), encodeNpz({
      source_sha256: { dtype: 'unicode', width: 64, value: createHash('sha256').update(bookJson).digest('hex') },
      vectors: { dtype: 'float32', shape: [chunks.length, VECTOR_DIMENSIONS], data: vectors },
    }));
    signal.throwIfAborted();
    if (await hasLocalBook(id)) throw new ImportError('这本书已经在书架上了');
    await rename(staging, join(root, id));
    update(job, {
      status: 'done',
      done: 1,
      book: { id, title: job.title, pageCount: pages.length, chunks: chunks.length, ocrPages: imagePages.length },
    });
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => {});
    if (signal.aborted) {
      update(job, { status: 'cancelled', message: '已取消导入' });
    } else {
      const known = error instanceof ImportError || error instanceof PdfError || error instanceof OcrUnavailableError;
      if (!known) console.error('Book import failed', error);
      update(job, { status: 'failed', message: known ? (error as Error).message : `导入失败：${(error as Error)?.message ?? error}` });
    }
  } finally {
    if (store.job === job) store.controller = null;
  }
}

/** Removes an imported book. Bundled books cannot be removed. */
export async function removeImportedBook(id: string) {
  const book = await readLocalBook(id);
  if (!book?.imported) return false;
  await rm(join(userBooksDir(), id), { recursive: true, force: true });
  await forgetBook(id);
  return true;
}
