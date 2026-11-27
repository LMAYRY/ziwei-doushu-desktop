// Removes a book the user imported (bundled books cannot be removed).
import { rejectForeign } from '@/lib/library-import/guard';
import { removeImportedBook } from '@/lib/library-import/job';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = rejectForeign(request);
  if (rejected) return rejected;
  const removed = await removeImportedBook((await params).id);
  return removed ? Response.json({ ok: true }) : Response.json({ error: '找不到这本导入的书' }, { status: 404 });
}
