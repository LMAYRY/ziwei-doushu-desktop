// Node port of `scripts/library-vectors.py search`. Vectors stay in memory and
// are reloaded only when book.json / vectors.npz change on disk.
import { createHash } from 'node:crypto';
import { sealedSourceSha256 } from '../classics/sealed';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Encoder, QUERY_PREFIX, VECTOR_DIMENSIONS } from './encoder';
import { parseNpy, parseNpz } from './npy';

export type VectorHits = { sample: number[]; books: { id: string; index: number }[] };

const BOOK_ID = /^[a-f0-9]{24}$/;
const SKIPPED_BOOKS = new Set(['e994681804a9a788ee3215a1']); // 安星法详解
const MIN_SCORE = 0.6;
const HITS_PER_BOOK = 2;
const MAX_BOOK_HITS = 8;

type Matrix = { rows: number; data: Float32Array };
type Cached = { key: string; matrix: Matrix | null };

const encoders = new Map<string, Promise<Encoder>>();
const matrices = new Map<string, Cached>();

export function getEncoder(modelDirectory: string) {
  let encoder = encoders.get(modelDirectory);
  if (!encoder) {
    encoder = Encoder.load(modelDirectory);
    encoders.set(modelDirectory, encoder);
    encoder.catch(() => encoders.delete(modelDirectory));
  }
  return encoder;
}

function sha256(buffer: Uint8Array) {
  return createHash('sha256').update(buffer).digest('hex');
}

function toMatrix(shape: number[], data: Float32Array): Matrix | null {
  return shape.length === 2 && shape[1] === VECTOR_DIMENSIONS ? { rows: shape[0], data } : null;
}

async function fileKey(...paths: string[]) {
  const stats = await Promise.all(paths.map(path => stat(path)));
  return stats.map(s => `${s.size}:${s.mtimeMs}`).join('|');
}

async function cached(cacheKey: string, files: string[], load: () => Promise<Matrix | null>) {
  const key = await fileKey(...files);
  const hit = matrices.get(cacheKey);
  if (hit?.key === key) return hit.matrix;
  const matrix = await load();
  matrices.set(cacheKey, { key, matrix });
  return matrix;
}

/** Vectors of one imported book, or null when missing or built from a different book.json. */
export async function readBookVectors(directory: string) {
  const bookPath = join(directory, 'book.json');
  const vectorsPath = join(directory, 'vectors.npz');
  return cached(directory, [bookPath, vectorsPath], async () => {
    const [book, archive] = await Promise.all([readFile(bookPath), readFile(vectorsPath)]);
    const members = parseNpz(archive);
    const digest = members.get('source_sha256');
    const vectors = members.get('vectors');
    // 内置书打包时正文已加密，按加密前原文的 sha256 校验（scripts/desktop/seal.mjs）。
    if (digest?.dtype !== 'unicode' || digest.data[0] !== (sealedSourceSha256(book) ?? sha256(book))) return null;
    return vectors?.dtype === 'float32' ? toMatrix(vectors.shape, vectors.data) : null;
  });
}

async function readTaiweiVectors(library: string) {
  const source = join(library, 'taiwei.json');
  const digestPath = join(library, 'taiwei-vectors.sha256');
  const vectorsPath = join(library, 'taiwei-vectors.npy');
  return cached(vectorsPath, [source, digestPath, vectorsPath], async () => {
    const [text, digest, vectors] = await Promise.all([readFile(source), readFile(digestPath, 'utf8'), readFile(vectorsPath)]);
    if ((sealedSourceSha256(text) ?? sha256(text)) !== digest.trim()) return null;
    const array = parseNpy(vectors);
    return array.dtype === 'float32' ? toMatrix(array.shape, array.data) : null;
  });
}

/** Indices of the two best rows scoring ≥ 0.60, best first. */
export function topHits(matrix: Matrix, query: Float32Array) {
  const scored: [number, number][] = [];
  for (let row = 0; row < matrix.rows; row++) {
    let score = 0;
    const offset = row * VECTOR_DIMENSIONS;
    for (let i = 0; i < VECTOR_DIMENSIONS; i++) score += matrix.data[offset + i] * query[i];
    scored.push([row, score]);
  }
  return scored.sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, HITS_PER_BOOK)
    .filter(([, score]) => score >= MIN_SCORE);
}

async function swallow<T>(promise: Promise<T>, fallback: T) {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

/** `<id>/` directories under each root; an id found in an earlier root wins (bundled before imported). */
async function bookDirectories(roots: string[]) {
  const found = new Map<string, string>();
  for (const root of roots) {
    for (const id of await swallow(readdir(root), [] as string[])) {
      if (BOOK_ID.test(id) && !SKIPPED_BOOKS.has(id) && !found.has(id)) found.set(id, join(root, id));
    }
  }
  return [...found].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Searches 太微赋 and the books in `<library>/books`, plus any `extraBookRoots`
 * (the user's imported books), which are ranked together with the bundled ones.
 */
export async function searchVectors(library: string, question: string, extraBookRoots: string[] = []): Promise<VectorHits> {
  const text = question.trim();
  if (!text) return { sample: [], books: [] };
  const encoder = await getEncoder(join(library, 'taiwei-model'));
  const [query] = await encoder.encode([QUERY_PREFIX + text]);

  const taiwei = await swallow(readTaiweiVectors(library), null);
  const sample = taiwei ? topHits(taiwei, query).map(([index]) => index) : [];

  const books: { score: number; id: string; index: number }[] = [];
  for (const [id, directory] of await bookDirectories([join(library, 'books'), ...extraBookRoots])) {
    const matrix = await swallow(readBookVectors(directory), null);
    if (matrix) books.push(...topHits(matrix, query).map(([index, score]) => ({ score, id, index })));
  }
  // Same ordering as Python's `sorted(reverse=True)` on (score, id, index) tuples.
  books.sort((a, b) => b.score - a.score || (a.id < b.id ? 1 : a.id > b.id ? -1 : b.index - a.index));
  return { sample, books: books.slice(0, MAX_BOOK_HITS).map(({ id, index }) => ({ id, index })) };
}
