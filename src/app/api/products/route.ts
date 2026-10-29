import { NextResponse } from 'next/server';
import { publicCatalogue } from '@/server/storage';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ products: await publicCatalogue() });
}
