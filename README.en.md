# Ziwei Doushu · Desktop

[中文](./README.md) · **English**

A Ziwei Doushu (紫微斗数) charting app for Mac and Windows that can also run locally as a web app. Everything is free.

- **Charts**: natal, decade (大限) and yearly (流年) layers, true solar time, the fourteen major stars, auxiliary stars, the four transformations (四化), brightness and palace-stem self-transformations.
- **Compatibility (合盘)**: two charts side by side, by relationship type.
- **AI readings** with citations: before answering, the app searches the books (vector + keyword) and the answer cites book and page. Wealth, marriage, career and family questions search by the stars in the relevant palaces; palace-stem flying transformations (宫干飞化) are given to the model as facts. Palace branches and flying-transformation claims in the answer are checked against the chart and rewritten when wrong. Bring your own AI key (DeepSeek, SiliconFlow or any OpenAI-compatible API); the key stays on your machine.
- **Libraries**: create several libraries, import your own PDFs (text or scanned, using the OS's OCR), and choose which libraries the AI searches.
- **Classics**: public-domain texts, readable chapter by chapter.

## Download

See [Releases](../../releases): `ziwei-x.y.z-mac-arm64.dmg` (Apple silicon, macOS 12+) and `ziwei-x.y.z-win-x64-setup.exe` (Windows 10/11 x64). The installers include an encrypted built-in reference library (27 books) used only for AI search; the books are not in the repository but are published as a separate Release asset (`ziwei-library-v1.tar.gz`). The apps are not code-signed; see the install notes in the Chinese README.

## Run from source

Node.js 20+.

```bash
npm install
npm run model:download          # embedding model (~24 MB)
npm run library:download        # optional built-in library (~46 MB, encrypted, search only)
cp .env.example .env.local      # add your AI key; keep ZIWEI_SELF_HOSTED=1 for personal use
npm run dev                     # http://localhost:3000
```

Build the desktop apps with `npm run desktop:dist` (Mac dmg) or `npm run desktop:dist:win` (Windows installer). Run checks with `npm run typecheck` and `npm test`.

## License

MIT. The charting engine, pattern knowledge base and original UI come from [Renhuai123/ziwei-doushu](https://github.com/Renhuai123/ziwei-doushu) (MIT). Third-party licenses are listed in the app's 版权与许可 page (`lib/licenses.ts`). Readings are traditional interpretations, not advice of any kind.
