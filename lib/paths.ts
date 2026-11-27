import { join } from 'node:path';

// Where the server reads and writes its data.
// - ZIWEI_RESOURCES_DIR: read-only bundled resources (model, books, 太微赋).
//   The desktop app points it at the app's `resources` directory.
// - ZIWEI_DATA_DIR: writable user data (imported books, history, settings).
//   The desktop app points it at Electron's `app.getPath('userData')`.
// Both fall back to the project directory, so `next dev` keeps working unchanged.

function resourcesDir() {
  // turbopackIgnore: these are runtime paths, not files to trace into the server bundle.
  return /* turbopackIgnore: true */ process.env.ZIWEI_RESOURCES_DIR || /* turbopackIgnore: true */ process.cwd();
}

/** Writable user data directory. */
export function dataDir() {
  return /* turbopackIgnore: true */ process.env.ZIWEI_DATA_DIR || /* turbopackIgnore: true */ process.cwd();
}

/** Bundled library: `taiwei.json`, `taiwei-vectors.*`, `taiwei-model/`, `books/`. */
export function libraryDir() {
  return join(/* turbopackIgnore: true */ resourcesDir(), '.local-library');
}

/** Bundled books, one `<24 hex id>/` directory each. */
export function booksDir() {
  return join(libraryDir(), 'books');
}

/** Books the user imported themselves (`app/library` › 导入我的书), same layout as `booksDir()`. */
export function userBooksDir() {
  return join(/* turbopackIgnore: true */ dataDir(), 'library', 'books');
}

/** Vision OCR helper for scanned PDF pages (compiled from `scripts/desktop/pdf-ocr.swift`, macOS only). */
export function ocrBinaryPath() {
  return process.env.ZIWEI_OCR_BIN || join(/* turbopackIgnore: true */ resourcesDir(), 'bin', 'ziwei-ocr');
}

/** The built-in Windows PowerShell 5.1 (always on PATH on Windows 10/11). */
export function powershellPath() {
  return process.env.ZIWEI_POWERSHELL || 'powershell.exe';
}

/** Windows OCR script (copied from `scripts/desktop/pdf-ocr.ps1`), run with the built-in Windows PowerShell. */
export function ocrScriptPath() {
  return process.env.ZIWEI_OCR_SCRIPT || join(/* turbopackIgnore: true */ resourcesDir(), 'bin', 'pdf-ocr.ps1');
}

