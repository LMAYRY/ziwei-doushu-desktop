// Builds everything the desktop app needs into dist-desktop/:
//   server/     Next standalone server (+ .next/static, public)  -> Contents/Resources/server
//   resources/  read-only bundled data (model, books, 太微赋) -> Contents/Resources/data
//   app/        Electron main process (package.json + electron/*)  -> Contents/Resources/app.asar
// Then checks that no secrets or development-only files slipped in.
//
// Usage: node scripts/desktop/build.mjs [--skip-next] [--platform darwin|win32]
//   darwin（默认）：Mac arm64；win32：Windows x64（在 Mac 上也能打，原生文件取 onnxruntime 自带的 win32/x64）。
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { sealBookJson, sealTaiweiJson } from './seal.mjs';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dist = join(root, 'dist-desktop');
const serverOut = join(dist, 'server');
const resourcesOut = join(dist, 'resources');
const appOut = join(dist, 'app');
const library = join(root, '.local-library');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const platformArg = process.argv.indexOf('--platform');
const target = platformArg > 0 ? process.argv[platformArg + 1] : 'darwin';
if (target !== 'darwin' && target !== 'win32') {
  console.error(`不支持的平台 ${target}（只支持 darwin、win32）`);
  process.exit(1);
}
const arch = target === 'darwin' ? 'arm64' : 'x64';

function step(message) {
  console.log(`\n▸ ${message}`);
}

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

function walk(directory, files = []) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const stat = lstatSync(path);
    if (stat.isDirectory()) walk(path, files);
    else if (stat.isFile()) files.push(path);
  }
  return files;
}

// ── 1. next build, with local .env files hidden so nothing from them is read or inlined.
if (!process.argv.includes('--skip-next')) {
  step('next build（构建期间暂时移开 .env.local 等本地环境文件）');
  const hidden = readdirSync(root)
    .filter(name => /^\.env/.test(name) && name !== '.env.example')
    .map(name => [join(root, name), join(root, `${name}.desktop-build-hidden`)]);
  for (const [from, to] of hidden) renameSync(from, to);
  try {
    const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };
    for (const key of Object.keys(env)) {
      if (/^(AI_PROVIDER|DEEPSEEK_|SILICONFLOW_|MIMO_|ANTHROPIC_|NEXT_PUBLIC_)/.test(key)) delete env[key];
    }
    execFileSync(join(root, 'node_modules', '.bin', 'next'), ['build'], { cwd: root, stdio: 'inherit', env });
  } finally {
    for (const [from, to] of hidden) renameSync(to, from);
  }
}

// ── 2. Standalone server.
step('复制 standalone 服务端');
const standalone = join(root, '.next', 'standalone');
if (!existsSync(join(standalone, 'server.js'))) fail('.next/standalone/server.js 不存在，先运行 next build');
rmSync(dist, { recursive: true, force: true });
// Keep Turbopack's relative symlinks (.next/node_modules/<pkg>-<hash> -> ../../node_modules/<pkg>) as they are.
cpSync(standalone, serverOut, { recursive: true, verbatimSymlinks: true });
cpSync(join(root, '.next', 'static'), join(serverOut, '.next', 'static'), { recursive: true });
if (existsSync(join(root, 'public'))) cpSync(join(root, 'public'), join(serverOut, 'public'), { recursive: true });
// Next's build cache is not needed at runtime.
rmSync(join(serverOut, '.next', 'cache'), { recursive: true, force: true });

// onnxruntime-node ships binaries for every platform; keep only the target's (Mac arm64 or Windows x64).
const ort = join(serverOut, 'node_modules', 'onnxruntime-node');
if (!existsSync(ort)) fail('standalone 产物里缺少 onnxruntime-node');
const napi = join(ort, 'bin', 'napi-v3');
for (const platform of readdirSync(napi)) {
  if (platform !== target) rmSync(join(napi, platform), { recursive: true, force: true });
}
for (const other of readdirSync(join(napi, target))) {
  if (other !== arch) rmSync(join(napi, target, other), { recursive: true, force: true });
}
const nativeFiles = target === 'darwin'
  ? ['onnxruntime_binding.node', 'libonnxruntime.1.19.2.dylib']
  : ['onnxruntime_binding.node', 'onnxruntime.dll', 'DirectML.dll'];
