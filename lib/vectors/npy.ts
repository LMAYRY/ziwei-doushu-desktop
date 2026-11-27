// Minimal readers for NumPy `.npy` files and uncompressed `.npz` archives
// (as written by `np.save` / `np.savez`). Supports little-endian float32
// matrices and fixed-width unicode (`<U…`) scalars, which is all the library
// vector files use.

export type NpyArray =
  | { dtype: 'float32'; shape: number[]; data: Float32Array }
  | { dtype: 'unicode'; shape: number[]; data: string[] };

const MAGIC = [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59]; // \x93NUMPY

export function parseNpy(buffer: Uint8Array): NpyArray {
  if (buffer.length < 10 || MAGIC.some((byte, i) => buffer[i] !== byte)) throw new Error('Not a .npy file');
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const major = buffer[6];
  const headerLength = major === 1 ? view.getUint16(8, true) : view.getUint32(8, true);
  const headerStart = major === 1 ? 10 : 12;
  const header = new TextDecoder(major === 3 ? 'utf-8' : 'latin1')
    .decode(buffer.subarray(headerStart, headerStart + headerLength));
  const descr = /'descr':\s*'([^']+)'/.exec(header)?.[1];
  const fortran = /'fortran_order':\s*(True|False)/.exec(header)?.[1];
  const shapeText = /'shape':\s*\(([^)]*)\)/.exec(header)?.[1];
  if (!descr || !fortran || shapeText === undefined) throw new Error('Malformed .npy header');
  if (fortran === 'True') throw new Error('Fortran-ordered arrays are not supported');
  const shape = shapeText.split(',').map(part => part.trim()).filter(Boolean).map(Number);
  if (shape.some(n => !Number.isInteger(n) || n < 0)) throw new Error('Malformed .npy shape');
  const count = shape.reduce((total, n) => total * n, 1);
  const offset = headerStart + headerLength;

  if (descr === '<f4') {
    const bytes = count * 4;
    if (offset + bytes > buffer.length) throw new Error('Truncated .npy data');
    // Copy so the result is aligned and independent from the source buffer
    // (Node's Buffer#slice shares memory, so copy explicitly).
    const copy = new Uint8Array(bytes);
    copy.set(buffer.subarray(offset, offset + bytes));
    return { dtype: 'float32', shape, data: new Float32Array(copy.buffer) };
  }
  const unicode = /^<U(\d+)$/.exec(descr);
  if (unicode) {
    const width = Number(unicode[1]);
    if (offset + count * width * 4 > buffer.length) throw new Error('Truncated .npy data');
    const data: string[] = [];
    for (let item = 0; item < count; item++) {
      let text = '';
      for (let i = 0; i < width; i++) {
        const code = view.getUint32(offset + (item * width + i) * 4, true);
        if (code === 0) break;
        text += String.fromCodePoint(code);
      }
      data.push(text);
    }
    return { dtype: 'unicode', shape, data };
  }
  throw new Error(`Unsupported .npy dtype ${descr}`);
}

