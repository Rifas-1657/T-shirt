// Product photos (perfumes): validate, store the original, cut the product out of a plain light
// background, and suggest a liquid colour from the first photo.
import { NextResponse } from 'next/server';
import { adminRoute } from '@/server/adminRoute';
import { addProductPhotos, AdminError, MAX_PHOTOS, queuePhotoCutout } from '@/server/catalogAdmin';
import { aiCutoutAvailable } from '@/server/aiCutout';
import { storeUpload } from '@/server/files';
import { cutoutProduct } from '@/server/productCutout';
import { validateImage } from '@/server/uploadValidate';
import type { PhotoView, ProductPhoto } from '@/lib/types';

export const POST = adminRoute<{ id: string }>(async (req, { id }) => {
  const form = await req.formData();
  const files = form.getAll('photo').filter((f): f is File => f instanceof File && f.size > 0);
  const views = form.getAll('view').map((v) => (typeof v === 'string' && v ? (v as PhotoView) : undefined));
  if (!files.length) throw new AdminError(400, ['Choose at least one photo.']);
  if (files.length > MAX_PHOTOS) throw new AdminError(422, [`At most ${MAX_PHOTOS} photos at once.`]);
  const errors: string[] = [];
  const photos: Omit<ProductPhoto, 'id' | 'view'>[] = [];
  const notes: string[] = [];
  const okViews: (PhotoView | undefined)[] = [];
  let accent: string | undefined;
  for (const [n, f] of files.entries()) {
    const check = await validateImage(Buffer.from(await f.arrayBuffer()));
    if (!check.ok || !check.data) {
      errors.push(...check.errors.map((e) => `${f.name}: ${e}`));
      continue;
    }
    if (check.kind === 'svg') {
      errors.push(`${f.name}: use a PNG or JPEG photo, not SVG.`);
      continue;
    }
    const uid = await storeUpload(check.data, { contentType: check.contentType!, width: check.width, height: check.height, owner: 'admin' });
    const cut = await cutoutProduct(check.data);
    let cutoutUrl: string | undefined;
    if (cut.ok && cut.png) {
      const cid = await storeUpload(cut.png, { contentType: 'image/png', width: cut.width, height: cut.height, owner: 'admin' });
      cutoutUrl = `/api/uploads/${cid}`;
      accent ??= cut.accentColor;
    } else if (!aiCutoutAvailable()) notes.push(`${f.name}: ${cut.reason}`);
    okViews.push(views[n]);
    photos.push({ url: `/api/uploads/${uid}`, cutoutUrl, useCutout: !!cutoutUrl, width: cut.ok && cut.width ? cut.width : check.width!, height: cut.ok && cut.height ? cut.height : check.height! });
  }
  if (errors.length && !photos.length) throw new AdminError(422, errors);
  let list = await addProductPhotos(id, photos, okViews);
  // busy backgrounds: the AI cut-out runs in the background (about 20 s per photo)
  const busy = list.slice(-photos.length).filter((ph) => !ph.cutoutUrl);
  for (const ph of busy) await queuePhotoCutout(id, ph.id);
  if (busy.length && aiCutoutAvailable()) {
    notes.push(`Removing the background from ${busy.length} photo${busy.length > 1 ? 's' : ''} with AI (about 20 seconds each). The page updates by itself.`);
    list = list.map((ph) => (busy.some((b) => b.id === ph.id) ? { ...ph, cutout: 'working' as const } : ph));
  }
  return NextResponse.json({ photos: list, errors, notes, suggestedLiquid: accent }, { status: 201 });
});
