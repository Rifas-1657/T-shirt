// Creates a perfume presentation version (publish it with /publish). Perfumes are not customisable.
import { NextResponse } from 'next/server';
import { adminRoute } from '@/server/adminRoute';
import { addPerfumeVersion } from '@/server/catalogAdmin';

export const POST = adminRoute<{ id: string }>(async (_req, { id }) => {
  const version = await addPerfumeVersion(id);
  return NextResponse.json({ version }, { status: 201 });
});
