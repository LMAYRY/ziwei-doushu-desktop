/**
 * 古籍原典查询库 · 主页
 *
 * 列出所有收录古籍 + 全局搜索入口
 */

import Link from 'next/link';
import { ALL_BOOKS, TOTAL_PARAGRAPHS } from '@/lib/classics';
import LibrarySearch from './LibrarySearch';
import ImportBooks from './ImportBooks';
import { readLocalBooks } from '@/lib/classics/local-books';
import { libraryOf, readLibraries } from '@/lib/classics/libraries';
import { importAvailable } from '@/lib/library-import/guard';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import styles from './library.module.css';
import { bookName } from '@/lib/classics/citation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '古籍原典库 · 紫微斗数全集 / 全书 / 骨髓赋',
  description: '紫微斗数权威古籍全文检索：《紫微斗数全集》《紫微斗数全书》《骨髓赋》传统古籍节选',
};

const SAMPLES = ['七杀朝斗', '双禄朝垣', '机月同梁', '化忌'];

export default async function LibraryHomePage() {
  const [allBooks, libraries] = await Promise.all([readLocalBooks(), readLibraries()]);
  // 内置书库的书只供 AI 检索，不列书名、不提供阅读。
  const builtinCount = allBooks.filter(book => book.bundled && !/天[纪紀]/.test(book.title)).length;
  const importedBooks = allBooks.filter(book => book.imported).map(book => ({
    library: libraryOf(libraries, book.id),
    id: book.id,
    title: bookName(book.title),
    pageCount: book.pageCount,
    chunks: book.chunks.length,
    ocrPages: book.imagePages?.length ?? 0,
  }));
  return (
    <>
      <SiteHeader />
      <main>
        <section className={styles.head}>
          <div className={`wrap ${styles.headGrid}`}>
            <div>
              <p className={styles.eyebrow}>公版古籍 · <b>原文可检索、可逐章阅读</b></p>
              <h1 className={styles.h1}>古籍原典库</h1>
              <p className={styles.lede}>
                解读中引用的每一句古籍，都能在这里找到原文。现收录 <strong>{ALL_BOOKS.length}</strong> 部明代公版古籍，共 <strong>{TOTAL_PARAGRAPHS}</strong> 段，另有本地藏书若干。
              </p>
            </div>
            <div className={styles.searchBox}>
              <div className={styles.searchIn}>
                <h2>检索原文<small>按字面匹配</small></h2>
                <LibrarySearch />
                <p className={styles.searchHint}>
                  试试：
                  {SAMPLES.map(s => (
                    <Link key={s} href={`/library/search?q=${encodeURIComponent(s)}`}>{s}</Link>
                  ))}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.sec}>
          <div className={`wrap ${styles.secGrid}`}>
            <h2 className={styles.juan}>原典<small>卷一</small></h2>
            <div>
              <h3 className={styles.secTitle}>明代公版古籍</h3>
              <p className={styles.secSub}>已逐段整理，可按章阅读；部分段落附白话与注释。</p>
              <ul className={styles.books}>
                {ALL_BOOKS.map(book => (
                  <li key={book.slug}>
                    <Link href={`/library/${book.slug}`} className={styles.bookRow}>
                      <span className={styles.bookLine}>
                        <span className={styles.bookName}>《{book.title}》</span>
                        <span className={styles.dots} aria-hidden />
                        <span className={styles.bookEd}>{book.dynasty} · {book.author.split(' ')[0]}</span>
                      </span>
                      <p className={styles.bookIntro}>{book.intro}</p>
                      <span className={styles.bookMeta}>
                        <span>{book.chapters.length} 章</span>
                        <span>{book.chapters.reduce((s, c) => s + c.paragraphs.length, 0)} 段</span>
                        <span className={styles.go}>读目录</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className={styles.sec}>
          <div className={`wrap ${styles.secGrid}`}>
            <h2 className={styles.juan}>藏书<small>卷二</small></h2>
            <div>
              {importAvailable() ? (
                <ImportBooks books={importedBooks} libraries={libraries.libraries} selected={libraries.selected} builtinCount={builtinCount} />
              ) : builtinCount > 0 && (
                <>
                  <h3 className={styles.secTitle}>内置书库</h3>
                  <p className={styles.secSub}>{builtinCount} 本参考书，只供 AI 解读时检索，不提供阅读。</p>
                </>
              )}
            </div>
          </div>
        </section>

        <section className={styles.sec}>
          <div className={`wrap ${styles.secGrid}`}>
            <h2 className={styles.juan}>凡例<small>卷末</small></h2>
            <div>
              <h3 className={styles.secTitle}>关于本库</h3>
              <ol className={styles.fanli}>
                <li><span className={styles.gan}>一</span><span className={styles.v}>所收古籍均为公版明代刊本，原文照录，不作删改。</span></li>
                <li><span className={styles.gan}>二</span><span className={styles.v}>白话与注释附于原文旁，与原文分开排印，便于对照。</span></li>
                <li><span className={styles.gan}>三</span><span className={styles.v}>内容持续补充；发现错字或断句有误，欢迎告知。</span></li>
              </ol>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
