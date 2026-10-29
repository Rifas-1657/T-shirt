// Image-only pathway: front/back garment photos or print artwork mapped onto the product's
// category template. Garment photos are analysed: fabric colour measured, print cut out and placed.
import { NextResponse } from 'next/server';
import { adminRoute } from '@/server/adminRoute';
import { addTemplateImageVersion, AdminError, type SideInput } from '@/server/catalogAdmin';
import { storeUpload } from '@/server/files';
import { analyzeGarmentPhoto } from '@/server/garmentPhoto';
import { validateImage } from '@/server/uploadValidate';
import type { ZoneId } from '@/lib/types';

export const POST = adminRoute<{ id: string }>(async (req, { id }) => {
  const form = await req.formData();
  const sides: Partial<Record<ZoneId, SideInput>> = {};
  const errors: string[] = [];
  for (const zone of ['front', 'back'] as const) {
    const f = form.get(zone);
    if (!(f instanceof File) || f.size === 0) continue;
    const check = await validateImage(Buffer.from(await f.arrayBuffer()));
    if (!check.ok || !check.data) {
      errors.push(...check.errors.map((e) => `${zone}: ${e}`));
      continue;
    }
    const sourceId = await storeUpload(check.data, { contentType: check.contentType!, width: check.width, height: check.height, owner: 'admin' });
    const sourceUrl = `/api/uploads/${sourceId}`;
    if (check.kind === 'svg') {
      sides[zone] = { sourceUrl, kind: 'artwork', notes: ['SVG used as ready-made artwork.'], artwork: { url: sourceUrl, width: check.width!, height: check.height! } };
      continue;
    }
    const a = await analyzeGarmentPhoto(check.data);
    if (a.kind === 'artwork') {
      sides[zone] = { sourceUrl, kind: 'artwork', notes: a.notes, artwork: { url: sourceUrl, width: check.width!, height: check.height! } };
    } else if (a.design) {
      const did = await storeUpload(a.design.png, { contentType: 'image/png', width: a.design.width, height: a.design.height, owner: 'admin' });
      const { png: _png, width, height, ...placement } = a.design;
      sides[zone] = { sourceUrl, kind: 'garment-photo', garmentColor: a.garmentColor, notes: a.notes, artwork: { url: `/api/uploads/${did}`, width, height, placement } };
    } else {
      sides[zone] = { sourceUrl, kind: 'garment-photo', garmentColor: a.garmentColor, notes: a.notes };
    }
  }
  if (errors.length) throw new AdminError(422, errors);
  const version = await addTemplateImageVersion(id, sides);
  return NextResponse.json({ version }, { status: 201 });
});
