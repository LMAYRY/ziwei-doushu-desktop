import { readFile } from 'node:fs/promises';
import { localBookImage } from '@/lib/classics/local-books';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; page: string }> }) {
  const { id, page } = await params;
  const path = await localBookImage(id, page);
  const data = path ? await readFile(path).catch(() => null) : null;
  if (!data) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(data), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' } });
}
