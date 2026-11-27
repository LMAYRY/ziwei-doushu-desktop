// Text layer of every page with pdf.js (pages without one come back nearly empty and go to OCR).
import { join } from 'node:path';

export class PdfError extends Error {}

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // Run pdf.js's worker code in this thread: no worker file to locate at runtime.
  const scope = globalThis as { pdfjsWorker?: unknown };
  scope.pdfjsWorker ??= await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
  return pdfjs;
}

/** Many Chinese PDFs use predefined CID CMaps (e.g. UniGB-UCS2-H); without them the text is garbled. */
function cMapDirectory() {
  // The standalone server runs with its own directory as cwd, which has node_modules/pdfjs-dist.
  return join(/* turbopackIgnore: true */ process.cwd(), 'node_modules', 'pdfjs-dist', 'cmaps') + '/';
}

/**
 * Fonts in many Chinese PDFs (e.g. Songti from macOS) map common characters such as 石 斗 山 人 to
 * Kangxi radicals (⽯ ⽃ ⼭ ⼈) in the text layer. They look the same but the tokenizer has no such
 * tokens, so map them back. Only radicals: full NFKC would also turn ，。！？ into ASCII.
 */
export function fixRadicals(text: string) {
  return text.replace(/[\u2e80-\u2fdf]/g, char => char.normalize('NFKC'));
}

/** One string per page (1-based page n at index n-1). */
export async function readPdfText(
  data: Uint8Array,
  { onPage, signal }: { onPage?: (done: number, total: number) => void; signal?: AbortSignal } = {},
) {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    data: data.slice(), // pdf.js takes ownership of the buffer it is given
    cMapUrl: cMapDirectory(),
    cMapPacked: true,
    disableFontFace: true,
    verbosity: 0,
  });
  let document;
  try {
    document = await task.promise;
  } catch (error) {
    const name = (error as Error)?.name;
    if (name === 'PasswordException') throw new PdfError('这个 PDF 有密码保护，无法导入');
    if (name === 'InvalidPDFException') throw new PdfError('文件不是有效的 PDF');
    throw new PdfError(`无法打开 PDF：${(error as Error)?.message ?? error}`);
  }
  try {
    const pages: string[] = [];
    for (let number = 1; number <= document.numPages; number++) {
      signal?.throwIfAborted();
      let text = '';
      try {
        const page = await document.getPage(number);
        const content = await page.getTextContent();
        text = fixRadicals(content.items.map(item => ('str' in item ? item.str + (item.hasEOL ? '\n' : '') : '')).join(''));
        page.cleanup();
      } catch {
        // A damaged page: leave it empty so OCR gets a chance at it.
      }
      pages.push(text);
      onPage?.(number, document.numPages);
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
