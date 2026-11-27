import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import styles from '@/app/library/library.module.css';

/** 内置书库的书：只说明出处，不展示正文。 */
export default function BundledBookNotice({ title, page }: { title: string; page?: number }) {
  return (
    <>
      <SiteHeader wide />
      <main>
        <header className={styles.readerHead}>
          <div className="wrap">
            <nav className={styles.crumb} aria-label="位置">
              <Link href="/library">古籍库</Link><span>/</span>内置书库
            </nav>
            <h1 className={styles.chTitle}>《{title}》{page ? ` · 第 ${page} 页` : ''}</h1>
            <div className={styles.yuwei} aria-hidden><i /></div>
          </div>
        </header>
        <div className="wrap" style={{ paddingTop: 32, paddingBottom: 56 }}>
          <p className={styles.secSub}>这本书属于内置书库，只供 AI 解读时检索参考，不提供阅读。回答下方「检索到的资料」里可以看到引用的片段。</p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
