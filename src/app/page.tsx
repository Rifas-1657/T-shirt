import { Showroom } from '@/components/showroom/Showroom';
import { publicCatalogue } from '@/server/storage';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const products = await publicCatalogue();
  return <Showroom initialProducts={products} />;
}
