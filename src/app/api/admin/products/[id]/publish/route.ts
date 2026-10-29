// POST {versionId} publishes that version; POST {versionId: null} unpublishes the product.
import { NextResponse } from 'next/server';
import { adminRoute } from '@/server/adminRoute';
import { AdminError, publishVersion } from '@/server/catalogAdmin';

export const POST = adminRoute<{ id: string }>(async (req, { id }) => {
  const body = await req.json();
  if (body.versionId !== null && typeof body.versionId !== 'string') throw new AdminError(422, ['versionId must be a string or null.']);
  const product = await publishVersion(id, body.versionId);
  return NextResponse.json({ product });
});
