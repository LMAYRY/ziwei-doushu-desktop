'use client';
// 「我的书库」: choose which libraries AI retrieval uses, manage user libraries, import a PDF into one,
// follow its progress, cancel, move or remove imported books.
// The server side is app/api/library/import (lib/library-import/job.ts).
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './library.module.css';

type Job = {
  id: string;
  title: string;
  status: 'running' | 'done' | 'failed' | 'cancelled';
  stage: 'read' | 'ocr' | 'vectors' | 'save';
  done: number;
  total: number;
  message?: string;
  book?: { id: string; title: string; pageCount: number; chunks: number; ocrPages: number };
};
export type ImportedBook = { id: string; title: string; pageCount: number; ocrPages: number; chunks: number; library: string };
export type LibraryInfo = { id: string; name: string };
const BUILTIN = 'builtin';

const HEADERS = { 'x-ziwei-library': '1' };
const STAGES: Record<Job['stage'], [string, string]> = {
  read: ['读取文字', '页'],
  ocr: ['识别扫描页', '页'],
  vectors: ['建立检索索引', '段'],
  save: ['保存', ''],
};

/** The current (or last) import; undefined when the server could not be reached. */
async function fetchJob(): Promise<Job | null | undefined> {
  const response = await fetch('/api/library/import', { headers: HEADERS, cache: 'no-store' }).catch(() => null);
  if (!response?.ok) return undefined;
  return ((await response.json()) as { job: Job | null }).job;
}

async function errorOf(response: Response) {
  const body = await response.json().catch(() => null);
  return body?.error || `请求失败（${response.status}）`;
}

