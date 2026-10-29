'use client';
import { useProgress } from '@react-three/drei';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { emptyDesign } from '@/lib/designSchema';
import { webglAvailable } from '@/lib/clientAssets';
import { CATEGORY_INFO, RACK_ORDER } from '@/lib/garments';
import { isCustomizable } from '@/lib/printZones';
import type { PublicProduct, SavedDesign } from '@/lib/types';
import { useDesign } from '@/store/designStore';
import { useShowroom, type RackView } from '@/store/showroomStore';
import { openProduct } from '@/store/actions';
import { captureRef } from '@/lib/capture';

const ShowroomCanvas = dynamic(() => import('../three/Scene').then((m) => m.ShowroomCanvas), { ssr: false });
const DesignEditor = dynamic(() => import('../editor/DesignEditor').then((m) => m.DesignEditor), {
  ssr: false,
  loading: () => <p className="text-xs text-mute">Loading editor…</p>,
});

const MOBILE_QUERY = '(max-width: 767px)';
const noopSubscribe = () => () => undefined;
let glCache: boolean | undefined;
const webglAvailableCached = () => (glCache ??= webglAvailable());
function subscribeMobile(cb: () => void) {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

const money = (p: PublicProduct) => new Intl.NumberFormat('en-US', { style: 'currency', currency: p.currency }).format(p.price);

function Loader() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-1/2 z-10 -translate-y-1/2 text-center" role="status" aria-live="polite">
      <p className="eyebrow">Preparing the atelier</p>
      <p className="font-display mt-2 text-3xl">{Math.round(progress)}%</p>
    </div>
  );
}

