import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { RetrievedPassage } from '@/lib/ai-stream';
import s from './SourceLinks.module.css';

const sourceUrl = String.raw`(?:/library/(?:taiwei|books/[a-f0-9]{24})\?page=\d+|/library/(?:gusuifu|quanji|quanshu)/\d+#[a-z0-9-]+)`;
const citation = new RegExp(String.raw`\[([^\]\n]+)\]\([ \t]*(${sourceUrl})[ \t]*\)|` + '`?(' + sourceUrl + ')`?', 'g');

function fallbackLabel(url: string) {
  const page = url.match(/\?page=(\d+)$/)?.[1];
  if (page) return url.startsWith('/library/taiwei') ? `《太微赋》第 ${page} 页` : `阅读第 ${page} 页`;
  const book = url.startsWith('/library/quanshu/') ? '紫微斗数全书'
    : url.startsWith('/library/quanji/') ? '紫微斗数全集' : '骨髓赋';
  return `查看《${book}》节选`;
}

export default function SourceLinks({ text, passages = [] }: { text: string; passages?: RetrievedPassage[] }) {
  const [source, setSource] = useState<{ url: string; label: string } | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (source && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [source]);
  const parts = [];
  let offset = 0;
  for (const match of text.matchAll(citation)) {
    const index = match.index!;
    const url = match[2] ?? match[3];
    parts.push(
      <Fragment key={index}>
        {text.slice(offset, index)}
        <button type="button" className={s.cite}
          onClick={() => { setShowOriginal(false); setSource({ url, label: match[1] || fallbackLabel(url) }); }}>
          {match[1] && !match[1].startsWith('/') && !match[1].startsWith('http') ? match[1] : fallbackLabel(url)}
        </button>
      </Fragment>,
    );
    offset = index + match[0].length;
  }
  const video = source?.url.match(/video\/(BV[a-zA-Z0-9]+)\/\?p=(\d+)&t=(\d+)/);
  const frameUrl = video
    ? `https://player.bilibili.com/player.html?bvid=${video[1]}&p=${video[2]}&t=${video[3]}`
    : source?.url;
  const excerpts = [...new Set(passages.filter(passage => passage.url === source?.url).map(passage => passage.text))];
  return <>{parts}{text.slice(offset)}{source && typeof document !== 'undefined' && createPortal(
    <dialog ref={dialog} onClose={() => setSource(null)} aria-label={source.label}
      className={s.dialog}>
      <div className={s.dialogHead}>
        <span>{source.label}</span>
        <button type="button" onClick={() => dialog.current?.close()} aria-label="关闭出处" className={s.close}>×</button>
      </div>
      <div className={s.dialogBody}>
        <div className={s.dialogCap}>本次检索片段</div>
        {excerpts.length ? excerpts.map((excerpt, index) => (
          <p key={index} className={s.excerpt}>{excerpt}</p>
        )) : <p className={s.excerpt}>没有找到这条引用对应的本次检索片段，可以查看原文。</p>}
        <button type="button" onClick={() => setShowOriginal(value => !value)} className={s.cite}>
          {showOriginal ? '收起原文' : '查看原文'}
        </button>
        {showOriginal && <iframe title={source.label} src={frameUrl} className={s.frame} />}
      </div>
    </dialog>, document.body)}</>;
}

export function RetrievedSources({ references, text, passages = [] }: { references: string[]; text: string; passages?: RetrievedPassage[] }) {
  const cited = references.filter(reference => {
    const url = reference.match(/\]\(([^)]+)\)/)?.[1];
    return url && text.includes(url);
  }).length;
  return (
    <div className={`quote-block ${s.sources}`}>
      <div className={s.sourcesHead}>
        <b>本次检索到的资料</b>
        {references.length > 0 && <span>检索到 {references.length} 条，正文标注了 {cited} 条</span>}
      </div>
      {references.length > 0 ? (
        <ul className={s.sourcesList}>
          {references.map(reference => <li key={reference}><SourceLinks text={reference} passages={passages} /></li>)}
        </ul>
      ) : <p className={s.sourcesEmpty}>本地资料库未检索到参考片段。</p>}
    </div>
  );
}
