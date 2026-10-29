import { NextResponse } from 'next/server';
import { adminRoute } from '@/server/adminRoute';
import { updateProduct } from '@/server/catalogAdmin';

export const PATCH = adminRoute<{ id: string }>(async (req, { id }) => {
  const product = await updateProduct(id, await req.json());
  return NextResponse.json({ product });
});
