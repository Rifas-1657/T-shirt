'use client';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { BOTTLES } from '@/lib/perfume';
import type { PublicProduct } from '@/lib/types';
import type { SalonMode } from './PerfumeScene';
import { turningBottle } from './salonState';

const PerfumeScene = dynamic(() => import('./PerfumeScene').then((m) => m.PerfumeScene), { ssr: false });

const EASE = [0.22, 0.8, 0.24, 1] as const;
const money = (p: PublicProduct) => new Intl.NumberFormat('en-US', { style: 'currency', currency: p.currency, maximumFractionDigits: 0 }).format(p.price);
const MOBILE_QUERY = '(max-width: 767px)';
function subscribeMobile(cb: () => void) {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

/**
 * Opening: the wall is dark; the house name appears, and once the 3D scene has really rendered the veil
 * lifts while the niche lamps strike one after another (the lights are the reveal). It doubles as the
 * loading screen; a safety timeout keeps slow devices from waiting forever.
 */
function Intro({ ready, onReveal, onDone }: { ready: boolean; onReveal: () => void; onDone: () => void }) {
  const [minTime, setMinTime] = useState(false);
  const [forced, setForced] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => setMinTime(true), 2200);
    const b = setTimeout(() => setForced(true), 9000);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);
  const leaving = (ready && minTime) || forced;
  useEffect(() => {
    if (!leaving) return;
    onReveal(); // the lamps start striking as the veil lifts
    const t = setTimeout(onDone, 1400);
    return () => clearTimeout(t);
  }, [leaving, onReveal, onDone]);
  return (
    <motion.div className="fixed inset-0 z-50 bg-[#0a0809]" initial={{ opacity: 1 }} animate={{ opacity: leaving ? 0 : 1 }} transition={{ duration: 1.3, delay: leaving ? 0.2 : 0, ease: EASE }} data-testid="perfume-intro">
      <motion.div className="flex h-full flex-col items-center justify-center text-center" animate={{ opacity: leaving ? 0 : 1, scale: leaving ? 1.04 : 1 }} transition={{ duration: 0.8, ease: EASE }}>
        <motion.p lang="ar" dir="rtl" className="font-display text-6xl text-[#c9a45c] md:text-7xl" initial={{ opacity: 0, filter: 'blur(8px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} transition={{ delay: 0.2, duration: 1.4, ease: EASE }}>
          عطور
        </motion.p>
        <motion.p className="font-display mt-5 text-3xl text-[#efe6d8] md:text-4xl" initial={{ opacity: 0, letterSpacing: '0.5em' }} animate={{ opacity: 1, letterSpacing: '0.24em' }} transition={{ delay: 0.6, duration: 1.6, ease: EASE }}>
          Maison des parfums
        </motion.p>
        <motion.span aria-hidden className="mt-6 block h-px bg-gradient-to-r from-transparent via-[#8a1538] to-transparent" initial={{ width: 0 }} animate={{ width: 260 }} transition={{ delay: 1.1, duration: 1.1, ease: EASE }} />
        {!leaving && minTime && (
          <motion.p className="mt-8 text-xs text-[#efe6d8]/45" initial={{ opacity: 0 }} animate={{ opacity: [0.3, 0.8, 0.3] }} transition={{ duration: 1.6, repeat: Infinity }} role="status">
            Lighting the niches…
          </motion.p>
        )}
      </motion.div>
      <button onClick={onDone} className="absolute right-5 bottom-5 z-10 border border-[#c9a45c]/50 px-4 py-2 text-xs text-[#efe6d8] hover:bg-white/10" data-testid="skip-intro">
        Skip
      </button>
    </motion.div>
  );
}

function Notes({ p }: { p: PublicProduct }) {
  const n = p.perfume!.notes;
  const rows: [string, string[]][] = [['Top', n.top], ['Heart', n.heart], ['Base', n.base]];
  return (
    <dl className="mt-7 max-w-sm" data-testid="perfume-notes">
      {rows.map(([k, v], i) =>
        v.length ? (
          <motion.div key={k} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.07, duration: 0.5, ease: EASE }} className="grid grid-cols-[4.5rem_1fr] items-baseline gap-4 border-t border-[#efe6d8]/12 py-2.5">
            <dt className="text-xs text-[#c9a45c]">{k}</dt>
            <dd className="text-sm text-[#efe6d8]">{v.join(', ')}</dd>
          </motion.div>
        ) : null,
      )}
    </dl>
  );
}

