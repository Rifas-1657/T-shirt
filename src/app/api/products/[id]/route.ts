import { NextResponse } from 'next/server';
import { publicProduct } from '@/server/storage';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = await publicProduct((await params).id);
  return p ? NextResponse.json({ product: p }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}
