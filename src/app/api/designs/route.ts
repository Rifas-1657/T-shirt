// Save a customer design. The server re-validates everything against the published product.
import { NextResponse } from 'next/server';
import { validateDesign } from '@/lib/designSchema';
import { clientKey, rateLimited, readUpload, storePreviewDataUrl } from '@/server/files';
import { newId, publicProduct, saveDesign } from '@/server/storage';

export async function POST(req: Request) {
  if (rateLimited(`design:${clientKey(req)}`, 60, 10 * 60_000))
    return NextResponse.json({ errors: ['Too many saves; try again shortly.'] }, { status: 429 });
  if (Number(req.headers.get('content-length') ?? 0) > 6 * 1024 * 1024)
    return NextResponse.json({ errors: ['Request too large.'] }, { status: 413 });
  let body: { design?: unknown; preview?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errors: ['Invalid JSON.'] }, { status: 400 });
  }
  const productId = (body.design as { productId?: unknown } | undefined)?.productId;
  const product = typeof productId === 'string' ? await publicProduct(productId) : null;
  const result = validateDesign(body.design, product);
  if (!result.ok) return NextResponse.json({ errors: result.errors }, { status: 422 });
  // every referenced image must be an upload that actually exists
  for (const layers of Object.values(result.value.zones))
    for (const l of layers)
      if (l.type === 'image' && !(await readUpload(l.src.split('/').pop()!)))
        return NextResponse.json({ errors: [`Image ${l.name} is no longer available; upload it again.`] }, { status: 422 });
  const previewId = await storePreviewDataUrl(body.preview);
  const id = newId();
  const saved = { ...result.value, id, createdAt: new Date().toISOString(), previewUrl: previewId ? `/api/previews/${previewId}` : undefined };
  await saveDesign(saved);
  return NextResponse.json({ id, previewUrl: saved.previewUrl, design: saved });
}
