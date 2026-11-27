<div align="center">

# 紫微斗数 · 桌面版

排盘、合盘、古籍阅读，加上会查书、会引出处的 AI 解读。
Mac / Windows 桌面应用，也可以在自己电脑上当网页版运行。全部功能免费。

**中文** · [English](./README.en.md)

</div>

## 功能

- **排盘**：本命、大限、流年三层，真太阳时校正，十四主星、辅星、四化、庙旺利陷、宫干自化；可任选大限，大限与流年联动。
- **合盘**：两张盘并排，可选关系（恋人、家人、朋友、合伙），按双方星曜组合查书。
- **AI 解读**：单盘解读、合盘解读、多轮追问，每个盘可以有多段对话。
  - 解读前先按问题查书（向量检索 + 关键词），回答里的判断附书名和页码出处。
  - 财富、姻缘、事业、六亲（父母、兄弟姐妹、子女）按相关宫位的星曜组合专门查书；十二宫宫干飞化作为事实交给 AI 核对。
  - 程序核对：回答里本命宫位的地支、宫干飞化的说法和命盘不一致时，自动让 AI 重写。
  - 使用你自己的 AI 服务（DeepSeek、硅基流动，或任何 OpenAI 兼容接口），Key 只保存在本机。
- **书库**：可以建多个书库，导入自己的 PDF（有文字的直接读取，扫描版用系统自带的文字识别），勾选 AI 检索用哪些书库。
- **古籍库**：《紫微斗数全集》《紫微斗数全书》《骨髓赋》公版原文，可逐章阅读、检索。
- 白天 / 黑夜两种配色；数据（命盘、对话、书库）都保存在本机。

## 与原项目相比

