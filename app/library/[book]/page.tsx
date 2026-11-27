/**
 * /library/[book] — 单部古籍目录页
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ALL_BOOKS, getBookBySlug } from '@/lib/classics';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import styles from '../library.module.css';
import { toHan } from '../han';

export async function generateStaticParams() {
  return ALL_BOOKS.map(b => ({ book: b.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ book: string }> }) {
  const { book: slug } = await params;
  const book = getBookBySlug(slug);
  if (!book) return {};
  return {
    title: `《${book.title}》· ${book.dynasty} · 紫微斗数古籍原典库`,
    description: book.intro,
  };
}

export default async function BookPage({ params }: { params: Promise<{ book: string }> }) {
  const { book: slug } = await params;
  const book = getBookBySlug(slug);
  if (!book) notFound();
  const total = book.chapters.reduce((s, c) => s + c.paragraphs.length, 0);

  return (
    <>
      <SiteHeader />
      <main>
        <section className={styles.sec}>
          <div className={`wrap ${styles.bookHead}`}>
            <div className={styles.tiqian}><div>{book.title}</div></div>
            <div>
              <nav className={styles.crumb} aria-label="位置">
                <Link href="/library">古籍库</Link><span>/</span>《{book.title}》
              </nav>
              <h1 className={styles.h1} style={{ marginTop: 14 }}>《{book.title}》</h1>
              <p className={styles.eyebrow} style={{ marginTop: 8, marginBottom: 0 }}>
                {book.dynasty} · {book.author} · {book.chapters.length} 章 {total} 段
              </p>
              <p className={styles.lede}>{book.intro}</p>

              <h2 className={styles.secTitle} style={{ marginTop: 44, fontSize: 22 }}>目录</h2>
              <ol className={styles.toc}>
                {book.chapters.map((chapter, i) => (
                  <li key={i}>
                    <Link href={`/library/${book.slug}/${i}`} className={styles.tocRow}>
                      <span className={styles.tocNo}>{toHan(i + 1)}</span>
                      <span>
                        <span className={styles.tocTitle}><b>{chapter.title}</b></span>
                        {chapter.subtitle && <span className={styles.tocSub}>{chapter.subtitle}</span>}
                      </span>
                      <span className={styles.tocCount}>{chapter.paragraphs.length} 段</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
