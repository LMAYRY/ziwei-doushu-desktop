// 书库管理：查看、勾选 AI 检索用哪些书库、新建 / 改名 / 删除用户书库、把书移到别的书库。
// 只在能导入书的环境里开放（桌面版、本机自用的网页版），见 lib/library-import/guard.ts。
import { rejectForeign } from '@/lib/library-import/guard';
import {
  BUILTIN_LIBRARY, MAX_LIBRARIES, cleanName, libraryOf, newLibraryId, readLibraries, writeLibraries,
} from '@/lib/classics/libraries';
import { readLocalBooks } from '@/lib/classics/local-books';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return rejectForeign(request) ?? Response.json(await readLibraries());
}

type Body = { action?: string; id?: string; name?: string; selected?: unknown; bookId?: string; library?: string };

export async function POST(request: Request) {
  const rejected = rejectForeign(request);
  if (rejected) return rejected;
  const body: Body = await request.json().catch(() => ({}));
  const state = await readLibraries();
  const exists = (id?: string) => !!id && state.libraries.some(item => item.id === id);
  const fail = (error: string, status = 400) => Response.json({ error }, { status });

  switch (body.action) {
    case 'select': {
      if (!Array.isArray(body.selected)) return fail('参数不正确');
      state.selected = [...new Set(body.selected.filter((id): id is string =>
        typeof id === 'string' && (id === BUILTIN_LIBRARY || exists(id))))];
      break;
    }
    case 'create': {
      const name = cleanName(body.name);
      if (!name) return fail('请填写书库名称');
      if (state.libraries.length >= MAX_LIBRARIES) return fail(`最多建 ${MAX_LIBRARIES} 个书库`);
      const id = newLibraryId();
      state.libraries.push({ id, name });
      // 新书库默认参与检索，导入书后马上能用上。
      state.selected.push(id);
      break;
    }
    case 'rename': {
      const name = cleanName(body.name);
      const library = state.libraries.find(item => item.id === body.id);
      if (!library || !name) return fail('参数不正确');
      library.name = name;
      break;
    }
    case 'delete': {
      if (!exists(body.id)) return fail('找不到这个书库', 404);
      if (state.libraries.length <= 1) return fail('至少保留一个书库');
      const books = (await readLocalBooks()).filter(book => book.imported && libraryOf(state, book.id) === body.id);
      if (books.length) return fail('书库里还有书，请先删除或移走这些书');
      state.libraries = state.libraries.filter(item => item.id !== body.id);
      state.selected = state.selected.filter(id => id !== body.id);
      break;
    }
    case 'move': {
      const books = await readLocalBooks();
      if (!books.some(book => book.id === body.bookId && book.imported) || !exists(body.library)) return fail('参数不正确');
      state.books[body.bookId!] = body.library!;
      break;
    }
    default:
      return fail('不支持的操作');
  }
  await writeLibraries(state);
  return Response.json(await readLibraries());
}