本项目基于 [Renhuai123/ziwei-doushu](https://github.com/Renhuai123/ziwei-doushu)（下称「原项目」）。原项目开源的是排盘引擎、格局知识库和网站前端；它的 README 写明开源版**不含** AI 解读接口（`/api/interpret`、`/api/heming`），AI 功能只在它的线上网站提供。下面对照的是原项目截至 2026-11-25 的公开代码。

| 方面 | 原项目（开源版） | 本项目 |
|---|---|---|
| AI 单盘 / 合盘解读 | 不含，需要自己实现接口 | 完整实现：流式回答、多轮追问、每个盘多段对话，可删除；自带 DeepSeek、硅基流动，也支持任意 OpenAI 兼容接口 |
| 查书与出处 | 无检索 | 本机向量检索（Node 版 BGE 中文模型 + ONNX Runtime，不依赖 Python）+ 关键词检索；回答里的判断附书名和页码，可点开出处 |
| 书库 | 无 | 内置书库（加密，只供检索）+ 自建多个书库；导入 PDF，扫描版用系统文字识别（Mac Vision / 竖排用实况文本，Windows 系统 OCR）；勾选 AI 用哪些书库 |
| 判断方法 | — | 程序只列盘面事实、不打分；财富、姻缘、事业、六亲按相关宫位的星曜组合专门查书，书上有判法才定档；流年按该年各宫叠宫、流曜、四化核对；去掉「赚钱容易守钱难」这类套话 |
| 宫干飞化 | 有自化标记 | 算出十二宫宫干化禄权科忌飞入、冲哪个宫，交给 AI 核对书上的飞化判法 |
| 回答核对 | — | 程序核对回答里的本命宫位地支、宫干飞化说法，和命盘不符时自动重写 |
| 流年 / 大限 | 本命、大限、流年视图 | 增加流年十二宫和流曜叠加；可任选大限，大限与流年联动；流年支持 1800 年以后；AI 按当前所选大限回答 |
| 使用形态 | 网站（浏览器） | Mac / Windows 桌面应用（离线可用，数据只在本机，AI Key 用系统钥匙串 / DPAPI 加密），也能在本机当网页版运行 |
| 界面 | — | 「纸本」排版（宋体、米白纸色、朱红强调、刻本界栏式命盘）、白天 / 黑夜配色、解读区加宽、提问后停在问题处 |
| 测试 | 23 个回归测试 | 31 个回归测试（新增向量检索与 Python 版逐条对齐、导入书、书库、内置书加密、核对清单、宫干飞化与回答核对、对话存储等） |

另外做了这些优化：

- **提示词缓存**：固定提示词和稳定的命盘数据放在前面、本轮检索片段放在后面，同一张盘连续提问时 DeepSeek 缓存命中率可到九成以上，费用和等待都更少。
- **检索质量**：过滤书里 OCR 出来的命盘图页（只有星名、没有判法）；总括性的整理节选不参与检索，避免回答千篇一律；繁简对照表约三千字，Windows 上同样可用。
- **作者名保护**：引用、书库和发给 AI 的片段里不出现作者名，统一替换为「原作者」。
- **稳定性**：本地服务只监听 127.0.0.1、随机端口，端口被占自动换；首页加载被打断不会误关服务；服务退出原因写进日志。

## 下载

到 [Releases](../../releases) 下载：

- **Mac**（Apple 芯片，macOS 12 及以上）：`ziwei-x.y.z-mac-arm64.dmg`
- **Windows**（10 / 11，64 位）：`ziwei-x.y.z-win-x64-setup.exe`

安装包附带一个**内置书库**（27 本参考书，正文加密，只供 AI 检索、不提供阅读）。书不在源代码仓库里，另外作为书库包 `ziwei-library-v1.tar.gz` 放在 Release 上，从源码运行时可以一条命令下载（见下文）。

应用没有做苹果 / 微软的开发者签名，第一次打开时系统会拦一下：

- **Mac**：macOS 15 及以上，先点「完成」，再到「系统设置 › 隐私与安全性」点「仍要打开」；macOS 12–14，在「应用程序」里按住 Control 点按图标，选「打开」。提示「已损坏」时在终端运行 `xattr -dr com.apple.quarantine /Applications/紫微斗数.app`。
- **Windows**：SmartScreen 提示时点「更多信息 › 仍要运行」。

更详细的图文说明见 [安装教程](./docs/install-guide.html)。

## 从源码运行（本机网页版）

需要 Node.js 20 或更高版本。

**一键运行（Mac / Linux）**

```bash
bash scripts/start-web.sh          # 开发模式，打开 http://localhost:3000
bash scripts/start-web.sh --prod   # 正式模式：先构建再启动，速度更快
```

脚本会检查 Node 版本、安装依赖、下载检索模型和内置书库，第一次运行时生成 `.env.local` 并问你要 DeepSeek 的 API Key（可以跳过，只排盘）。

**手动运行（Windows 也一样）**

```bash
npm install
npm run model:download          # 下载检索用的向量模型（约 24 MB）
npm run library:download        # 下载内置书库（约 46 MB，27 本参考书，可选）
cp .env.example .env.local      # 填入 AI 服务的 Key，并保留 ZIWEI_SELF_HOSTED=1（Windows 用 copy）
npm run dev                     # 打开 http://localhost:3000
```

**让 AI 编程助手帮你跑起来**

把下面这段话发给 Claude Code、Codex、Cursor 等能执行命令的 AI 助手（在本仓库目录里打开）：

```text
请在本机把这个项目的网页版跑起来：
1. 确认 Node.js 版本 ≥ 20，没有就告诉我怎么装，不要擅自安装系统软件。
2. 运行 npm install，然后运行 npm run model:download 下载检索模型、npm run library:download 下载内置书库。
3. 如果没有 .env.local，从 .env.example 复制一份；保留 ZIWEI_SELF_HOSTED=1。
   API Key 由我自己填进 .env.local，不要把 Key 写进聊天、命令行参数或任何会被提交的文件。
4. 运行 npm run dev，等出现 Ready 后告诉我访问地址（默认 http://localhost:3000）。
5. 打开首页、起盘页、古籍库页确认能访问；如果报错，读终端输出找原因并修好，修改代码前先告诉我改什么。
```

说明：

- `ZIWEI_SELF_HOSTED=1` 打开书库管理和导入书，导入的书写在项目目录的 `library/` 下，只适合自己电脑上用。**公开部署给别人用的网站不要打开它。**
- 内置书库和安装包里的一样：正文加密，只供 AI 检索，不提供阅读。下载慢的话可以用浏览器从 Release 下载书库包，再运行 `ZIWEI_LIBRARY_URL=书库包路径 npm run library:download`。
- 没有内置书库时，AI 只检索你自己导入的书；都没有时按盘面解读，并说明没有书上的依据。

## 打包桌面版

```bash
npm run desktop:dist        # Mac（Apple 芯片）dmg
npm run desktop:dist:win    # Windows x64 安装包（可以在 Mac 上打）
```

产物在 `dist-desktop/release/`。打包前要先 `npm run model:download`；想带内置书库就再运行 `npm run library:download`，有 `.local-library/books/` 时会把书（加密后）打进安装包，没有就是空书库。

新版 npm 默认拦截安装脚本，如果 `node_modules/electron/dist` 不存在，运行一次 `node node_modules/electron/install.js`。

Mac 版的扫描件文字识别用系统的 Vision（打包时用 `swiftc` 编译小程序），Windows 版用系统自带的 OCR（需要中文识别组件，竖排书效果较差）。

## 开发

```bash
npm run typecheck
npm test
```

主要目录：

| 目录 | 内容 |
|---|---|
| `lib/ziwei/` | 排盘算法、四化、格局、核对清单、宫干飞化 |
| `lib/classics/` | 古籍数据、检索、书库、内置书解密 |
| `lib/vectors/` | Node 版向量检索（WordPiece 分词 + ONNX Runtime） |
| `lib/library-import/` | 导入 PDF：读文字、文字识别、建索引 |
| `app/api/interpret`、`app/api/heming` | 单盘、合盘 AI 解读接口（提示词、检索、核对） |
| `electron/` | 桌面外壳：本地服务、`ziwei://` 协议、AI 设置（系统钥匙串加密） |
| `scripts/desktop/` | 打包、内置书加密、开源许可清单 |
| `scripts/regression/` | 回归测试 |

## 许可与致谢

- 代码按 [MIT](./LICENSE) 许可开源。
- 排盘引擎、格局知识库和最初的界面来自开源项目 [Renhuai123/ziwei-doushu](https://github.com/Renhuai123/ziwei-doushu)（MIT）。
- 星曜安星用 [iztro](https://github.com/SylarLong/iztro)，历法换算用 [lunar-javascript](https://github.com/6tail/lunar-javascript)，向量模型是 [BAAI bge-small-zh-v1.5](https://huggingface.co/Xenova/bge-small-zh-v1.5)（MIT）。全部依赖及许可全文见应用里的「版权与许可」页（`lib/licenses.ts`，由 `scripts/desktop/gen-licenses.mjs` 生成）。
- 内置书库的参考书版权归原作者和出版方所有，不随源代码分发。导入到自己书库的书请只用你有权使用的。
- 命理内容是对传统说法的整理和推演，不构成医疗、投资、法律等任何决策依据。

已知问题：依赖 iztro 用到的 i18next 有一条中等级别的安全提示（拒绝服务类），目前没有修复版本；它只处理软件自带的固定文案，不处理用户输入。

## 支持

觉得好用的话，可以点应用左下角的「支持一下」。问题和建议欢迎提 [Issue](../../issues)。