for (const file of nativeFiles) {
  if (!existsSync(join(napi, target, arch, file))) fail(`缺少原生文件 onnxruntime-node/bin/napi-v3/${target}/${arch}/${file}`);
}
// sharp（Next 的图片优化，本应用没用到）的原生包是按打包机平台装的；Windows 版不带 Mac 的原生文件。
if (target !== 'darwin') {
  for (const name of readdirSync(join(serverOut, 'node_modules', '@img')).filter(name => name.includes('darwin'))) {
    rmSync(join(serverOut, 'node_modules', '@img', name), { recursive: true, force: true });
  }
}

// pdf.js for 「导入我的书」: the worker module and the CMaps are loaded at runtime.
const pdfjs = join(serverOut, 'node_modules', 'pdfjs-dist');
for (const file of ['legacy/build/pdf.mjs', 'legacy/build/pdf.worker.mjs', 'cmaps/UniGB-UCS2-H.bcmap', 'cmaps/UniCNS-UCS2-H.bcmap']) {
  if (!existsSync(join(pdfjs, file))) fail(`standalone 产物里缺少 pdfjs-dist/${file}`);
}
rmSync(join(serverOut, 'node_modules', '@napi-rs'), { recursive: true, force: true });

// ── 3. Read-only bundled data. Only text + vectors: no page scans, PDFs or Python deps.
step('整理内置只读资料');
const libraryOut = join(resourcesOut, '.local-library');
const copy = (from, to) => {
  if (!existsSync(from)) fail(`缺少内置资料 ${relative(root, from)}`);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { dereference: true });
};
// 内置书正文加密后再放进安装包（scripts/desktop/seal.mjs），其余文件原样复制。
const seal = (from, to, transform) => {
  if (!existsSync(from)) fail(`缺少内置资料 ${relative(root, from)}`);
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, transform(readFileSync(from)));
};
// 检索模型（导入书、AI 检索都要用）：没有时提示先运行 npm run model:download。
const modelDir = join(library, 'taiwei-model');
if (!existsSync(join(modelDir, 'model.onnx'))) fail('缺少检索模型 .local-library/taiwei-model/model.onnx，请先运行 npm run model:download');
for (const file of ['model.onnx', 'tokenizer.json']) copy(join(modelDir, file), join(libraryOut, 'taiwei-model', file));
// 内置书库（可选）：开源代码自己编译时没有，安装包里就只有空的书库，用户自己导入书。
if (existsSync(join(library, 'taiwei.json'))) {
  seal(join(library, 'taiwei.json'), join(libraryOut, 'taiwei.json'), sealTaiweiJson);
  for (const file of ['taiwei-vectors.npy', 'taiwei-vectors.sha256']) copy(join(library, file), join(libraryOut, file));
}
if (existsSync(join(library, 'authors.json'))) copy(join(library, 'authors.json'), join(libraryOut, 'authors.json'));
const bookIds = existsSync(join(library, 'books')) ? readdirSync(join(library, 'books')).filter(id => /^[a-f0-9]{24}$/.test(id)) : [];
for (const id of bookIds) {
  seal(join(library, 'books', id, 'book.json'), join(libraryOut, 'books', id, 'book.json'), sealBookJson);
  copy(join(library, 'books', id, 'vectors.npz'), join(libraryOut, 'books', id, 'vectors.npz'));
}
console.log(bookIds.length ? `  内置书库 ${bookIds.length} 本书（正文已加密）` : '  没有内置书库（.local-library/books 不存在），安装包里只有空书库');

