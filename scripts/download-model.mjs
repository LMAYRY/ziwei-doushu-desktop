// 下载检索用的向量模型：BAAI bge-small-zh-v1.5（MIT），Xenova 转成的 ONNX int8 版本，约 24 MB。
// 放到 .local-library/taiwei-model/，导入书、AI 检索和打包都用它。用法：npm run model:download
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://huggingface.co/Xenova/bge-small-zh-v1.5/resolve/main';
const FILES = [
  { from: 'onnx/model_int8.onnx', to: 'model.onnx', sha256: 'b9837c19ce154ff0726d398ee77abbc03a7faf0476c6f93016c84e531be7ebb5' },
  { from: 'tokenizer.json', to: 'tokenizer.json', sha256: '48cea5d44424912a6fd1ea647bf4fe50b55ab8b1e5879c3275f80e339e8fae26' },
];
const dir = join(new URL('..', import.meta.url).pathname, '.local-library', 'taiwei-model');
mkdirSync(dir, { recursive: true });
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');

for (const file of FILES) {
  const target = join(dir, file.to);
  if (existsSync(target) && sha256(readFileSync(target)) === file.sha256) {
    console.log(`已存在：${file.to}`);
    continue;
  }
  console.log(`下载 ${file.from} …`);
  const response = await fetch(`${BASE}/${file.from}`);
  if (!response.ok) throw new Error(`下载失败（HTTP ${response.status}）：${file.from}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (sha256(buffer) !== file.sha256) throw new Error(`校验失败：${file.from}（文件和预期不一致，请重试）`);
  writeFileSync(target, buffer);
  console.log(`完成：${file.to}（${(buffer.length / 1024 / 1024).toFixed(1)} MB）`);
}
console.log(`模型已就绪：${dir}`);
