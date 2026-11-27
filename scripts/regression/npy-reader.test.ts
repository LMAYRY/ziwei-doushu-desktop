// Fixtures were written by numpy: np.save(v) and np.savez(source_sha256='ab'*32, vectors=v)
// with v = np.arange(12, dtype=float32).reshape(3, 4) / 7. np.savez forces zip64 headers.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseNpy, parseNpz } from '../../lib/vectors/npy';

const fixtures = join(__dirname, 'fixtures');
const expected = Float32Array.from({ length: 12 }, (_, i) => i / 7);

const npy = parseNpy(readFileSync(join(fixtures, 'sample.npy')));
assert.equal(npy.dtype, 'float32');
assert.deepEqual(npy.shape, [3, 4]);
assert.deepEqual([...npy.data], [...expected]);

const npz = parseNpz(readFileSync(join(fixtures, 'sample.npz')));
assert.deepEqual([...npz.keys()].sort(), ['source_sha256', 'vectors']);
const digest = npz.get('source_sha256')!;
assert.equal(digest.dtype, 'unicode');
assert.deepEqual(digest.shape, []);
assert.deepEqual(digest.data, ['ab'.repeat(32)]);
const vectors = npz.get('vectors')!;
assert.equal(vectors.dtype, 'float32');
assert.deepEqual(vectors.shape, [3, 4]);
assert.deepEqual([...vectors.data], [...expected]);

assert.throws(() => parseNpy(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])), /Not a .npy/);
assert.throws(() => parseNpz(new Uint8Array(64)), /Not a zip/);
console.log('PASS npy-reader');
