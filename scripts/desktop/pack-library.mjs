// 把内置书库打成一个书库包，作为 Release 附件发布（源代码仓库里不放书）。
// 包里的书和安装包里一样：正文加密（scripts/desktop/seal.mjs），只供检索、不提供阅读。
// 用法：node scripts/desktop/pack-library.mjs   → dist-desktop/release/ziwei-library-v1.tar.gz
// 打完会打印 sha256，把它填进 scripts/download-library.mjs 的 LIBRARY_SHA256。
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sealBookJson, sealTaiweiJson } from './seal.mjs';

export const LIBRARY_PACK = 'ziwei-library-v1.tar.gz';
const root = new URL('../..', import.meta.url).pathname;
const library = join(root, '.local-library');
const stage = join(root, 'dist-desktop', 'library-pack');
const out = join(root, 'dist-desktop', 'release', LIBRARY_PACK);

if (!existsSync(join(library, 'books'))) throw new Error('没有 .local-library/books，无法打书库包');
rmSync(stage, { recursive: true, force: true });
mkdirSync(join(stage, 'books'), { recursive: true });

const ids = readdirSync(join(library, 'books')).filter(id => /^[a-f0-9]{24}$/.test(id));
for (const id of ids) {
  mkdirSync(join(stage, 'books', id));
  writeFileSync(join(stage, 'books', id, 'book.json'), sealBookJson(readFileSync(join(library, 'books', id, 'book.json'))));
  cpSync(join(library, 'books', id, 'vectors.npz'), join(stage, 'books', id, 'vectors.npz'));
}
if (existsSync(join(library, 'taiwei.json'))) {
  writeFileSync(join(stage, 'taiwei.json'), sealTaiweiJson(readFileSync(join(library, 'taiwei.json'))));
  for (const file of ['taiwei-vectors.npy', 'taiwei-vectors.sha256']) cpSync(join(library, file), join(stage, file));
}
if (existsSync(join(library, 'authors.json'))) cpSync(join(library, 'authors.json'), join(stage, 'authors.json'));
writeFileSync(join(stage, 'library-pack.json'), `${JSON.stringify({ version: 1, books: ids.length, createdAt: new Date().toISOString().slice(0, 10) })}\n`);

// 包里不能有明文正文：随便抽一段原文，确认在打出来的文件里搜不到。
const sample = JSON.parse(readFileSync(join(library, 'books', ids[0], 'book.json'), 'utf8')).chunks.find(chunk => chunk.text.length > 30)?.text.slice(0, 20);
const leaked = (() => {
  if (!sample) return false;
  try {
    return execFileSync('grep', ['-rlF', sample, stage], { encoding: 'utf8' }).trim().length > 0;
  } catch {
    return false; // grep 没找到时退出码为 1
  }
})();
if (leaked) throw new Error('书库包里出现了明文正文');

mkdirSync(join(root, 'dist-desktop', 'release'), { recursive: true });
execFileSync('tar', ['-czf', out, '-C', stage, '.']);
const digest = createHash('sha256').update(readFileSync(out)).digest('hex');
console.log(`书库包：${out}`);
console.log(`${ids.length} 本书，${(readFileSync(out).length / 1024 / 1024).toFixed(1)} MB`);
console.log(`sha256: ${digest}`);
