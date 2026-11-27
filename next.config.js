/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['lunar-javascript'],
  // pdf.js (「导入我的书」) loads its worker module and CMap files at runtime; keep it a plain package.
  serverExternalPackages: ['pdfjs-dist'],
  // The desktop app runs `.next/standalone/server.js` (see electron/main.js).
  output: 'standalone',
  // onnxruntime_binding.node loads libonnxruntime.*.dylib/.so/.dll at runtime, which tracing misses.
  // scripts/desktop/build.mjs then drops the binaries for other platforms.
  outputFileTracingIncludes: {
    '/*': [
      './node_modules/onnxruntime-node/bin/napi-v3/**/*',
      // Chinese PDFs often need pdf.js's CID CMaps to decode their text (lib/library-import/pdf-text.ts).
      './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
      './node_modules/pdfjs-dist/cmaps/**/*',
    ],
  },
  // Bundled data is shipped separately as read-only resources (scripts/desktop/build.mjs),
  // so keep it, and local secrets, out of the traced server files.
  outputFileTracingExcludes: {
    // @napi-rs/canvas is only needed by pdf.js to render pages; text extraction works without it.
    '/*': ['./node_modules/@napi-rs/**/*', './.local-library/**/*', './docs/**/*', './.env*', './scripts/**/*', './electron/**/*', './dist-desktop/**/*'],
  },
};

module.exports = nextConfig;
