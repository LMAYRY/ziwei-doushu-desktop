// 内置书「上锁」后的解密（加密见 scripts/desktop/seal.mjs）。只在服务端检索时用，界面和接口不返回内置书全文。
import { createDecipheriv, createHash } from 'node:crypto';

const SEAL_SECRET = 'ziwei-desktop/bundled-books/v1';
const key = createHash('sha256').update(SEAL_SECRET).digest();

export function openSealed(sealed: string): string {
  const buffer = Buffer.from(sealed, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, buffer.subarray(0, 12));
  decipher.setAuthTag(buffer.subarray(12, 28));
  return Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]).toString('utf8');
}

/** 加密文件里记录的原文 sha256（向量按原文校验）；不是加密文件时返回 undefined。 */
export function sealedSourceSha256(bytes: Uint8Array): string | undefined {
  try {
    const value = JSON.parse(Buffer.from(bytes).toString('utf8')) as { sealed?: unknown; sourceSha256?: unknown };
    return typeof value?.sealed === 'string' && typeof value.sourceSha256 === 'string' ? value.sourceSha256 : undefined;
  } catch {
    return undefined;
  }
}
