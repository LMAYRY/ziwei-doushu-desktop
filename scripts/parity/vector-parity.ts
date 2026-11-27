// Dev-only acceptance check for the Node vector search against the original
// Python implementation (scripts/library-vectors.py). Requires python3 and
// .local-library/taiwei-model/deps. Run: npx tsx scripts/parity/vector-parity.ts [--all]
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { QUERY_PREFIX } from '../../lib/vectors/encoder';
import { WordPieceTokenizer } from '../../lib/vectors/wordpiece';
import { getEncoder, readBookVectors, searchVectors } from '../../lib/vectors/search';
import { QUESTIONS } from './questions';

const root = process.cwd();
const library = join(root, '.local-library');
const all = process.argv.includes('--all');

function python(script: string, args: string[], input: string) {
  return execFileSync('python3', [join(root, script), ...args], { input, maxBuffer: 1 << 30 }).toString();
}

function overlappingTexts(chunks: { page: number; text: string }[]) {
  return chunks.map((chunk, index) => {
    if (index && chunks[index - 1].page === chunk.page) {
      const sentences = chunks[index - 1].text.match(/[^。！？；]+[。！？；]*/g);
      if (sentences) return [...sentences[sentences.length - 1]].slice(-100).join('') + chunk.text;
    }
    return chunk.text;
  });
}

function cosine(a: ArrayLike<number>, b: ArrayLike<number>) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / Math.sqrt(na * nb);
}

async function main() {
  let failed = false;
  const bookIds = readdirSync(join(library, 'books')).filter(id => /^[a-f0-9]{24}$/.test(id)).sort();
  const books = bookIds.map(id => ({ id, ...JSON.parse(readFileSync(join(library, 'books', id, 'book.json'), 'utf8')) }));

  // 1. Tokenizer on every document text and every query.
  const tokenizer = new WordPieceTokenizer(JSON.parse(readFileSync(join(library, 'taiwei-model/tokenizer.json'), 'utf8')));
  const texts = [...books.flatMap(book => overlappingTexts(book.chunks)), ...QUESTIONS.map(q => QUERY_PREFIX + q)];
  const expected: number[][] = JSON.parse(python('scripts/parity/python-reference.py', ['tokenize', library], JSON.stringify(texts)));
  const tokenMismatches = texts.filter((text, i) => tokenizer.encode(text).ids.join() !== expected[i].join());
  console.log(`tokenizer: ${texts.length - tokenMismatches.length}/${texts.length} identical`);
  if (tokenMismatches.length) { failed = true; console.log(tokenMismatches.slice(0, 5)); }

  // 2a. Query vectors: Node vs Python, same text.
  const encoder = await getEncoder(join(library, 'taiwei-model'));
  const queries = QUESTIONS.map(q => QUERY_PREFIX + q);
  const pyQueries: number[][] = JSON.parse(python('scripts/parity/python-reference.py', ['encode', library], JSON.stringify(queries)));
  const nodeQueries = await encoder.encode(queries).then(() => Promise.all(queries.map(q => encoder.encode([q]).then(v => v[0]))));
  const queryMin = Math.min(...nodeQueries.map((v, i) => cosine(v, pyQueries[i])));
  console.log(`query vectors: min cosine ${queryMin.toFixed(7)} over ${queries.length}`);
  if (queryMin < 0.9999) failed = true;

  // 2b. Document vectors: Node encoding vs vectors.npz built by Python.
  let docMin = 1, docCount = 0;
  const started = Date.now();
  for (const book of books) {
    const matrix = await readBookVectors(join(library, 'books', book.id));
    if (!matrix) { console.log(`  ${book.title}: vectors.npz missing or stale`); failed = true; continue; }
    const docTexts = overlappingTexts(book.chunks);
    // The model is dynamically quantised: int8 scales are computed over the whole padded
    // batch, so rows must be encoded in the exact batches library-vectors.py build used
    // (consecutive groups of 16).
    const batchCount = Math.ceil(docTexts.length / 16);
    const batches = all
      ? Array.from({ length: batchCount }, (_, i) => i)
      : [...new Set([0, Math.floor(batchCount / 2), batchCount - 1])];
    const rows: number[] = [];
    let bookMin = 1;
    for (const batchIndex of batches) {
      const batch = Array.from({ length: 16 }, (_, k) => batchIndex * 16 + k).filter(i => i < docTexts.length);
      const vectors = await encoder.encode(batch.map(i => docTexts[i]));
      batch.forEach((row, k) => {
        bookMin = Math.min(bookMin, cosine(vectors[k], matrix.data.subarray(row * 512, row * 512 + 512)));
      });
      rows.push(...batch);
    }
    docCount += rows.length;
    docMin = Math.min(docMin, bookMin);
    console.log(`  ${book.title}: ${rows.length}/${docTexts.length} rows, min cosine ${bookMin.toFixed(7)}`);
  }
  console.log(`document vectors: min cosine ${docMin.toFixed(7)} over ${docCount} rows (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  if (docMin < 0.9999) failed = true;

  // 3. Retrieval results for real questions: Node vs `library-vectors.py search`.
  const fixture: { question: string; hits: unknown }[] = [];
  let same = 0;
  for (const question of QUESTIONS) {
    const py = JSON.parse(python('scripts/library-vectors.py', ['search', library], question));
    const node = await searchVectors(library, question);
    fixture.push({ question, hits: py });
    if (JSON.stringify(py) === JSON.stringify(node)) same++;
    else { failed = true; console.log(`DIFF ${question}\n  py   ${JSON.stringify(py)}\n  node ${JSON.stringify(node)}`); }
  }
  console.log(`retrieval: ${same}/${QUESTIONS.length} identical (sample + books, id + index)`);
  writeFileSync(join(root, 'scripts/regression/fixtures/vector-search-python.json'), JSON.stringify(fixture, null, 1) + '\n');

  if (failed) { console.log('PARITY FAILED'); process.exit(1); }
  console.log('PARITY OK');
}

main();