export function Showroom({ initialProducts }: { initialProducts: PublicProduct[] }) {
  const [products] = useState(initialProducts);
  const mode = useShowroom((s) => s.mode);
  const hoveredId = useShowroom((s) => s.hoveredId);
  const selectedId = useShowroom((s) => s.selectedId);
  const side = useShowroom((s) => s.side);
  const rack = useShowroom((s) => s.rack);
  const { customize, back, setSide, resetView, setHovered, setRack } = useShowroom.getState();
  const anyDesign = useDesign((s) => s.design);
  // null during SSR; resolved on the client without a mount-time setState
  const gl = useSyncExternalStore(noopSubscribe, webglAvailableCached, () => null);
  const mobile = useSyncExternalStore(subscribeMobile, () => window.matchMedia(MOBILE_QUERY).matches, () => false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // save results belong to the product they were made for; switching products hides them
  const [saved, setSaved] = useState<{ productId: string; url?: string; error?: string } | null>(null);
  const savedUrl = saved && saved.productId === selectedId ? (saved.url ?? null) : null;
  const saveError = saved && saved.productId === selectedId ? (saved.error ?? null) : null;


  const selected = products.find((p) => p.id === selectedId) ?? null;
  // only ever show the design that belongs to the open product
  const design = anyDesign && selected && anyDesign.productId === selected.id ? anyDesign : null;
  useEffect(() => {
    // safety net: any path that opens a product without its design gets a fresh one immediately
    if (selected && (!anyDesign || anyDesign.productId !== selected.id)) useDesign.getState().load(emptyDesign(selected));
  }, [selected, anyDesign]);
  const caption = products.find((p) => p.id === hoveredId) ?? null;
  const rackProducts = rack === 'all' ? products : products.filter((p) => p.garment === rack);
  const views: RackView[] = [...RACK_ORDER, 'all'];
  const stepRack = (d: 1 | -1) => setRack(views[(views.indexOf(rack) + d + views.length) % views.length]);

  // deep links: ?design=<id> restores a saved design; ?product=<id> opens a product
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const did = q.get('design');
    const pid = q.get('product');
    if (did) {
      fetch(`/api/designs/${encodeURIComponent(did)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('This saved design could not be found.'))))
        .then(({ design: d }: { design: SavedDesign }) => {
          const p = products.find((x) => x.id === d.productId);
          if (!p) throw new Error('The product for this design is no longer available.');
          if (p.version.id !== d.productVersionId) throw new Error('This design was made for an earlier version of the garment model and cannot be restored exactly.');
          openProduct(p, d);
          useShowroom.getState().customize();
          setNotice('Saved design restored.');
        })
        .catch((e: Error) => setNotice(e.message));
    } else if (pid) {
      const p = products.find((x) => x.id === pid);
      if (p) openProduct(p);
    }
  }, [products]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, [data-testid=zone-stage]')) return;
      if (e.key === 'Escape') back();
      // left/right arrows walk between racks in the collection view
      if (useShowroom.getState().mode === 'collection' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        const vs: RackView[] = [...RACK_ORDER, 'all'];
        const cur = vs.indexOf(useShowroom.getState().rack);
        useShowroom.getState().setRack(vs[(cur + (e.key === 'ArrowRight' ? 1 : -1) + vs.length) % vs.length]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [back]);

  const save = async () => {
    if (!design) return;
    setSaving(true);
    setSaved(null);
    try {
      const preview = captureRef.current ? await Promise.race([captureRef.current(), new Promise<string>((r) => setTimeout(() => r(''), 1500))]) : '';
      const res = await fetch('/api/designs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ design, preview: preview || undefined }) });
      const body = await res.json();
      if (!res.ok) throw new Error((body.errors ?? ['Save failed']).join(' '));
      const url = `${window.location.origin}/?design=${body.id}`;
      window.history.replaceState(null, '', `/?design=${body.id}`);
      setSaved({ productId: design.productId, url });
    } catch (e) {
      setSaved({ productId: design.productId, error: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const canvasClass = mode !== 'customize' ? 'inset-0' : mobile ? 'inset-x-0 top-0 h-[44vh]' : 'inset-y-0 right-0 left-[min(460px,40vw)]';

  const customizable = selected ? isCustomizable(selected.version.modelConfig) : false;
  const isTemplate = selected?.version.modelConfig.source === 'template';

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      {/* 3D stage */}
      <div className={`fixed transition-all duration-500 ${canvasClass}`} data-testid="stage" aria-hidden={mode === 'customize' ? undefined : true}>
        {gl && !fatal && <ShowroomCanvas products={products} mobile={mobile} onError={setFatal} />}
      </div>
      {gl && <Loader />}

      {/* header */}
      <header className={`pointer-events-none fixed inset-x-0 top-0 z-20 ${mode === 'customize' && !mobile ? 'left-[min(460px,40vw)]' : ''}`}>
        <div className="bg-ink py-1.5 text-center text-[0.68rem] tracking-[0.2em] text-bone uppercase">Printed to order in our atelier · Free returns on blank pieces</div>
        <div className="pointer-events-auto flex items-center justify-between px-5 py-4 md:px-10">
          <Link href="/" className="font-display text-2xl tracking-[0.14em]">ATELIER ÉCRU</Link>
          <nav aria-label="Primary" className="eyebrow hidden gap-7 md:flex">
            <span>New collection</span>
            <span>Custom print</span>
            <Link href="/admin" className="hover:text-ink">Admin</Link>
          </nav>
        </div>
      </header>

      {fatal && <p role="alert" className="fixed inset-x-0 top-24 z-30 mx-auto w-fit bg-danger px-4 py-2 text-sm text-bone">{fatal}</p>}
      {notice && (
        <p role="status" className="panel fixed inset-x-0 top-24 z-30 mx-auto w-fit px-4 py-2 text-sm" data-testid="notice">
          {notice} <button className="ml-3 underline" onClick={() => setNotice(null)}>Dismiss</button>
        </p>
      )}

      {/* WebGL fallback: a plain, fully usable catalogue */}
      {gl === false && mode === 'collection' && (
        <section className="relative z-10 mx-auto max-w-4xl px-6 pt-36" data-testid="webgl-fallback">
          <p className="eyebrow">3D view unavailable on this device</p>
          <h1 className="font-display mt-2 text-4xl">The collection</h1>
          <p className="mt-2 text-sm text-graphite">Your browser could not start WebGL. You can still browse and design in 2D; the 3D preview will appear on a supported device.</p>
          <ul className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3">
            {products.map((p) => (
              <li key={p.id}>
                <button className="w-full border border-line bg-bone p-4 text-left" onClick={() => openProduct(p)}>
                  <span className="mb-3 block h-24" style={{ background: p.colors[0].hex }} />
                  <span className="font-display text-xl">{p.title}</span>
                  <span className="block text-sm text-mute">{money(p)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* collection caption + accessible index (keyboard alternative to pointing at the rail) */}
      {mode === 'collection' && gl !== false && (
        <>
          <nav className="fixed inset-x-0 top-[7.6rem] z-10 flex items-center justify-center gap-2 px-3 md:top-[6.6rem]" aria-label="Racks">
            <button className="chip hidden sm:inline-flex" onClick={() => stepRack(-1)} aria-label="Previous rack" data-testid="rack-prev">←</button>
            <div role="tablist" aria-label="Garment racks" className="flex max-w-full gap-1 overflow-x-auto [scrollbar-width:none]">
              {views.map((v) => (
                <button key={v} role="tab" aria-selected={rack === v} className="chip shrink-0 whitespace-nowrap" onClick={() => setRack(v)} data-testid={`rack-tab-${v}`}>
                  {v === 'all' ? 'All racks' : CATEGORY_INFO[v].plural}
                  <span className="ml-1.5 font-normal opacity-60">{v === 'all' ? products.length : products.filter((p) => p.garment === v).length}</span>
                </button>
              ))}
            </div>
            <button className="chip hidden sm:inline-flex" onClick={() => stepRack(1)} aria-label="Next rack" data-testid="rack-next">→</button>
          </nav>
          <section className="fixed inset-x-0 bottom-0 z-10 pb-6 text-center" aria-label="Collection">
            <p className="font-display min-h-9 text-3xl" aria-live="polite" data-testid="caption">{caption ? caption.title : 'Select a piece'}</p>
            <p className="mb-4 text-xs text-mute">{caption ? `${CATEGORY_INFO[caption.garment].label} · ${money(caption)} · ${caption.colors.length} colours` : rackProducts.length ? 'Hover a garment, or choose below' : 'Nothing on this rack yet'}</p>
            <ul className="mx-auto flex max-w-full flex-wrap justify-center gap-2 px-4" data-testid="rack-products">
              {rackProducts.map((p) => (
                <li key={p.id}>
                  <button
                    className="chip gap-2"
                    onMouseEnter={() => setHovered(p.id)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(p.id)}
                    onBlur={() => setHovered(null)}
                    onClick={() => openProduct(p)}
                    aria-label={`${p.title}, ${money(p)}`}
                    data-testid={`product-${p.sku}`}
                  >
                    <span className="inline-block h-3 w-3 rounded-full border border-line" style={{ background: p.colors[0].hex }} />
                    <span className="hidden sm:inline">{p.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {/* product detail */}
      {mode === 'detail' && selected && design && (
        <section className="panel fixed right-4 bottom-4 left-4 z-20 max-h-[56vh] overflow-y-auto p-5 md:top-28 md:max-h-[calc(100dvh-8.5rem)] md:right-8 md:bottom-auto md:left-auto md:w-[360px]" aria-label={`${selected.title} details`} data-testid="detail-panel">
          <button className="eyebrow mb-4 hover:text-ink" onClick={back}>← Back to collection</button>
          <p className="eyebrow" data-testid="detail-category">{CATEGORY_INFO[selected.garment].label} · {selected.sku}</p>
          <h1 className="font-display mt-1 text-4xl leading-none" data-testid="detail-title">{selected.title}</h1>
          <p className="mt-2 text-lg">{money(selected)}</p>
          <p className="mt-3 text-sm leading-relaxed text-graphite">{selected.description}</p>
          {isTemplate && <p className="mt-3 border-l-2 border-brass pl-2 text-[0.7rem] text-mute">Shown on our {CATEGORY_INFO[selected.garment].label.toLowerCase()} template model{selected.version.pathway === 'template-images' ? ' with the design’s front/back artwork' : ''}.</p>}
          <ColorSizePicker product={selected} />
          <ViewButtons side={side} setSide={setSide} resetView={resetView} />
          <button className="btn btn-primary mt-5 w-full" disabled={!customizable} onClick={customize} data-testid="customize-btn">
            Customise this piece
          </button>
          {!customizable && <p className="mt-2 text-xs text-mute">Customisation is not available for this model yet (no verified print profile).</p>}
        </section>
      )}

      {/* customisation editor */}
      {mode === 'customize' && selected && design && (
        <aside className={`panel fixed z-20 overflow-y-auto p-5 ${mobile ? 'inset-x-0 top-[44vh] bottom-0' : 'top-0 bottom-0 left-0 w-[min(460px,40vw)] pt-6'}`} aria-label="Design editor">
          <button className="eyebrow mb-3 hover:text-ink" onClick={back}>← Done editing</button>
          <h1 className="font-display text-3xl leading-none">{selected.title}</h1>
          <p className="mb-4 text-xs text-mute">{money(selected)} · printed front &amp; back on request</p>
          <ColorSizePicker product={selected} compact />
          <div className="mt-4">
            <DesignEditor product={selected} onSave={save} saving={saving} savedUrl={savedUrl} saveError={saveError} />
          </div>
        </aside>
      )}
      {mode === 'customize' && (
        <div className={`fixed z-20 ${mobile ? 'top-[calc(44vh-3.5rem)] right-3' : 'right-6 bottom-6'}`}>
          <ViewButtons side={side} setSide={(s) => { setSide(s); useDesign.getState().setZone(s); }} resetView={resetView} />
        </div>
      )}
    </main>
  );
}

function ViewButtons({ side, setSide, resetView }: { side: 'front' | 'back'; setSide: (s: 'front' | 'back') => void; resetView: () => void }) {
  return (
    <div className="mt-4 flex gap-1" role="group" aria-label="3D view">
      <button className="chip" aria-pressed={side === 'front'} onClick={() => setSide('front')} data-testid="view-front">Front</button>
      <button className="chip" aria-pressed={side === 'back'} onClick={() => setSide('back')} data-testid="view-back">Back</button>
      <button className="chip" onClick={resetView} data-testid="view-reset">Reset view</button>
    </div>
  );
}

function ColorSizePicker({ product, compact }: { product: PublicProduct; compact?: boolean }) {
  const design = useDesign((s) => s.design);
  if (!design) return null;
  const stock = product.stock?.[design.size];
  return (
    <div className={compact ? 'space-y-3' : 'mt-5 space-y-4'}>
      <div>
        <p className="eyebrow mb-2">Colour · <span className="text-ink normal-case tracking-normal">{design.color.name}</span></p>
        <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-2">
          {product.colors.map((c) => (
            <button
              key={c.hex}
              role="radio"
              aria-checked={design.color.hex === c.hex}
              aria-label={c.name}
              onClick={() => useDesign.getState().setColor(c)}
              className={`h-8 w-8 rounded-full border-2 ${design.color.hex === c.hex ? 'border-ink' : 'border-line'}`}
              style={{ background: c.hex }}
              data-testid={`color-${c.name}`}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="eyebrow mb-2">Size</p>
        <div role="radiogroup" aria-label="Size" className="flex flex-wrap gap-1">
          {product.sizes.map((s) => (
            <button key={s} role="radio" aria-checked={design.size === s} className="chip" onClick={() => useDesign.getState().setSize(s)} disabled={product.stock?.[s] === 0}>
              {s}
            </button>
          ))}
        </div>
        {stock !== undefined && <p className="mt-1 text-xs text-mute">{stock === 0 ? 'Sold out in this size' : stock < 6 ? `Only ${stock} left` : 'In stock'}</p>}
      </div>
    </div>
  );
}
