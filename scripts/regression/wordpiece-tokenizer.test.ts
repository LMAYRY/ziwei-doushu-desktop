// Token ids in the fixture were produced by the Python `tokenizers` library
// (Tokenizer.from_file + enable_truncation(512)) for the bundled BGE model.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { WordPieceTokenizer } from '../../lib/vectors/wordpiece';

const tokenizerPath = join(process.cwd(), '.local-library/taiwei-model/tokenizer.json');
if (!existsSync(tokenizerPath)) {
  console.log('SKIP wordpiece-tokenizer: tokenizer.json not found');
  process.exit(0);
}
const tokenizer = new WordPieceTokenizer(JSON.parse(readFileSync(tokenizerPath, 'utf8')));
const samples: { text: string; ids: number[] }[] = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/tokenizer-samples.json'), 'utf8'));

let failures = 0;
for (const { text, ids } of samples) {
  const actual = tokenizer.encode(text).ids;
  if (actual.length !== ids.length || actual.some((id, i) => id !== ids[i])) {
    failures++;
    console.error(`MISMATCH ${JSON.stringify(text.slice(0, 60))}\n  expected ${ids.join(',').slice(0, 300)}\n  actual   ${actual.join(',').slice(0, 300)}`);
  }
}
if (samples.length < 50) throw new Error(`Need at least 50 samples, got ${samples.length}`);
if (failures) {
  console.error(`wordpiece-tokenizer: ${failures}/${samples.length} mismatched`);
  process.exit(1);
}
console.log(`PASS wordpiece-tokenizer: ${samples.length} samples identical to Python tokenizers`);
