import { readPreview } from '@/server/files';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const buf = await readPreview((await params).id);
  if (!buf) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(buf), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' } });
}
