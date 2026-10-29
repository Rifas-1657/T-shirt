// Public artwork upload for the customer editor. Validated + sanitised before storage.
import { NextResponse } from 'next/server';
import { clientKey, rateLimited, storeUpload } from '@/server/files';
import { IMAGE_LIMITS, validateImage } from '@/server/uploadValidate';

export async function POST(req: Request) {
  if (rateLimited(`upload:${clientKey(req)}`, 30, 10 * 60_000))
    return NextResponse.json({ errors: ['Too many uploads; try again in a few minutes.'] }, { status: 429 });
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > IMAGE_LIMITS.maxBytes + 64 * 1024) return NextResponse.json({ errors: ['File too large (max 8 MB).'] }, { status: 413 });
  let file: File | null = null;
  try {
    const f = (await req.formData()).get('file');
    file = f instanceof File ? f : null;
  } catch {
    return NextResponse.json({ errors: ['Expected multipart/form-data with a "file" field.'] }, { status: 400 });
  }
  if (!file) return NextResponse.json({ errors: ['No file uploaded.'] }, { status: 400 });
  const check = await validateImage(Buffer.from(await file.arrayBuffer()));
  if (!check.ok || !check.data) return NextResponse.json({ errors: check.errors }, { status: 422 });
  const id = await storeUpload(check.data, { contentType: check.contentType!, width: check.width, height: check.height, owner: 'customer' });
  return NextResponse.json({ id, url: `/api/uploads/${id}`, width: check.width, height: check.height, kind: check.kind });
}
