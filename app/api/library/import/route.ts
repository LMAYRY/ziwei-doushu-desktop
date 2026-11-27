// 「导入我的书」: POST the PDF as the request body (file name in x-ziwei-file-name, URI-encoded),
// then poll GET for progress; DELETE cancels. See lib/library-import/job.ts.
import { cancelImport, currentImport, ImportError, startImport } from '@/lib/library-import/job';
import { rejectForeign } from '@/lib/library-import/guard';
import { readLibraries } from '@/lib/classics/libraries';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return rejectForeign(request) ?? Response.json({ job: currentImport() });
}

export async function POST(request: Request) {
  const rejected = rejectForeign(request);
  if (rejected) return rejected;
  if (!request.body) return Response.json({ error: '没有收到文件' }, { status: 400 });
  let name = 'book.pdf';
  try {
    name = decodeURIComponent(request.headers.get('x-ziwei-file-name') ?? name);
  } catch {}
  try {
    // 导入到哪个书库（x-ziwei-target-library）；不认识的就放进第一个用户书库。
    const target = request.headers.get('x-ziwei-target-library') ?? '';
    const state = await readLibraries();
    const library = state.libraries.some(item => item.id === target) ? target : undefined;
    return Response.json({ job: await startImport(name.split(/[\\/]/).pop() ?? name, request.body, library) }, { status: 202 });
  } catch (error) {
    if (error instanceof ImportError) return Response.json({ error: error.message }, { status: error.status });
    console.error('Book upload failed', error);
    return Response.json({ error: '保存文件失败' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  return rejectForeign(request) ?? Response.json({ job: cancelImport() });
}