// OCR for scanned PDFs (「导入我的书」): Mac compiles the Vision helper; Windows uses the built-in OCR
// through a PowerShell script (no runtime to install).
mkdirSync(join(resourcesOut, 'bin'), { recursive: true });
if (target === 'darwin') {
  step('编译文字识别小程序 ziwei-ocr');
  execFileSync('swiftc', [
    '-O', '-target', 'arm64-apple-macos12',
    '-module-cache-path', join(root, '.next', 'cache', 'swift-modules'),
    join(root, 'scripts', 'desktop', 'pdf-ocr.swift'),
    '-o', join(resourcesOut, 'bin', 'ziwei-ocr'),
  ], { stdio: 'inherit' });
} else {
  step('复制 Windows 文字识别脚本 pdf-ocr.ps1');
  const script = readFileSync(join(root, 'scripts', 'desktop', 'pdf-ocr.ps1'));
  // Windows PowerShell 5.1 只有带 BOM 时才按 UTF-8 读脚本。
  if (!(script[0] === 0xef && script[1] === 0xbb && script[2] === 0xbf)) fail('pdf-ocr.ps1 必须是带 BOM 的 UTF-8');
  writeFileSync(join(resourcesOut, 'bin', 'pdf-ocr.ps1'), script);
}

// ── 4. Electron main process, as its own tiny app (no node_modules).
step('复制 Electron 主进程');
cpSync(join(root, 'electron'), appOut, { recursive: true });
writeFileSync(join(appOut, 'package.json'), `${JSON.stringify({
  name: 'ziwei-desktop',
  productName: '紫微斗数',
  version: pkg.version,
  description: '紫微斗数排盘与古籍',
  author: 'ziwei',
  license: 'MIT',
  main: 'main.js',
}, null, 2)}\n`);

writeFileSync(join(dist, 'target.json'), `${JSON.stringify({ platform: target, arch })}\n`);

// ── 5. Checks.
step('检查产物');
const files = walk(dist);
const problems = [];
const forbiddenNames = [
  [/(^|\/)\.env(?!\.example$)[^/]*$/, '.env 文件'],
  [/(^|\/)taiwei-model\/deps(\/|$)/, 'taiwei-model/deps'],
  [/\.local-library\/books\/[^/]+\/(?!book\.json$|vectors\.npz$)[^/]+$/, '书页图片或 PDF'],
  [/(^|\/)scripts\/(regression|parity)\//, '测试脚本'],
  [/(^|\/)fixtures\//, '测试数据'],
  // 倪师《天纪》课程原话是 CC BY-NC-SA（不许商用），不能进付费安装包。
  [/tianji-ziwei|entries\.jsonl$/, '《天纪》课程原话'],
  // 授权服务端（含私钥的 .dev.vars、wrangler 本地库）只在服务器上跑。
  [/(^|\/)(license-server|\.wrangler)(\/|$)|\.dev\.vars$/, '授权服务端文件'],
];
for (const file of files) {
  const rel = relative(dist, file);
  for (const [pattern, label] of forbiddenNames) if (pattern.test(rel)) problems.push(`${label}: ${rel}`);
}
// No value from the developer's .env.local, nor the license server's private key and admin token
// (license-server/.dev.vars), may appear anywhere in the build.
const secretsIn = (file) => existsSync(file)
  ? readFileSync(file, 'utf8').split(/\r?\n/)
    .map(line => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
    .filter(match => match && /KEY|SECRET|TOKEN|PASSWORD/.test(match[1]) && match[2].replace(/^['"]|['"]$/g, '').length >= 12)
    .map(match => [match[1], Buffer.from(match[2].replace(/^['"]|['"]$/g, ''))])
  : [];
const secrets = [...secretsIn(join(root, '.env.local')), ...secretsIn(join(root, 'license-server', '.dev.vars')), ...secretsIn(join(root, 'license-server', '.prod.vars'))];
for (const file of files) {
  if (statSync(file).size > 64 * 1024 * 1024) continue;
  const content = readFileSync(file);
  for (const [name, value] of secrets) if (content.includes(value)) problems.push(`${name} 的值出现在 ${relative(dist, file)}`);
}
if (problems.length) fail(`产物里有不该打包的内容：\n  ${problems.join('\n  ')}`);

const size = files.reduce((total, file) => total + statSync(file).size, 0);
const digest = createHash('sha256').update(readFileSync(join(serverOut, 'server.js'))).digest('hex').slice(0, 12);
console.log(`  ${files.length} 个文件，共 ${(size / 1024 / 1024).toFixed(1)} MB；已核对 ${secrets.length} 个密钥均未出现（server.js ${digest}）`);
console.log(`\n✓ dist-desktop 就绪（${target === 'darwin' ? 'Mac arm64' : 'Windows x64'}）`);
