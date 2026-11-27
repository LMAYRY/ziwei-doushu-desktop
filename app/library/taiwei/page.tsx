import { TAIWEI_TITLE } from '@/lib/classics/taiwei';
import { bookName } from '@/lib/classics/citation';
import BundledBookNotice from '@/components/BundledBookNotice';

export const dynamic = 'force-dynamic';

// 《太微赋》预览文字属于内置书库：只供 AI 检索，不提供阅读（回答里的出处仍会链到这里）。
export default async function TaiweiPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await searchParams;
  return <BundledBookNotice title={bookName(TAIWEI_TITLE)} page={Number(page) || undefined} />;
}
