// Node port of `split_page` in scripts/import-library.py: one PDF page → chunks of about 140 chars.
// Lengths count code points like Python's len(), so rare CJK characters outside the BMP count once.

const HAN_LINE_BREAK = /(?<=[\u3400-\u9fff])[ \t]*\n[ \t]*(?=[\u3400-\u9fff])/g;
// Python's \s (str.isspace): JS \s plus \x1c–\x1f and \x85, minus \ufeff.
const WHITESPACE = /(?:[^\S\ufeff]|[\x1c-\x1f\x85])+/g;
const SENTENCES = /[^。！？；]+[。！？；]*|[。！？；]+/g;

const length = (text: string) => Array.from(text).length;

export function splitPage(page: string): string[] {
  const text = page.replace(HAN_LINE_BREAK, '').replace(WHITESPACE, ' ').replace(/^ | $/g, '');
  const chunks: string[] = [];
  let current = '';
  for (const match of text.matchAll(SENTENCES)) {
    let sentence = Array.from(match[0]);
    if (current && length(current) + sentence.length > 140) {
      chunks.push(current);
      current = '';
    }
    while (sentence.length > 240) {
      chunks.push(sentence.slice(0, 160).join(''));
      sentence = sentence.slice(160);
    }
    current += sentence.join('');
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Chunks of a whole book, with 1-based page numbers. */
export function splitPages(pages: string[]) {
  return pages.flatMap((text, index) => splitPage(text).map(chunk => ({ page: index + 1, text: chunk })));
}
