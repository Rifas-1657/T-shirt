import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { AdminLogin } from '@/components/admin/AdminLogin';
import { isAdmin } from '@/server/auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Atelier Écru — Admin', robots: { index: false } };

export default async function AdminPage() {
  const ok = await isAdmin();
  return (
    <main className="min-h-dvh bg-paper">
      <header className="flex items-center justify-between border-b border-line px-6 py-4">
        <Link href="/" className="font-display text-xl tracking-[0.14em]">ATELIER ÉCRU</Link>
        <span className="flex items-center gap-5">
          <span className="eyebrow">Catalogue admin</span>
          <Link href="/" className="text-xs underline" data-testid="back-to-store">← Back to the store</Link>
        </span>
      </header>
      {ok ? <AdminDashboard /> : <AdminLogin />}
    </main>
  );
}
