// pdf.js ships no typings for its worker module. Importing it in Node and putting it on
// globalThis.pdfjsWorker lets pdf.js run in the same thread (see lib/library-import/pdf-text.ts).
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown;
}
