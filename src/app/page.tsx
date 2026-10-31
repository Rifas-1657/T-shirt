import { Showroom } from '@/components/showroom/Showroom';
import { publicCatalogue } from '@/server/storage';

export const dynamic = 'force-dynamic';

export default async function Home() {
  // the boutique racks show apparel only; perfumes live at /perfumes
  const products = (await publicCatalogue()).filter((p) => p.kind !== 'perfume');
  return <Showroom initialProducts={products} />;
}