export default function ImportBooks({ books, libraries, selected, builtinCount }: {
  books: ImportedBook[]; libraries: LibraryInfo[]; selected: string[]; builtinCount: number;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [uploading, setUploading] = useState('');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  // Windows 自带 OCR 只认横排：竖排扫描书识别效果很差，提前告诉用户。
  const [windows, setWindows] = useState(false);
  useEffect(() => { setWindows(/Windows/i.test(navigator.userAgent)); }, []);
  const seen = useRef<string | null>(null);
  const [target, setTarget] = useState(libraries[0]?.id ?? '');
  useEffect(() => {
    if (!libraries.some(item => item.id === target)) setTarget(libraries[0]?.id ?? '');
  }, [libraries, target]);

  /** 书库管理接口（app/api/library/libraries）。成功后刷新页面数据。 */
  async function manage(body: Record<string, unknown>, done?: string) {
    const response = await fetch('/api/library/libraries', {
      method: 'POST', headers: { ...HEADERS, 'content-type': 'application/json' }, body: JSON.stringify(body),
    }).catch(() => null);
    if (response?.ok) {
      if (done) setNotice({ ok: true, text: done });
      router.refresh();
    } else {
      setNotice({ ok: false, text: response ? await errorOf(response) : '无法连接本地服务，请重试' });
    }
  }

  function toggle(id: string, on: boolean) {
    const next = on ? [...new Set([...selected, id])] : selected.filter(item => item !== id);
    manage({ action: 'select', selected: next });
  }

  function create() {
    const name = window.prompt('新书库的名称', '');
    if (name?.trim()) manage({ action: 'create', name }, `已新建书库「${name.trim()}」，并已勾选用于 AI 检索`);
  }

  function renameLibrary(library: LibraryInfo) {
    const name = window.prompt('书库的新名称', library.name);
    if (name?.trim() && name.trim() !== library.name) manage({ action: 'rename', id: library.id, name });
  }

  function removeLibrary(library: LibraryInfo) {
    if (window.confirm(`删除书库「${library.name}」？`)) manage({ action: 'delete', id: library.id }, `已删除书库「${library.name}」`);
  }

  const finish = useCallback((finished: Job) => {
    if (seen.current === finished.id) return;
    seen.current = finished.id;
    if (finished.status === 'done' && finished.book) {
      const { title, pageCount, chunks, ocrPages } = finished.book;
      setNotice({ ok: true, text: `已导入《${title}》：${pageCount} 页，${chunks} 段${ocrPages ? `（其中 ${ocrPages} 页为扫描页，已用文字识别）` : ''}。AI 解读时会一起检索。` });
      router.refresh();
    } else {
      setNotice({ ok: false, text: finished.message || '导入没有完成' });
    }
  }, [router]);

  const poll = useCallback(async () => {
    const current = await fetchJob();
    if (current === undefined) return;
    setJob(current);
    if (current && current.status !== 'running') finish(current);
  }, [finish]);

  // Pick up an import that is still running (e.g. after leaving and reopening the page);
  // a result from before the page opened is not announced again.
  useEffect(() => {
    fetchJob().then(current => {
      if (current === undefined) return;
      if (current && current.status !== 'running') seen.current = current.id;
      setJob(current);
    });
  }, []);

  useEffect(() => {
    if (job?.status !== 'running') return;
    const timer = setInterval(poll, 400);
    return () => clearInterval(timer);
  }, [job?.status, poll]);

  async function upload(file: File) {
    setNotice(null);
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      setNotice({ ok: false, text: '只能导入 PDF 文件' });
      return;
    }
    setUploading(file.name);
    try {
      const response = await fetch('/api/library/import', {
        method: 'POST',
        headers: { ...HEADERS, 'content-type': 'application/pdf', 'x-ziwei-file-name': encodeURIComponent(file.name), 'x-ziwei-target-library': target },
        body: file,
      });
      if (!response.ok) {
        setNotice({ ok: false, text: await errorOf(response) });
        return;
      }
      setJob((await response.json()).job);
    } catch {
      setNotice({ ok: false, text: '无法连接本地服务，请重试' });
    } finally {
      setUploading('');
    }
  }

  async function cancel() {
    await fetch('/api/library/import', { method: 'DELETE', headers: HEADERS }).catch(() => null);
    poll();
  }

  async function remove(book: ImportedBook) {
    if (!window.confirm(`从书架上删除《${book.title}》？\n只删除导入到本应用里的副本，不会动你电脑上的原文件。`)) return;
    const response = await fetch(`/api/library/books/${book.id}`, { method: 'DELETE', headers: HEADERS }).catch(() => null);
    if (response?.ok) {
      setNotice({ ok: true, text: `已删除《${book.title}》` });
      router.refresh();
    } else {
      setNotice({ ok: false, text: response ? await errorOf(response) : '无法连接本地服务，请重试' });
    }
  }

  const running = job?.status === 'running';
  const [label, unit] = job ? STAGES[job.stage] : ['', ''];
  const percent = job && job.total ? Math.min(100, Math.round((job.done / job.total) * 100)) : 0;

  return (
    <div className={styles.importBox}>
      <div className={styles.importHead}>
        <div>
          <h3 className={styles.secTitle}>书库</h3>
          <p className={styles.secSub}>
            AI 解读时只查下面勾选的书库，都不勾就只按盘面解读。内置书库是随软件附带的参考书，只供检索、不提供阅读；
            自己的书库可以建多个，导入自己的 PDF：有文字的 PDF 直接读取，扫描版用本机文字识别，每页约 2 秒。书只保存在这台电脑上，可以阅读、移动或删除。
          </p>
          {windows && (
            <p className={styles.secSub}>
              提示：Windows 的文字识别只认横排文字，竖排的扫描书（多见于繁体古籍和台版书）识别效果很差，导入后可能检索不到内容。扫描版需要系统装有中文文字识别组件。
            </p>
          )}
        </div>
        <div className={styles.importActions}>
          <label>
            导入到
            <select value={target} onChange={event => setTarget(event.target.value)} disabled={running || !!uploading}>
              {libraries.map(library => <option key={library.id} value={library.id}>{library.name}</option>)}
            </select>
          </label>
          <button type="button" className="btn-accent" disabled={running || !!uploading || !target} onClick={() => input.current?.click()}>
            导入 PDF
          </button>
        </div>
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) upload(file);
          }}
        />
      </div>

      {(uploading || running) && (
        <div className={styles.importProgress} role="status" aria-live="polite">
          <div className={styles.importLine}>
            <b>{uploading ? uploading.replace(/\.pdf$/i, '') : job?.title}</b>
            <span>
              {uploading ? '正在读取文件…' : `${label}${job && job.total && unit ? ` ${job.done}/${job.total} ${unit}` : '…'}`}
            </span>
            {running && <button type="button" className={`btn-ghost ${styles.btnSm}`} onClick={cancel}>取消</button>}
          </div>
          <div className={styles.importBar}><i style={{ width: `${uploading ? 0 : percent}%` }} /></div>
        </div>
      )}

      {notice && <p className={notice.ok ? styles.importOk : styles.importError} role="status">{notice.text}</p>}

      <fieldset className={styles.libraryPick}>
        <legend>AI 检索使用的书库</legend>
        <label>
          <input type="checkbox" checked={selected.includes(BUILTIN)} onChange={event => toggle(BUILTIN, event.target.checked)} />
          内置书库<small>{builtinCount} 本参考书 · 只供检索</small>
        </label>
        {libraries.map(library => (
          <label key={library.id}>
            <input type="checkbox" checked={selected.includes(library.id)} onChange={event => toggle(library.id, event.target.checked)} />
            {library.name}<small>{books.filter(book => book.library === library.id).length} 本</small>
          </label>
        ))}
        <button type="button" className={`btn-ghost ${styles.btnSm}`} onClick={create}>新建书库</button>
      </fieldset>

      {libraries.map(library => {
        const own = books.filter(book => book.library === library.id);
        return (
          <section key={library.id} className={styles.libraryGroup}>
            <div className={styles.libraryHead}>
              <h4>{library.name}<small>{own.length} 本{selected.includes(library.id) ? '' : ' · 未参与检索'}</small></h4>
              <button type="button" className={`btn-ghost ${styles.btnSm}`} onClick={() => renameLibrary(library)}>改名</button>
              {libraries.length > 1 && !own.length && (
                <button type="button" className={`btn-ghost ${styles.btnSm}`} onClick={() => removeLibrary(library)}>删除书库</button>
              )}
            </div>
            {own.length ? (
              <ul className={styles.books}>
                {own.map(book => (
                  <li key={book.id} className={styles.importedRow}>
                    <Link href={`/library/books/${book.id}`} className={styles.bookRow}>
                      <span className={styles.bookLine}>
                        <span className={styles.bookName}>《{book.title}》</span>
                        <span className={styles.dots} aria-hidden />
                        <span className={styles.bookEd}>{book.pageCount} 页</span>
                      </span>
                      <span className={styles.bookMeta}>
                        <span>{book.chunks} 段</span>
                        {book.ocrPages > 0 && <span>{book.ocrPages} 页文字识别</span>}
                        <span className={styles.go}>读原 PDF</span>
                      </span>
                    </Link>
                    {libraries.length > 1 && (
                      <select aria-label={`把《${book.title}》移到`} value="" className={styles.moveSelect}
                        onChange={event => event.target.value && manage({ action: 'move', bookId: book.id, library: event.target.value }, `已把《${book.title}》移到「${libraries.find(item => item.id === event.target.value)?.name}」`)}>
                        <option value="">移到…</option>
                        {libraries.filter(item => item.id !== library.id).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    )}
                    <button type="button" className={`btn-ghost ${styles.btnSm}`} onClick={() => remove(book)} aria-label={`删除《${book.title}》`}>
                      删除
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className={styles.secSub}>还没有书，选这个书库后点「导入 PDF」。</p>}
          </section>
        );
      })}
    </div>
  );
}
