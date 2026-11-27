// 生成 lib/licenses.ts：安装包里实际用到的开源组件、模型和字体，附版权声明与许可全文。
// 用法：node scripts/desktop/gen-licenses.mjs（升级依赖后重跑，提交生成的文件）。
// MIT / ISC 等短许可逐个附全文；Apache-2.0 各组件只列版权，全文在页面末尾附一份。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url).pathname;
const read = path => readFileSync(join(root, path), 'utf8').trim();
const pkg = name => JSON.parse(read(`node_modules/${name}/package.json`));

function licenseText(name) {
  for (const file of ['LICENSE', 'LICENSE.md', 'license.md', 'license', 'LICENSE.txt']) {
    const path = `node_modules/${name}/${file}`;
    if (existsSync(join(root, path))) return read(path);
  }
  return null;
}

const mit = (copyright) => `MIT License\n\n${copyright}\n\n${read('LICENSE').split('\n').slice(4).join('\n').trim()}`;

/** [显示名, npm 包名, 用途, 缺 LICENSE 文件时的版权行, 项目地址（package.json 里的不准时）] */
const PACKAGES = [
  ['iztro', 'iztro', '星曜安星计算'],
  ['lunar-javascript', 'lunar-javascript', '公历农历换算、干支节气'],
  ['Electron', 'electron', '桌面应用外壳（内含 Chromium 与 Node.js，其许可随安装包附在 LICENSES.chromium.html）'],
  ['Next.js', 'next', '本地页面与接口服务'],
  ['React / React DOM', 'react', '界面', undefined, 'https://github.com/facebook/react'],
  ['styled-jsx', 'styled-jsx', '界面样式（Next.js 依赖）'],
  ['@next/env', '@next/env', '环境变量读取（Next.js 依赖）', 'Copyright (c) 2025 Vercel, Inc.'],
  ['client-only', 'client-only', 'Next.js 依赖', 'Copyright (c) Meta Platforms, Inc. and affiliates.', 'https://github.com/facebook/react'],
  ['@swc/helpers', '@swc/helpers', '编译辅助函数（Next.js 依赖）'],
  ['sharp', 'sharp', '图片处理（Next.js 依赖）'],
  ['@img/colour', '@img/colour', '颜色处理（sharp 依赖）'],
  ['detect-libc', 'detect-libc', '运行环境检测（sharp 依赖）'],
  ['semver', 'semver', '版本号比较（sharp 依赖）'],
  ['framer-motion', 'framer-motion', '界面动画'],
  ['clsx', 'clsx', '界面样式拼接'],
  ['html2canvas', 'html2canvas', '命盘截图分享'],
  ['PDF.js（pdfjs-dist）', 'pdfjs-dist', '读取导入的 PDF'],
  ['ONNX Runtime（onnxruntime-node）', 'onnxruntime-node', '本机运行检索向量模型', 'Copyright (c) Microsoft Corporation'],
];

const entries = [{
  name: '紫微斗数开源排盘引擎（ziwei-doushu）',
  url: 'https://github.com/Renhuai123/ziwei-doushu',
  use: '排盘算法、格局与星曜知识库、界面的原始代码',
  license: 'MIT',
  text: read('LICENSE'),
}];

for (const [name, id, use, fallback, homepage] of PACKAGES) {
  const info = pkg(id);
  const license = info.license;
  const url = homepage ?? (typeof info.repository === 'string' ? info.repository : info.repository?.url ?? info.homepage ?? '')
    .replace(/^git\+/, '').replace(/\.git$/, '').replace(/^git:\/\//, 'https://')
    .replace(/^(github:|git@github\.com:)/, 'https://github.com/').replace(/^([\w-]+\/[\w.-]+)$/, 'https://github.com/$1');
  let text = licenseText(id);
  if (license === 'Apache-2.0') text = '按 Apache License 2.0 授权，许可全文见本页末尾。';
  else if (!text) {
    if (license !== 'MIT' || !fallback) throw new Error(`${id}: 没有 LICENSE 文件，需要补版权行`);
    text = mit(fallback);
  }
  entries.push({ name, url, use, license, text });
}

entries.push({
  name: 'BGE 中文向量模型（BAAI bge-small-zh-v1.5，Xenova 转换的 ONNX int8 版本）',
  url: 'https://huggingface.co/Xenova/bge-small-zh-v1.5',
  use: '把书籍段落和提问转换成向量，在本机检索相关段落',
  license: 'MIT',
  text: mit('Copyright (c) 2022 staoxiao'),
});

// OFL 正文（不含各字体自己的版权行）取自 SIL 官方文本。
const ofl = readFileSync(new URL('./ofl-1.1.txt', import.meta.url), 'utf8').trim();
entries.push({
  name: 'Noto Serif SC（思源宋体）',
  url: 'https://fonts.google.com/noto/specimen/Noto+Serif+SC',
  use: '正文字体',
  license: 'OFL-1.1',
  text: `Copyright 2017 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'.\n\n${ofl}`,
});

const apache = read('node_modules/pdfjs-dist/LICENSE').split('\n').map(line => line.trim()).join('\n').replace(/\n{3,}/g, '\n\n');

const header = `// 由 scripts/desktop/gen-licenses.mjs 生成，不要手改。升级依赖后重跑该脚本。
// 软件中使用的开源组件、模型和字体及其许可全文（MIT 等许可要求随软件附上版权声明和许可文本）。
`;
writeFileSync(join(root, 'lib/licenses.ts'), `${header}
export const OPEN_SOURCE = ${JSON.stringify(entries, null, 2)} as const;

export const APACHE_2_0 = ${JSON.stringify(apache)};
`);
console.log(`lib/licenses.ts：${entries.length} 项`);
