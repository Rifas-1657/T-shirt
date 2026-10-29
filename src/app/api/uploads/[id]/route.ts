import { readUpload } from '@/server/files';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await readUpload((await params).id);
  if (!u) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(u.data), {
    headers: {
      'Content-Type': u.meta.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      // sanitised SVGs are additionally sandboxed if opened directly
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
