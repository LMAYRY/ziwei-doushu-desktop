'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from '@/components/ThemeProvider';

const NAV = [
  { href: '/chart', label: '起盘' },
  { href: '/heming', label: '合盘' },
  { href: '/library', label: '古籍库' },
  { href: '/knowledge', label: '星曜知识' },
  { href: '/settings', label: '设置' },
  { href: '/help', label: '帮助' },
];

/** 全站顶栏：站名印章 + 各入口 + 白天 / 黑夜切换。 */
export default function SiteHeader({ wide = false }: { wide?: boolean }) {
  const pathname = usePathname() || '/';
  const { toggle } = useTheme();

  return (
    <header className="site-top no-print">
      <div className={`site-top-inner ${wide ? 'wrap-wide' : 'wrap'}`}>
        <Link className="site-brand" href="/">
          <span className="seal site-seal" aria-hidden>紫</span>
          紫微命盘
        </Link>
        <nav className="site-nav" aria-label="主导航">
          {NAV.map(item => {
            const on = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link key={item.href} href={item.href} className={on ? 'on' : undefined} aria-current={on ? 'page' : undefined}>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <span className="site-spacer" />
        <span className="site-tagline">依传统紫微斗数体系</span>
        <button
          type="button"
          className="site-theme"
          onClick={toggle}
          aria-label="切换白天（亮色）/ 黑夜（暗色）配色"
          title="切换白天 / 黑夜配色"
        >
          {/* 显示点了之后会切到的配色；文案由 html[data-theme] 经 CSS 决定，服务端与客户端渲染一致 */}
          <span className="site-theme-to-night">☾ 黑夜</span>
          <span className="site-theme-to-paper">☀ 白天</span>
        </button>
      </div>
    </header>
  );
}
