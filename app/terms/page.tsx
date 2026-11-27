import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import styles from '../privacy/legal.module.css';

export const metadata = { title: '使用条款 · 紫微斗数', description: '紫微斗数桌面版使用条款' };

export default function TermsPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <header className={styles.head}>
          <div className="wrap">
            <p className={styles.eyebrow}>紫微斗数 · 条款</p>
            <h1 className={styles.h1}>使用条款</h1>
            <p className={styles.updated}>最后更新：二〇二六年十一月</p>
          </div>
        </header>
        <article className="wrap">
          <div className={styles.doc}>
          <h2><span>一</span>软件内容</h2>
          <p>本软件依传统紫微斗数体系在本机排盘，并结合随附书籍提供 AI 解读。命理内容是对传统说法的整理和推演，<strong>不构成医疗、投资、法律、心理咨询或其他重大决策的依据</strong>。</p>

          <h2><span>二</span>免费使用</h2>
          <p>本软件的全部功能免费使用，包括排盘、合盘、大限流年、古籍阅读、书库和 AI 解读。本软件的代码按 MIT 许可开源。</p>

          <h2><span>三</span>AI 服务与费用</h2>
          <p>AI 解读使用你自己在设置里填写的 AI 服务商和 API Key，调用费用由你向该服务商支付。AI 服务商的可用性、计费和内容处理以其自身条款为准。AI 生成的内容可能有误，请自行判断。</p>

          <h2><span>四</span>书籍与版权</h2>
          <p>内置书库的参考书只供本机 AI 检索，不提供阅读，请勿提取传播。你导入到自己书库里的书由你自行负责，请只导入你有权使用的书。本软件使用的开源组件及其许可见「版权与许可」页。</p>

          <h2><span>五</span>免责声明</h2>
          <p>本软件按现状提供。对因使用本软件内容所作的决定及其后果，本软件不承担责任。请理性看待命理判断，不要过度依赖。</p>

          <h2><span>六</span>法律适用</h2>
          <p>本条款适用中华人民共和国法律。发生争议时，双方应友好协商。</p>

          <h2><span>七</span>联系方式</h2>
          <p>使用问题和建议，请到项目的开源仓库反馈。</p>
          </div>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
