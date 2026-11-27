// Node port of `scripts/library-vectors.py build` for one book.
import type { Encoder } from './encoder';
import { VECTOR_DIMENSIONS } from './encoder';

export type Chunk = { page: number; text: string };

/** Python batches 16 texts at a time; the int8 model's quantisation scale depends on the batch. */
export const BUILD_BATCH = 16;

const SENTENCE = /[^。！？；]+[。！？；]*/g;

/** Each chunk, prefixed with the last sentence (≤ 100 chars) of the previous chunk on the same page. */
export function overlappingTexts(chunks: Chunk[]) {
  return chunks.map((chunk, index) => {
    if (index && chunks[index - 1].page === chunk.page) {
      const sentences = chunks[index - 1].text.match(SENTENCE);
      if (sentences) return Array.from(sentences[sentences.length - 1]).slice(-100).join('') + chunk.text;
    }
    return chunk.text;
  });
}

/**
 * Document vectors as one `[texts.length, 512]` row-major matrix, encoded in order in batches of 16,
 * each padded to its longest text, exactly like the Python build. `onBatch` reports texts done so far;
 * when `signal` aborts, the build stops before the next batch and throws the abort reason.
 */
export async function buildVectors(
  encoder: Encoder,
  texts: string[],
  { onBatch, signal }: { onBatch?: (done: number) => void; signal?: AbortSignal } = {},
) {
  const matrix = new Float32Array(texts.length * VECTOR_DIMENSIONS);
  for (let start = 0; start < texts.length; start += BUILD_BATCH) {
    signal?.throwIfAborted();
    const vectors = await encoder.encode(texts.slice(start, start + BUILD_BATCH));
    vectors.forEach((vector, row) => matrix.set(vector, (start + row) * VECTOR_DIMENSIONS));
    onBatch?.(Math.min(start + BUILD_BATCH, texts.length));
  }
  return matrix;
}
