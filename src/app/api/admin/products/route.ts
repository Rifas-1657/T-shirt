import { NextResponse } from 'next/server';
import { adminRoute } from '@/server/adminRoute';
import { createProduct, resumePhotoCutouts } from '@/server/catalogAdmin';
import { readProducts } from '@/server/storage';

export const GET = adminRoute(async () => {
  void resumePhotoCutouts(); // cut-outs interrupted by a server restart
  // originalKey is a private storage path; keep it server-side even for admins
  const products = (await readProducts()).map((p) => ({ ...p, versions: p.versions.map(({ originalKey: _k, ...v }) => v) }));
  return NextResponse.json({ products });
});

export const POST = adminRoute(async (req) => {
  const product = await createProduct(await req.json());
  return NextResponse.json({ product }, { status: 201 });
});
