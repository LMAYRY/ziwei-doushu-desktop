import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { APACHE_2_0, OPEN_SOURCE } from '@/lib/licenses';
import { ALL_BOOKS } from '@/lib/classics';
import styles from '../privacy/legal.module.css';

export const metadata = { title: '版权与许可 · 紫微斗数', description: '本软件的版权声明、随附书目和开源组件许可' };

const pre = { whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.6 } as const;

export default function LicensesPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <header className={styles.head}>
          <div className="wrap">
            <p className={styles.eyebrow}>紫微斗数 · 条款</p>
            <h1 className={styles.h1}>版权与许可</h1>
          </div>
        </header>
        <article className="wrap">
          <div className={styles.doc}>
            <h2><span>一</span>本软件</h2>
            <p>本软件的排盘、格局知识库和界面基于 MIT 许可的开源项目 ziwei-doushu 修改而来，桌面外壳、本机检索、导入书籍、AI 解读等部分为本软件新增。MIT 许可允许在保留原版权声明的前提下使用、修改和销售，原项目的版权声明和许可全文见下面第三节。</p>
            

            <h2><span>二</span>书籍</h2>
            <p>公有领域古籍：{ALL_BOOKS.map(book => `《${book.title}》`).join('')}，可在古籍库阅读。内置书库的参考书只供 AI 解读时检索，不提供阅读。</p>
            <p>你导入到自己书库里的书只保存在你自己的电脑上，请只导入你有权使用的书。</p>

            <h2><span>三</span>开源组件、模型与字体</h2>
            <p>本软件使用了以下开源组件，按各自许可附上版权声明与许可全文。</p>
            {OPEN_SOURCE.map(item => (
              <section key={item.name}>
                <p><strong>{item.name}</strong>（{item.license}）：{item.use}。项目地址：{item.url}</p>
                <pre style={pre}>{item.text}</pre>
              </section>
            ))}

            <h2><span>四</span>Apache License 2.0 全文</h2>
            <pre style={pre}>{APACHE_2_0}</pre>
          </div>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
