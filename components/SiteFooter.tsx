import Link from 'next/link';

/** 全站页脚：入口 + 条款 + 开源声明。 */
export default function SiteFooter() {
  return (
    <footer className="site-colophon no-print">
      <div className="wrap">
        <nav className="site-foot-nav" aria-label="页脚导航">
          <Link href="/chart">起盘</Link>
          <Link href="/heming">合盘</Link>
          <Link href="/library">古籍库</Link>
          <Link href="/knowledge">星曜知识</Link>
          <Link href="/help">使用说明</Link>
          <Link href="/privacy">隐私政策</Link>
          <Link href="/terms">使用条款</Link>
          <Link href="/licenses">版权与许可</Link>
        </nav>
        <p className="site-foot-oss">本软件排盘部分基于 MIT 许可的开源项目 ziwei-doushu（© 2026 紫微研究）、iztro（© 2023 All Contributors）与 lunar-javascript（© 2018 6tail），许可全文见「版权与许可」。</p>
      </div>
    </footer>
  );
}
