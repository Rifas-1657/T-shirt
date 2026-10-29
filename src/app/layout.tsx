import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, DM_Mono, Manrope } from 'next/font/google';
import './globals.css';

const serif = Cormorant_Garamond({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-serif', display: 'swap' });
const sans = Manrope({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sans', display: 'swap' });
const mono = DM_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Atelier Écru — 3D Showroom',
  description: 'Browse the collection in a 3D atelier and print your own front and back artwork.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#efebe4' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
