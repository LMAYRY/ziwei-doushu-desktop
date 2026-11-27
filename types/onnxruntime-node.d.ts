// onnxruntime-node 1.19.2 is published without dist/index.d.ts; it re-exports
// onnxruntime-common at runtime, so reuse those typings. The version is pinned
// to match the Python stack (onnxruntime 1.19.2) because the bundled model is
// dynamically quantised and newer runtimes produce slightly different vectors.
declare module 'onnxruntime-node' {
  export * from 'onnxruntime-common';
}
