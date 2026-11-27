#!/usr/bin/env bash
# 一键在本机运行网页版：检查 Node、安装依赖、下载检索模型、生成 .env.local（问你要 AI Key）、启动。
# 用法：bash scripts/start-web.sh          开发模式（改代码自动刷新）
#       bash scripts/start-web.sh --prod   正式模式（先构建，再启动，速度更快）
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n▸ %s\n' "$1"; }

say "检查 Node.js"
if ! command -v node >/dev/null 2>&1; then
  echo "没有找到 Node.js，请先安装 20 或更高版本：https://nodejs.org/" >&2
  exit 1
fi
major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$major" -lt 20 ]; then
  echo "Node.js 版本是 $(node -v)，需要 20 或更高版本。" >&2
  exit 1
fi
echo "Node.js $(node -v)"

say "安装依赖（第一次较慢）"
npm install --no-audit --no-fund

say "下载检索模型（约 24 MB，已下载过会跳过）"
npm run model:download

say "下载内置书库（约 46 MB，27 本参考书，只供 AI 检索；已下载过会跳过）"
npm run library:download || echo "内置书库下载失败，先不用它：AI 只检索你自己导入的书。以后可以再运行 npm run library:download。"

if [ ! -f .env.local ]; then
  say "生成 .env.local"
  cp .env.example .env.local
  echo "AI 解读要用你自己的 AI 服务 Key（默认 DeepSeek：https://platform.deepseek.com/api_keys）。"
  printf "粘贴 DeepSeek API Key（直接回车跳过，只排盘不用 AI）："
  read -r -s key || key=""
  echo
  if [ -n "$key" ]; then
    # 只替换示例占位值；Key 只写进本机的 .env.local（已被 git 忽略）。
    KEY="$key" node -e '
      const fs = require("fs");
      const text = fs.readFileSync(".env.local", "utf8").replace(/^DEEPSEEK_API_KEY=.*$/m, "DEEPSEEK_API_KEY=" + process.env.KEY);
      fs.writeFileSync(".env.local", text);'
    echo "已写入 .env.local。以后要改 Key 或换服务商，直接编辑这个文件。"
  else
    echo "已跳过。以后要用 AI 解读，编辑 .env.local 填上 Key 再重新启动。"
  fi
fi

if [ "${1:-}" = "--prod" ]; then
  say "构建"
  npm run build
  # next.config.js 是 output: 'standalone'（桌面版也用它），正式模式直接运行独立服务：
  # 补上静态文件，读取 .env.local，资料和用户数据都指向项目目录。
  cp -R .next/static .next/standalone/.next/
  [ -d public ] && cp -R public .next/standalone/
  set -a; [ -f .env.local ] && . ./.env.local; set +a
  say "启动：打开 http://localhost:${PORT:-3000} （按 Ctrl+C 停止）"
  ZIWEI_RESOURCES_DIR="$PWD" ZIWEI_DATA_DIR="$PWD" PORT="${PORT:-3000}" HOSTNAME=127.0.0.1 node .next/standalone/server.js
else
  say "启动：打开 http://localhost:3000 （按 Ctrl+C 停止）"
  npm run dev
fi
