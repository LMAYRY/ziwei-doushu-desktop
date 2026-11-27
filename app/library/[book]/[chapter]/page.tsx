/**
 * /library/[book]/[chapter] — 单章节阅读页
 *
 * 版式参照识典古籍：原文居中、舒适行宽；白话 / 注释贴在原文右侧；本书目录贴左。
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ALL_BOOKS, getChapter } from '@/lib/classics';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import styles from '../../library.module.css';
import { toHan } from '../../han';

export async function generateStaticParams() {
  return ALL_BOOKS.flatMap(b =>
    b.chapters.map((_, i) => ({ book: b.slug, chapter: String(i) }))
  );
}

export async function generateMetadata({ params }: { params: Promise<{ book: string; chapter: string }> }) {
  const { book: bookSlug, chapter: chIdx } = await params;
  const result = getChapter(bookSlug, parseInt(chIdx));
  if (!result) return {};
  return {
    title: `${result.chapter.title} · 《${result.book.title}》· 紫微斗数古籍`,
    description: result.chapter.subtitle || `《${result.book.title}》${result.chapter.title}原文`,
  };
}

export default async function ChapterPage({ params }: { params: Promise<{ book: string; chapter: string }> }) {
  const { book: bookSlug, chapter: chIdx } = await params;
  const result = getChapter(bookSlug, parseInt(chIdx));
  if (!result) notFound();

  const { book, chapter, chapterIdx } = result;
  const prevIdx = chapterIdx - 1;
  const nextIdx = chapterIdx + 1;

  return (
    <>
      <SiteHeader wide />
      <main>
        <header className={styles.readerHead}>
          <div className="wrap">
            <nav className={styles.crumb} aria-label="位置">
              <Link href="/library">古籍库</Link><span>/</span>
              <Link href={`/library/${book.slug}`}>《{book.title}》</Link><span>/</span>
              第{toHan(chapterIdx + 1)}章
            </nav>
            <h1 className={styles.chTitle}>{chapter.title}</h1>
            {chapter.subtitle && <p className={styles.chSub}>{chapter.subtitle}</p>}
            <div className={styles.yuwei} aria-hidden><i /></div>
          </div>
        </header>

        <div className={`wrap-wide ${styles.reader}`}>
          <aside className={styles.side} aria-label="本书目录">
            <div className={styles.sideTitle}>《{book.title}》目录</div>
            <ol className={styles.sideList}>
              {book.chapters.map((c, i) => (
                <li key={i}>
                  <Link href={`/library/${book.slug}/${i}`} className={i === chapterIdx ? styles.on : undefined}
                    aria-current={i === chapterIdx ? 'page' : undefined}>
                    {c.title}
                  </Link>
                </li>
              ))}
            </ol>
          </aside>

          <article className={styles.text}>
            {chapter.paragraphs.map(p => (
              <div key={p.id} id={p.id} className={styles.para}>
                <span className={styles.paraNo}>{toHan(p.idx)}</span>
                <p className={styles.paraText}>{p.text}</p>
                {(p.translation || p.niNote) && (
                  <div className={styles.notes}>
                    {p.translation && (
                      <div className={styles.note}><b>白话</b>{p.translation}</div>
                    )}
                    {p.niNote && (
                      <div className={`${styles.note} ${styles.noteZhu}`}><b>注</b>{p.niNote}</div>
                    )}
                  </div>
                )}
              </div>
            ))}

            <nav className={styles.pager} aria-label="章节翻页">
              {prevIdx >= 0 ? (
                <Link href={`/library/${book.slug}/${prevIdx}`}>
                  <small>上一章</small><b>{book.chapters[prevIdx].title}</b>
                </Link>
              ) : (
                <Link href={`/library/${book.slug}`}><small>回到</small><b>本书目录</b></Link>
              )}
              {nextIdx < book.chapters.length ? (
                <Link href={`/library/${book.slug}/${nextIdx}`}>
                  <small>下一章</small><b>{book.chapters[nextIdx].title}</b>
                </Link>
              ) : (
                <Link href="/library"><small>本书已完</small><b>回古籍库</b></Link>
              )}
            </nav>
          </article>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
