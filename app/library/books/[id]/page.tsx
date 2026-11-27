import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { readLocalBook } from '@/lib/classics/local-books';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import styles from '../../library.module.css';
import { bookName, schoolName } from '@/lib/classics/citation';
import BundledBookNotice from '@/components/BundledBookNotice';

export const dynamic = 'force-dynamic';

export default async function LocalBookPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ id }, { page }] = await Promise.all([params, searchParams]);
  const book = await readLocalBook(id);
  if (!book) notFound();
  // 内置书库的书只供 AI 检索，不提供阅读（回答里的出处仍会链到这里，显示书名和页码）。
  if (book.bundled) return <BundledBookNotice title={bookName(book.title)} page={Number(page) || undefined} />;
  const requested = Number(page);
  const current = Number.isInteger(requested) && requested >= 1 && requested <= book.pageCount ? requested : 1;
  const url = `/library/books/${id}/pdf#page=${current}`;
  const chunks = book.chunks.filter(chunk => chunk.page === current);
  const preview = book.sourceKind === 'preview';
  const scan = book.imagePages?.includes(current);
  const text = chunks.length ? chunks.map((chunk, index) => <p key={index}>{chunk.text}</p>) : <p>本页暂未提取出文字。</p>;

  return (
    <>
      <SiteHeader wide />
      <main>
        <header className={styles.readerHead}>
          <div className="wrap">
            <nav className={styles.crumb} aria-label="位置">
              <Link href="/library">古籍库</Link><span>/</span>本地藏书
            </nav>
            <h1 className={styles.chTitle}>《{bookName(book.title)}》</h1>
            {schoolName(book.school) && <p className={styles.chSub}>流派：{schoolName(book.school)}</p>}
            <div className={styles.yuwei} aria-hidden><i /></div>
          </div>
        </header>

        <div className="wrap" style={{ paddingTop: 32, paddingBottom: 56 }}>
          <nav className={styles.toolbar} aria-label="原书页码">
            {current > 1 ? <Link className={styles.tl} href={`?page=${current - 1}`}>上一页</Link> : <span>上一页</span>}
            <form action={`/library/books/${id}`}>
              <label htmlFor="page">第</label>
              <input key={current} id="page" name="page" type="number" min={1} max={book.pageCount} defaultValue={current} className="field" />
              <span>页 / 共 {book.pageCount} 页</span>
              <button type="submit" className={`btn-ghost ${styles.btnSm}`}>跳转</button>
            </form>
            {current < book.pageCount ? <Link className={styles.tl} href={`?page=${current + 1}`}>下一页</Link> : <span>下一页</span>}
            <span className={styles.spacer} />
            {!preview && <a className={styles.tl} href={url} target="_blank" rel="noreferrer">在新窗口打开原 PDF</a>}
          </nav>

          {preview ? (
            <article className={styles.pageText}>
              <p className={styles.pageMeta}>预览提取文字 · 已提取 {book.textPages}/{book.pageCount} 页 · 第 {current} 页</p>
              {scan ? (
                <>
                  <Image src={`/library/books/${id}/image/${current}`} alt={`《${bookName(book.title)}》第 ${current} 页扫描图`} width={1450} height={2048} unoptimized className={styles.scan} />
                  <details className={styles.details}><summary>查看本页识别文字</summary>{text}</details>
                </>
              ) : text}
            </article>
          ) : (
            <>
              <iframe key={current} title={`《${bookName(book.title)}》第 ${current} 页`} src={url} className={styles.frame} />
              <details className={`${styles.details} ${styles.pageText}`}><summary>查看本页提取文字</summary>{text}</details>
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

