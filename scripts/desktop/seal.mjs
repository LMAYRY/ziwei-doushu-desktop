// 打包时给内置书「上锁」：book.json 里的正文（chunks）和 taiwei.json 用 AES-256-GCM 加密后再放进安装包，
// 界面和接口都不提供内置书的阅读页，只在检索时由服务端解密交给 AI（lib/classics/sealed.ts 解密）。
// 密钥写在代码里，开源后懂技术的人能还原，作用是不让普通用户直接打开安装包里的文件读到全文。
// sourceSha256 记的是加密前原文件的 sha256，向量文件仍按原文校验，不用重建向量。
import { createCipheriv, createHash, randomBytes } from 'node:crypto';

export const SEAL_SECRET = 'ziwei-desktop/bundled-books/v1';
const key = createHash('sha256').update(SEAL_SECRET).digest();
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');

export function sealText(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}

/** book.json → 元数据保持明文（书名、页数等），正文 chunks 加密。 */
export function sealBookJson(bytes) {
  const parsed = JSON.parse(bytes.toString('utf8'));
  // 已经加密过（例如从书库包解出来的）就原样返回。
  if (typeof parsed.sealed === 'string') return bytes.toString('utf8');
  const { chunks, ...meta } = parsed;
  return JSON.stringify({ ...meta, sealed: sealText(JSON.stringify(chunks)), sourceSha256: sha256(bytes) });
}

/** taiwei.json（太微赋预览文字）整体加密。 */
export function sealTaiweiJson(bytes) {
  const parsed = JSON.parse(bytes.toString('utf8'));
  if (!Array.isArray(parsed) && typeof parsed?.sealed === 'string') return bytes.toString('utf8');
  return JSON.stringify({ sealed: sealText(bytes.toString('utf8')), sourceSha256: sha256(bytes) });
}
