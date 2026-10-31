import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PerfumeExperience } from '@/components/perfume/PerfumeExperience';
import { publicCatalogue } from '@/server/storage';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Maison des Parfums — Atelier Écru', description: 'Explore our perfumes in 3D: turn each bottle, read its notes.' };

export default async function PerfumesPage() {
  const perfumes = (await publicCatalogue()).filter((p) => p.kind === 'perfume');
  return (
    <Suspense>
      <PerfumeExperience products={perfumes} />
    </Suspense>
  );
}
