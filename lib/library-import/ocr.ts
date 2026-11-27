// Runs the OCR helper on the pages that have no text layer: on macOS the Vision helper
// (scripts/desktop/pdf-ocr.swift), on Windows the built-in OCR via PowerShell (scripts/desktop/pdf-ocr.ps1).
import { spawn } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { ocrBinaryPath, ocrScriptPath, powershellPath } from '../paths';

export class OcrUnavailableError extends Error {}

export async function ocrAvailable() {
  try {
    if (process.platform === 'darwin') await access(ocrBinaryPath(), constants.X_OK);
    else if (process.platform === 'win32') await access(ocrScriptPath(), constants.R_OK);
    else return false;
    return true;
  } catch {
    return false;
  }
}

/** The command that recognises `pages` of `pdfPath` and prints one JSON line per page. */
function ocrCommand(pdfPath: string, pages: number[]): [string, string[]] {
  if (process.platform === 'win32') {
    // 命令和参数都经函数取得：直接写字面量会让 Next 的文件追踪把参数当路径分析，把整个项目目录打进产物。
    return [powershellPath(),
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ocrScriptPath(), pdfPath, pages.join(',')]];
  }
  return [ocrBinaryPath(), [pdfPath, pages.join(',')]];
}

/** Recognised text per page number. `onPage` fires as each page finishes; aborting kills the helper. */
export async function ocrPages(
  pdfPath: string,
  pages: number[],
  { onPage, signal }: { onPage?: (page: number, text: string) => void; signal?: AbortSignal } = {},
) {
  const texts = new Map<number, string>();
  if (!pages.length) return texts;
  if (!(await ocrAvailable())) throw new OcrUnavailableError('找不到文字识别程序（OCR），无法读取扫描页');
  signal?.throwIfAborted();
  const [command, args] = ocrCommand(pdfPath, pages);
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const abort = () => child.kill();
  signal?.addEventListener('abort', abort, { once: true });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); });
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => resolve(code));
  });
  try {
    for await (const line of createInterface({ input: child.stdout })) {
      if (!line.trim()) continue;
      const { page, text } = JSON.parse(line) as { page: number; text: string };
      texts.set(page, text);
      onPage?.(page, text);
    }
    const code = await exited;
    signal?.throwIfAborted();
    if (code === 3) throw new OcrUnavailableError(stderr.trim() || '系统没有安装中文文字识别（OCR）语言组件');
    if (code !== 0) throw new Error(`文字识别失败（${code}）：${stderr.trim() || '无输出'}`);
    return texts;
  } finally {
    signal?.removeEventListener('abort', abort);
    if (child.exitCode === null) child.kill();
  }
}
