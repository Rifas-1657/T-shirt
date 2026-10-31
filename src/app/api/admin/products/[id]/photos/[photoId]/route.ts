import { NextResponse } from 'next/server';
import { adminRoute } from '@/server/adminRoute';
import { AdminError, deleteProductPhoto, queuePhotoCutout, updateProductPhoto } from '@/server/catalogAdmin';

export const PATCH = adminRoute<{ id: string; photoId: string }>(async (req, { id, photoId }) => {
  const body = await req.json();
  // "Cut out with AI" for a photo that was kept framed (or whose cut-out failed)
  if (body.aiCutout) {
    if (!(await queuePhotoCutout(id, photoId))) throw new AdminError(503, ['The AI cut-out is not installed on this server (npm run models).']);
    delete body.aiCutout;
  }
  const photos = await updateProductPhoto(id, photoId, body);
  return NextResponse.json({ photos });
});

export const DELETE = adminRoute<{ id: string; photoId: string }>(async (_req, { id, photoId }) => {
  const photos = await deleteProductPhoto(id, photoId);
  return NextResponse.json({ photos });
});
