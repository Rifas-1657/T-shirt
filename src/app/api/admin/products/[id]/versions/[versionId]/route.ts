// Update a version's print/display profile (printable meshes, zones, transform, mapping confirmation).
import { NextResponse } from 'next/server';
import { adminRoute } from '@/server/adminRoute';
import { updateTemplateArtwork, updateVersionProfile } from '@/server/catalogAdmin';

export const PATCH = adminRoute<{ id: string; versionId: string }>(async (req, { id, versionId }) => {
  const body = await req.json();
  // image-based versions edit their artwork placement/approval; GLB versions edit their print profile
  const updated = body.baseLayers !== undefined || body.artworkApproved !== undefined ? await updateTemplateArtwork(id, versionId, body) : await updateVersionProfile(id, versionId, body);
  const { originalKey: _k, ...version } = updated;
  return NextResponse.json({ version });
});
