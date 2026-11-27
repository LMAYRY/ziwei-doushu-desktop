// 下载内置书库包（27 本参考书，正文加密，只供 AI 检索、不提供阅读），解压到 .local-library/。
// 书不在源代码仓库里，作为 Release 附件发布。用法：npm run library:download
// 可用 ZIWEI_LIBRARY_URL 指定其他下载地址或本地文件路径（例如网络不好时手动下载后用本地文件）。
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LIBRARY_URL = 'https://github.com/LMAYRY/ziwei-doushu-desktop/releases/download/v0.1.0/ziwei-library-v1.tar.gz';
const LIBRARY_SHA256 = '269144dea4418c53172623f3b95020544b3fa2d00454b654266e5b957450501e';

const root = new URL('..', import.meta.url).pathname;
const library = join(root, '.local-library');
const marker = join(library, 'library-pack.json');
const source = process.env.ZIWEI_LIBRARY_URL || LIBRARY_URL;

if (existsSync(marker)) {
  console.log('内置书库已存在，跳过。要重新下载，先删除 .local-library/books 和 .local-library/library-pack.json。');
  process.exit(0);
}
if (existsSync(join(library, 'books'))) {
  console.log('.local-library/books 已经有书（可能是你自己放的），不覆盖，跳过。');
  process.exit(0);
}

let buffer;
if (/^https?:\/\//.test(source)) {
  console.log(`下载内置书库（约 46 MB）：${source}`);
  const response = await fetch(source);
  if (!response.ok) throw new Error(`下载失败（HTTP ${response.status}）。可以用浏览器下载后，设置 ZIWEI_LIBRARY_URL=文件路径 再运行。`);
  buffer = Buffer.from(await response.arrayBuffer());
} else {
  console.log(`使用本地文件：${source}`);
  buffer = readFileSync(source);
}
const digest = createHash('sha256').update(buffer).digest('hex');
if (digest !== LIBRARY_SHA256 && !process.env.ZIWEI_LIBRARY_SKIP_CHECK) {
  throw new Error('书库包校验失败（文件和预期不一致），请重新下载。');
}

mkdirSync(library, { recursive: true });
const archive = join(library, '.library-pack.tar.gz');
writeFileSync(archive, buffer);
try {
  // Mac、Linux 和 Windows 10 及以上都自带 tar。
  execFileSync('tar', ['-xzf', archive, '-C', library], { stdio: 'inherit' });
} finally {
  rmSync(archive, { force: true });
}
const info = JSON.parse(readFileSync(marker, 'utf8'));
console.log(`内置书库已就绪：${info.books} 本书（${library}）`);