export function PerfumeExperience({ products }: { products: PublicProduct[] }) {
  const prefersReduced = useReducedMotion() ?? false;
  const mobile = useSyncExternalStore(subscribeMobile, () => window.matchMedia(MOBILE_QUERY).matches, () => false);
  const [introOn, setIntroOn] = useState(true);
  const [sceneReady, setSceneReady] = useState(false);
  const onReady = useCallback(() => setSceneReady(true), []);
  const [rawMode, setMode] = useState<SalonMode>('intro');
  // reduced motion: no opening, straight to the gallery
  const mode: SalonMode = prefersReduced && rawMode === 'intro' ? 'gallery' : rawMode;
  const params = useSearchParams();
  // deep link ?p=<id> opens that perfume
  const [active, setActive] = useState(() => Math.max(0, products.findIndex((x) => x.id === params.get('p'))));
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const wheel = useRef({ dx: 0, at: 0 });
  const showIntroRef = useRef(true);
  const p = products[active];

  const reveal = useCallback(() => setMode((m) => (m === 'intro' ? 'gallery' : m)), []);
  const endIntro = useCallback(() => {
    setIntroOn(false);
    setMode((m) => (m === 'intro' ? 'gallery' : m));
  }, []);
  // every perfume and every "Discover" is a history entry (?p=<id>[&view=details]), so the browser's
  // Back/Forward buttons step through what the customer looked at instead of leaving the salon
  const open = useCallback(
    (i: number, m: 'gallery' | 'inspect') => {
      setActive(i);
      setMode(m);
      window.history.pushState({ salon: true }, '', `/perfumes?p=${products[i].id}${m === 'inspect' ? '&view=details' : ''}`);
    },
    [products],
  );
  const go = useCallback((d: 1 | -1) => open((active + d + products.length) % products.length, mode === 'inspect' ? 'inspect' : 'gallery'), [active, mode, open, products.length]);
  const closeDetails = useCallback(() => {
    if (window.history.state?.salon && new URLSearchParams(window.location.search).get('view') === 'details') window.history.back();
    else setMode('gallery');
  }, []);
  const select = useCallback(
    (i: number) => {
      if (mode === 'intro') return;
      open(i, i === active ? 'inspect' : 'gallery');
    },
    [active, mode, open],
  );
  useEffect(() => {
    const onPop = () => {
      const q = new URLSearchParams(window.location.search);
      setActive(Math.max(0, products.findIndex((x) => x.id === q.get('p'))));
      setMode(q.get('view') === 'details' ? 'inspect' : 'gallery');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [products]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showIntroRef.current) return;
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Escape') closeDetails();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, closeDetails]);

  const showIntro = introOn && !prefersReduced;
  useEffect(() => {
    showIntroRef.current = showIntro;
  }, [showIntro]);

  if (!products.length)
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#0a0809] text-center text-[#efe6d8]">
        <div>
          <p className="font-display text-4xl">The perfume salon opens soon</p>
          <p className="mt-2 text-sm text-[#d6b46e]">No perfumes are published yet.</p>
          <Link href="/" className="mt-6 inline-block underline">Visit the apparel boutique</Link>
        </div>
      </main>
    );

  const spec = p.perfume!;
  return (
    <main
      className="relative h-dvh w-full overflow-hidden bg-[#0a0809] text-[#efe6d8]"
      // drag (mouse) or swipe (touch) sideways anywhere on the salon to move to the next perfume;
      // dragging the bottle itself turns it instead
      onPointerDown={(e) => {
        swipe.current = (e.target as HTMLElement).closest('button, a, input') ? null : { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const s0 = swipe.current;
        swipe.current = null;
        if (!s0 || mode === 'intro' || turningBottle.current) return;
        const dx = e.clientX - s0.x;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - s0.y)) go(dx < 0 ? 1 : -1);
      }}
      // two-finger sideways scroll on a trackpad
      onWheel={(e) => {
        if (mode !== 'gallery' || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
        const w = wheel.current;
        w.dx += e.deltaX;
        if (Math.abs(w.dx) > 80 && performance.now() - w.at > 700) {
          go(w.dx > 0 ? 1 : -1);
          w.dx = 0;
          w.at = performance.now();
        }
      }}
    >
      <div className="fixed inset-0" data-testid="perfume-stage">
        <PerfumeScene products={products} active={active} mode={mode} onSelect={select} mobile={mobile} reduced={prefersReduced} onReady={onReady} />
      </div>

      <header className="fixed inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-4 md:px-10">
        <Link href="/" className="font-display text-lg whitespace-nowrap tracking-[0.12em] text-[#faf4ec] md:text-2xl md:tracking-[0.14em]">ATELIER ÉCRU</Link>
        <nav aria-label="Primary" className="flex gap-3 text-[0.62rem] tracking-[0.14em] uppercase md:gap-6 md:text-[0.68rem] md:tracking-[0.28em]">
          <Link href="/" className="text-[#f6ece6]/70 hover:text-[#faf4ec]">Apparel</Link>
          <Link href="/perfumes" aria-current="page" className="border-b border-[#d6b46e] text-[#e9cf93]">Perfumes</Link>
          <Link href="/admin" className="hidden text-[#f6ece6]/70 hover:text-[#faf4ec] md:inline">Admin</Link>
        </nav>
      </header>

      {/* the wall: a slim bar under the niches (the perfumes are the heroes) */}
      <AnimatePresence mode="wait">
        {mode === 'gallery' && (
          <motion.section key={p.id} className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-[#0a0809] via-[#0a0809]/80 to-transparent px-6 pt-20 pb-6 text-center md:flex md:items-end md:justify-between md:gap-8 md:bg-gradient-to-t md:from-[#0a0809]/90 md:via-[#0a0809]/40 md:px-12 md:pt-14 md:pb-7 md:text-left" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }} transition={{ duration: 0.5, ease: EASE }} aria-live="polite" data-testid="perfume-caption">
            <div className="md:flex md:items-baseline md:gap-5">
              <h1 className="font-display text-4xl leading-none text-[#efe6d8] md:text-[2.6rem]" data-testid="perfume-title">{p.title}</h1>
              <p className="mt-2 text-sm text-[#efe6d8]/65 md:mt-0">
                {spec.concentration}, {spec.volumeMl} ml{spec.family ? <span className="text-[#efe6d8]/40"> — {spec.family}</span> : null}
              </p>
              <p className="font-display mt-1 text-xl text-[#c9a45c] tabular-nums md:mt-0">{money(p)}</p>
            </div>
            <div className="mt-4 flex shrink-0 items-center justify-center gap-2 md:mt-0">
              <span className="mr-2 hidden text-xs text-[#efe6d8]/40 lg:inline">Drag or swipe to browse</span>
              <button className="flex h-11 w-11 items-center justify-center rounded-full border border-[#efe6d8]/25 text-lg text-[#efe6d8] hover:border-[#efe6d8]/60" onClick={() => go(-1)} aria-label="Previous perfume" data-testid="perfume-prev">‹</button>
              <button className="h-11 rounded-full bg-[#8a1538] px-7 text-sm font-medium text-[#f6ece6] hover:bg-[#a01a42]" onClick={() => open(active, 'inspect')} data-testid="perfume-discover">Discover</button>
              <button className="flex h-11 w-11 items-center justify-center rounded-full border border-[#efe6d8]/25 text-lg text-[#efe6d8] hover:border-[#efe6d8]/60" onClick={() => go(1)} aria-label="Next perfume" data-testid="perfume-next">›</button>
              <span className="ml-2 text-xs text-[#efe6d8]/50 tabular-nums">{active + 1} of {products.length}</span>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* close-up: the niche fills the right half, the perfume's details sit on the left */}
      <AnimatePresence>
        {mode === 'inspect' && (
          <motion.aside
            key="details"
            className="fixed inset-x-0 bottom-0 z-20 max-h-[56dvh] overflow-y-auto bg-[#0a0809] px-6 pt-6 pb-8 md:inset-y-0 md:right-auto md:left-0 md:flex md:max-h-none md:w-[46vw] md:max-w-[640px] md:flex-col md:justify-center md:bg-[linear-gradient(90deg,#0a0809_0%,#0a0809_72%,rgba(10,8,9,0)_100%)] md:px-14 md:pr-24"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20, transition: { duration: 0.25 } }}
            transition={{ duration: 0.6, ease: EASE }}
            aria-label={`${p.title} details`}
            data-testid="perfume-detail"
          >
            <AnimatePresence mode="wait">
              <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }} transition={{ duration: 0.45, ease: EASE }}>
                <p className="text-sm text-[#c9a45c]">
                  {spec.concentration}, {spec.volumeMl} ml
                </p>
                <h2 className="font-display mt-2 text-5xl leading-[0.95] text-[#efe6d8] md:text-7xl">{p.title}</h2>
                {spec.family && <p className="mt-3 text-sm text-[#efe6d8]/55">{spec.family}</p>}
                {p.description && <p className="mt-5 max-w-sm text-[0.95rem] leading-relaxed text-[#efe6d8]/80">{p.description}</p>}
                <Notes p={p} />
                <p className="font-display mt-7 text-3xl text-[#c9a45c] tabular-nums">{money(p)}</p>
              </motion.div>
            </AnimatePresence>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <button className="text-sm text-[#efe6d8]/70 underline-offset-4 hover:text-[#efe6d8] hover:underline" onClick={closeDetails} data-testid="perfume-back">Back to the wall</button>
              <span className="flex items-center gap-2">
                <button className="flex h-9 w-9 items-center justify-center rounded-full border border-[#efe6d8]/25 text-[#efe6d8] hover:border-[#efe6d8]/60" onClick={() => go(-1)} aria-label="Previous perfume" data-testid="detail-prev">‹</button>
                <span className="text-xs text-[#efe6d8]/50 tabular-nums">{active + 1} of {products.length}</span>
                <button className="flex h-9 w-9 items-center justify-center rounded-full border border-[#efe6d8]/25 text-[#efe6d8] hover:border-[#efe6d8]/60" onClick={() => go(1)} aria-label="Next perfume" data-testid="detail-next">›</button>
              </span>
            </div>
            {!p.photos?.length || p.photos.filter((x) => x.view !== 'detail').length > 1 ? (
              <p className="mt-5 text-xs text-[#efe6d8]/40">{p.photos?.length ? 'Drag the bottle to turn it.' : 'Drag to look around the bottle.'}</p>
            ) : null}
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>{showIntro && <Intro ready={sceneReady} onReveal={reveal} onDone={endIntro} />}</AnimatePresence>
    </main>
  );
}