/** Read the members of a stored (uncompressed) zip, including numpy's forced zip64 entries. */
export function parseNpz(buffer: Uint8Array): Map<string, NpyArray> {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip archive');
  let entries = view.getUint16(eocd + 10, true);
  let directory = view.getUint32(eocd + 16, true);
  if (entries === 0xffff || directory === 0xffffffff) {
    const locator = eocd - 20;
    if (locator < 0 || view.getUint32(locator, true) !== 0x07064b50) throw new Error('Missing zip64 locator');
    const record = Number(view.getBigUint64(locator + 8, true));
    if (view.getUint32(record, true) !== 0x06064b50) throw new Error('Missing zip64 end record');
    entries = Number(view.getBigUint64(record + 32, true));
    directory = Number(view.getBigUint64(record + 48, true));
  }

  const members = new Map<string, NpyArray>();
  let cursor = directory;
  for (let entry = 0; entry < entries; entry++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('Malformed zip directory');
    const method = view.getUint16(cursor + 10, true);
    let size = view.getUint32(cursor + 20, true);
    const uncompressed = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    let local = view.getUint32(cursor + 42, true);
    const name = new TextDecoder().decode(buffer.subarray(cursor + 46, cursor + 46 + nameLength));

    // zip64 extra field: values appear only for the header fields set to 0xffffffff, in this order.
    let extra = cursor + 46 + nameLength;
    const extraEnd = extra + extraLength;
    while (extra + 4 <= extraEnd) {
      const id = view.getUint16(extra, true);
      const length = view.getUint16(extra + 2, true);
      if (id === 0x0001) {
        let field = extra + 4;
        if (uncompressed === 0xffffffff) field += 8;
        if (size === 0xffffffff) { size = Number(view.getBigUint64(field, true)); field += 8; }
        if (local === 0xffffffff) local = Number(view.getBigUint64(field, true));
      }
      extra += 4 + length;
    }
    if (method !== 0) throw new Error(`Compressed npz member ${name} is not supported`);
    if (view.getUint32(local, true) !== 0x04034b50) throw new Error('Malformed zip local header');
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (start + size > buffer.length) throw new Error('Truncated zip member');
    members.set(name.replace(/\.npy$/, ''), parseNpy(buffer.subarray(start, start + size)));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return members;
}

// ── Writing (same layout as `np.savez`: an uncompressed zip of `.npy` members).

export type NpyInput =
  | { dtype: 'float32'; shape: number[]; data: Float32Array }
  | { dtype: 'unicode'; width: number; value: string };

/** One `.npy` file (format 1.0, header padded to a multiple of 64 bytes like numpy). */
export function encodeNpy(array: NpyInput): Uint8Array {
  const shape = array.dtype === 'float32' ? array.shape : [];
  const descr = array.dtype === 'float32' ? '<f4' : `<U${array.width}`;
  const shapeText = shape.length === 1 ? `(${shape[0]},)` : `(${shape.join(', ')})`;
  let header = `{'descr': '${descr}', 'fortran_order': False, 'shape': ${shapeText}, }`;
  header += ' '.repeat(63 - ((10 + header.length) % 64)) + '\n';
  let body: Uint8Array;
  if (array.dtype === 'float32') {
    const expected = shape.reduce((total, n) => total * n, 1);
    if (array.data.length !== expected) throw new Error('Shape does not match data length');
    body = new Uint8Array(array.data.buffer, array.data.byteOffset, array.data.byteLength);
  } else {
    const codes = Array.from(array.value, char => char.codePointAt(0)!);
    if (codes.length > array.width) throw new Error('String longer than its dtype width');
    body = new Uint8Array(array.width * 4);
    const view = new DataView(body.buffer);
    codes.forEach((code, i) => view.setUint32(i * 4, code, true));
  }
  const out = new Uint8Array(10 + header.length + body.length);
  out.set([...MAGIC, 1, 0]);
  new DataView(out.buffer).setUint16(8, header.length, true);
  out.set(new TextEncoder().encode(header), 10);
  out.set(body, 10 + header.length);
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** An uncompressed `.npz` archive readable by `np.load` and `parseNpz`. Members up to 4 GB. */
export function encodeNpz(members: Record<string, NpyInput>): Uint8Array {
  const locals: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [key, array] of Object.entries(members)) {
    const name = new TextEncoder().encode(`${key}.npy`);
    const data = encodeNpy(array);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const entry = new Uint8Array(46 + name.length);
    const cv = new DataView(entry.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    entry.set(name, 46);
    locals.push(local, data);
    central.push(entry);
    offset += local.length + data.length;
  }
  const directorySize = central.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, directorySize, true);
  ev.setUint32(16, offset, true);
  const parts = [...locals, ...central, end];
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}
