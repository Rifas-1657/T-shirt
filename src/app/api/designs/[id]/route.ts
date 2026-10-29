import { NextResponse } from 'next/server';
import { loadDesign } from '@/server/storage';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const d = await loadDesign((await params).id);
  return d ? NextResponse.json({ design: d }) : NextResponse.json({ error: 'Design not found' }, { status: 404 });
}
