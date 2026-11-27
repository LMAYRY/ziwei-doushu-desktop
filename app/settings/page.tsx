import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import AiSettings from './AiSettings';

export const metadata = { title: '设置 · 紫微命盘', robots: { index: false } };

export default function SettingsPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <AiSettings />
      </main>
      <SiteFooter />
    </>
  );
}
