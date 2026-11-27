import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { localBookPdf } from '@/lib/classics/local-books';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const path = await localBookPdf((await params).id);
  if (!path) return new Response(null, { status: 404 });
  const file = await stat(path).catch(() => null);
  if (!file?.isFile()) return new Response(null, { status: 404 });
  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(file.size),
      'Cache-Control': 'private, no-store',
    },
  });
}
