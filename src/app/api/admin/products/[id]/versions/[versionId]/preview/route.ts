// Stores a preview rendered in the admin's browser (WebGL snapshot of the validated derivative).
import { NextResponse } from 'next/server';
import { adminRoute } from '@/server/adminRoute';
import { AdminError, setVersionPreview } from '@/server/catalogAdmin';
import { storePreviewDataUrl } from '@/server/files';

export const POST = adminRoute<{ id: string; versionId: string }>(async (req, { id, versionId }) => {
  const pid = await storePreviewDataUrl((await req.json()).dataUrl);
  if (!pid) throw new AdminError(422, ['Preview must be a PNG data URL under 4 MB.']);
  await setVersionPreview(id, versionId, `/api/previews/${pid}`);
  return NextResponse.json({ previewUrl: `/api/previews/${pid}` });
});
