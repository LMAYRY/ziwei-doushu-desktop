/**
 * /library/search?q=xxx — 搜索结果页
 */

import Link from 'next/link';
import { searchClassics, getParagraphById } from '@/lib/classics';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import LibrarySearch from '../LibrarySearch';
import styles from '../library.module.css';

export const metadata = {
  title: '搜索 · 古籍原典库',
};

const SAMPLES = ['七杀朝斗', '双禄朝垣', '化忌', '紫微', '命宫', '机月同梁'];

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const q = sp.q?.trim() || '';
  const hits = q ? searchClassics(q, 50) : [];

  return (
    <>
      <SiteHeader />
      <main>
        <section className={styles.head}>
          <div className={`wrap ${styles.headGrid}`}>
            <div>
              <nav className={styles.crumb} aria-label="位置">
                <Link href="/library">古籍库</Link><span>/</span>检索
              </nav>
              <h1 className={styles.h1} style={{ marginTop: 14 }}>{q ? `「${q}」` : '检索原文'}</h1>
              {q && (
                <p className={styles.count} style={{ marginTop: 12, marginBottom: 0 }}>
                  在已收录古籍中找到 <b>{hits.length}</b> 段原文{hits.length >= 50 ? '（只列前 50 段）' : ''}
                </p>
              )}
            </div>
            <div className={styles.searchBox}>
              <div className={styles.searchIn}>
                <h2>换个词<small>按字面匹配</small></h2>
                <LibrarySearch key={q} defaultValue={q} />
              </div>
            </div>
          </div>
        </section>

        <section className={styles.sec}>
          <div className="wrap">
            {hits.length === 0 ? (
              <div className={styles.empty}>
                <p>{q ? '已收录古籍中没有这几个字。古籍用字与今天不同，可以换个说法。' : '输入要检索的字句。'}</p>
                <p className={styles.searchHint}>
                  试试：
                  {SAMPLES.map(s => (
                    <Link key={s} href={`/library/search?q=${encodeURIComponent(s)}`}>{s}</Link>
                  ))}
                </p>
              </div>
            ) : (
              <ol className={styles.results}>
                {hits.map((hit, i) => {
                  const ctx = getParagraphById(hit.paragraphId);
                  const chapterIdx = ctx?.chapterIdx ?? 0;
                  return (
                    <li key={i}>
                      <Link href={`/library/${hit.bookSlug}/${chapterIdx}#${hit.paragraphId}`} className={styles.hit}>
                        <span className={styles.hitSrc}>
                          <b>《{hit.bookTitle}》</b>
                          {hit.chapterTitle}
                        </span>
                        <span className={styles.hitText} dangerouslySetInnerHTML={{ __html: hit.snippet }} />
                      </Link>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
