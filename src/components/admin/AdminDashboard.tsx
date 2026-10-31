'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CATEGORY_INFO, classifyProduct } from '@/lib/garments';
import { BOTTLE_STYLES, BOTTLES, CAP_FINISHES, CONCENTRATIONS, DEFAULT_PERFUME, LIQUID_PRESETS } from '@/lib/perfume';
import { isCustomizable } from '@/lib/printZones';
import { TEMPLATE_ZONES } from '@/lib/template';
import type { CapFinish, ImageLayer, Layer, PerfumeSpec, PrintZone, Product, ProductColor, ProductVersion, ZoneId } from '@/lib/types';
import { CATEGORY_CARDS, CategoryCards, PhotoManager, PhotoPicker, type Cat, type PendingPhotos } from './ProductMedia';

const AdminPreview = dynamic(() => import('./AdminPreview').then((m) => m.AdminPreview), { ssr: false });
const PerfumePreview = dynamic(() => import('./PerfumePreview'), { ssr: false });

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
type Msg = { kind: 'ok' | 'error'; text: string; href?: string } | null;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok && !(body as { version?: unknown }).version) throw new Error(((body as { errors?: string[] }).errors ?? [`Request failed (${res.status})`]).join(' '));
  return body as T;
}
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export function AdminDashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, setPending] = useState<PendingPhotos>({ photos: [] });

  const reload = useCallback(async () => {
    const { products } = await api<{ products: Product[] }>('/api/admin/products');
    setProducts(products);
  }, []);
  useEffect(() => {
    let alive = true;
    api<{ products: Product[] }>('/api/admin/products').then((r) => alive && setProducts(r.products));
    return () => {
      alive = false;
    };
  }, []);

  const selected = products.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="grid gap-6 p-6 lg:grid-cols-[300px_1fr]">
      <aside>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="eyebrow">Products ({products.length})</h2>
          <button
            className="text-xs underline"
            onClick={async () => {
              await fetch('/api/admin/logout', { method: 'POST' });
              window.location.reload();
            }}
          >
            Sign out
          </button>
        </div>
        <button className="btn btn-primary mb-3 w-full" onClick={() => { setCreating(true); setSelectedId(null); }} data-testid="new-product">+ New product</button>
        <div className="space-y-4" data-testid="admin-product-list">
          {CATEGORY_CARDS.map((c) => {
            const list = products.filter((p) => (p.kind === 'perfume' ? 'perfume' : p.garment) === c.id);
            if (!list.length) return null;
            return (
              <section key={c.id} aria-label={c.label}>
                <h3 className="mb-1 text-[0.68rem] tracking-[0.2em] text-mute uppercase">{c.id === 'perfume' ? 'Perfumes' : CATEGORY_INFO[c.id].plural} · {list.length}</h3>
                <ul className="space-y-1">
                  {list.map((p) => {
                    const live = p.versions.find((v) => v.id === p.liveVersionId);
                    const state = live ? (p.active ? 'Live' : 'Hidden') : 'Not published';
                    return (
                      <li key={p.id}>
                        <button className={`flex w-full items-center gap-2 border px-3 py-2 text-left text-sm ${p.id === selectedId ? 'border-ink bg-bone' : 'border-line'}`} onClick={() => { setSelectedId(p.id); setCreating(false); setMsg(null); }}>
                          <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${live && p.active ? 'bg-ok' : 'bg-line'}`} />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{p.title}</span>
                            <span className="text-xs text-mute">{p.sku} · {state}{p.kind === 'perfume' ? ` · ${p.photos?.length ?? 0} photo(s)` : ''}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </aside>
      <section>
        {msg && <p role={msg.kind === 'error' ? 'alert' : 'status'} className={`mb-4 border px-3 py-2 text-sm ${msg.kind === 'error' ? 'border-danger text-danger' : 'border-ok text-ok'}`} data-testid="admin-msg">{msg.text}{msg.href && <> · <a className="font-semibold underline" href={msg.href} target="_blank" rel="noreferrer" data-testid="admin-msg-link">View in store ↗</a></>}</p>}
        {creating && (
          <ProductForm
            pending={pending}
            setPending={setPending}
            onSubmit={async ({ liquidIsDefault, ...data }) => {
              let product: Product;
              try {
                ({ product } = await api<{ product: Product }>('/api/admin/products', json('POST', data)));
              } catch (e) {
                setMsg({ kind: 'error', text: (e as Error).message });
                return;
              }
              // the product exists now: upload what was picked in step 2 straight away
              const notes: string[] = [];
              let failed = false;
              try {
                if (product.kind === 'perfume' && pending.photos.length) {
                  const fd = new FormData();
                  for (const p of pending.photos) {
                    fd.append('photo', p.file);
                    fd.append('view', p.view);
                  }
                  const r = await api<{ errors: string[]; notes: string[]; suggestedLiquid?: string }>(`/api/admin/products/${product.id}/photos`, { method: 'POST', body: fd });
                  notes.push(...r.errors, ...r.notes);
                  if (liquidIsDefault && r.suggestedLiquid && product.perfume)
                    await api(`/api/admin/products/${product.id}`, json('PATCH', { perfume: { ...product.perfume, liquid: r.suggestedLiquid } }));
                } else if (product.kind !== 'perfume' && (pending.front || pending.back)) {
                  const fd = new FormData();
                  if (pending.front) fd.append('front', pending.front);
                  if (pending.back) fd.append('back', pending.back);
                  await api(`/api/admin/products/${product.id}/images`, { method: 'POST', body: fd });
                }
              } catch (e) {
                failed = true;
                notes.push(`Photos were not saved: ${(e as Error).message} You can add them again below.`);
              }
              await reload();
              setPending({ photos: [] });
              setCreating(false);
              setSelectedId(product.id);
              const where = product.kind === 'perfume' ? 'the perfume salon' : `the ${CATEGORY_INFO[product.garment].plural} rack`;
              const had = product.kind === 'perfume' ? pending.photos.length > 0 : !!(pending.front || pending.back);
              setMsg({
                kind: failed ? 'error' : 'ok',
                text: `Created ${product.title} for ${where}. ${had && !failed ? 'Photos uploaded. ' : ''}Next: check the preview and press Publish.${notes.length ? ' ' + notes.join(' ') : ''}`,
              });
            }}
          />
        )}
        {selected && <ProductEditor key={selected.id} product={selected} reload={reload} setMsg={setMsg} />}
        {!creating && !selected && <p className="text-sm text-mute">Select a product or create a new one.</p>}
      </section>
    </div>
  );
}

const catLabel = (c: Cat) => (c === 'perfume' ? 'Perfume' : CATEGORY_INFO[c].label);

/** Suggested SKU from the category and the first words of the title (editable). */
function suggestSku(cat: Cat | null, title: string) {
  const prefix = cat === 'perfume' ? 'PF' : cat === 'hoodie' ? 'HD' : cat === 'oversized' ? 'OV' : cat === 'full-sleeve' ? 'LS' : 'TS';
  const words = title.toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && !['EAU', 'DE', 'THE', 'AND', 'TEE', 'T', 'SHIRT', 'PARFUM', 'PERFUME'].includes(w)).slice(0, 2);
  return words.length ? `${prefix}-${words.map((w) => w.slice(0, 6)).join('-')}` : '';
}

export interface ProductFormData extends Record<string, unknown> {
  /** client-only: the liquid colour was not chosen by hand, so a photo may suggest it */
  liquidIsDefault?: boolean;
}

function ProductForm({
  initial,
  onSubmit,
  onGarmentChange,
  pending,
  setPending,
}: {
  initial?: Product;
  onSubmit: (d: ProductFormData) => Promise<unknown>;
  onGarmentChange?: (g: Cat) => Promise<unknown>;
  pending?: PendingPhotos;
  setPending?: (p: PendingPhotos) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [sku, setSku] = useState(initial?.sku ?? '');
  const [skuTouched, setSkuTouched] = useState(!!initial);
  const [description, setDescription] = useState(initial?.description ?? '');
  const initialCat: Cat | '' = initial ? (initial.kind === 'perfume' ? 'perfume' : initial.garment) : '';
  // '' = follow the automatic suggestion; otherwise an explicit admin choice
  const [cat, setCat] = useState<Cat | ''>(initialCat);
  const [price, setPrice] = useState(String(initial?.price ?? ''));
  // until the admin picks a currency, it follows the category (perfumes are priced in QAR)
  const [chosenCurrency, setCurrency] = useState<string | null>(initial?.currency ?? null);
  const [sizes, setSizes] = useState<string[]>(initial?.sizes?.length ? initial.sizes : ['S', 'M', 'L', 'XL']);
  const [colors, setColors] = useState<ProductColor[]>(initial?.colors ?? [{ name: 'Chalk', hex: '#ece8df' }]);
  const [perfume, setPerfumeState] = useState<PerfumeSpec>(initial?.perfume ?? DEFAULT_PERFUME);
  const [liquidTouched, setLiquidTouched] = useState(!!initial);
  const [busy, setBusy] = useState(false);
  const suggested = classifyProduct(title);
  const effective = cat || suggested;
  const isPerfume = effective === 'perfume';
  const currency = chosenCurrency ?? (isPerfume ? 'QAR' : 'USD');
  const shownSku = skuTouched ? sku : suggestSku(effective, title);
  const setPerfume = (s: PerfumeSpec) => {
    if (s.liquid !== perfume.liquid) setLiquidTouched(true);
    setPerfumeState(s);
  };
  const pick = (c: Cat) => {
    setCat(c);
    // existing products: the rack / salon changes immediately (no hidden unsaved state)
    if (onGarmentChange && initial && c !== initialCat) void onGarmentChange(c);
  };
  return (
    <form
      className="space-y-5 border border-line bg-bone p-5"
      data-testid="product-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!effective) return;
        setBusy(true);
        const base = { title, sku: shownSku, description, price: Number(price), currency, garment: effective };
        await onSubmit(isPerfume ? { ...base, perfume, liquidIsDefault: !liquidTouched } : { ...base, sizes, colors });
        setBusy(false);
      }}
    >
      <h2 className="font-display text-2xl">{initial ? 'Product details' : 'New product'}</h2>
      <section>
        <h3 className="mb-2 text-sm font-semibold">{initial ? 'Category' : '1 · What are you adding?'}</h3>
        <CategoryCards value={cat} suggested={suggested} onPick={pick} />
        <p className="mt-2 text-xs text-mute" data-testid="garment-hint">
          {cat
            ? <>Selected: {catLabel(cat)}.{suggested && suggested !== cat ? ` (The name suggests ${catLabel(suggested)}.)` : ''}{!initial && <> <button type="button" className="underline" onClick={() => setCat('')}>Use automatic</button></>}</>
            : suggested
              ? `Automatic: ${catLabel(suggested)}, detected from the name. Click another card to change it.`
              : 'Choose a card, or type the name below and it will be detected.'}
        </p>
      </section>
      {!initial && pending && setPending && effective && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">2 · Photos {isPerfume ? '(the bottle as customers will see it)' : '(front and back)'}</h3>
          <PhotoPicker isPerfume={isPerfume} value={pending} onChange={setPending} />
        </section>
      )}
      <section className="space-y-3">
        {!initial && <h3 className="text-sm font-semibold">3 · Details</h3>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs">Name<input className="field mt-1" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder={isPerfume ? 'e.g. Rose Royale Eau de Parfum' : 'e.g. Embrace Oversized Tee'} data-testid="pf-title" /></label>
          <label className="text-xs">SKU<input className="field mt-1" value={shownSku} onChange={(e) => { setSkuTouched(true); setSku(e.target.value); }} required data-testid="pf-sku" /></label>
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <label className="text-xs">Price<input className="field mt-1" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required data-testid="pf-price" /></label>
            <label className="text-xs">Currency
              <select className="field mt-1" value={currency} onChange={(e) => setCurrency(e.target.value)} data-testid="pf-currency">
                <option value="USD">USD</option>
                <option value="QAR">QAR</option>
              </select>
            </label>
          </div>
        </div>
        <label className="block text-xs">Description<textarea className="field mt-1" rows={2} maxLength={600} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        {isPerfume ? (
          <PerfumeFields spec={perfume} onChange={setPerfume} liquidHint={!initial && !liquidTouched && !!pending?.photos.length ? 'Will be taken from your photo — or pick one.' : undefined} />
        ) : (
          <>
            <fieldset>
              <legend className="text-xs">Sizes</legend>
              <div className="mt-1 flex gap-1">
                {SIZES.map((s) => (
                  <button type="button" key={s} className="chip" aria-pressed={sizes.includes(s)} onClick={() => setSizes((v) => (v.includes(s) ? v.filter((x) => x !== s) : [...v, s]))}>{s}</button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-xs">Base colours {!initial && pending?.front ? <span className="text-mute">(a product photo sets the first colour automatically)</span> : null}</legend>
              {colors.map((c, i) => (
                <div key={i} className="mt-1 flex gap-2">
                  <input className="field" value={c.name} onChange={(e) => setColors((cs) => cs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label="Colour name" />
                  <input type="color" className="field w-16 p-1" value={c.hex} onChange={(e) => setColors((cs) => cs.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)))} aria-label="Colour value" />
                  <button type="button" className="chip" onClick={() => setColors((cs) => cs.filter((_, j) => j !== i))} disabled={colors.length === 1} aria-label="Remove colour">✕</button>
                </div>
              ))}
              <button type="button" className="mt-2 text-xs underline" onClick={() => setColors((cs) => [...cs, { name: 'New colour', hex: '#888888' }])}>+ Add colour</button>
            </fieldset>
          </>
        )}
      </section>
      <button className="btn btn-primary" disabled={busy || !effective} data-testid="pf-submit">
        {busy ? (initial ? 'Saving…' : 'Creating and uploading…') : initial ? 'Save details' : `Create ${effective ? catLabel(effective).toLowerCase() : 'product'}`}
      </button>
    </form>
  );
}

/** Perfume presentation: bottle, juice colour, cap, volume, concentration and notes. */
function PerfumeFields({ spec, onChange, liquidHint }: { spec: PerfumeSpec; onChange: (s: PerfumeSpec) => void; liquidHint?: string }) {
  const set = (patch: Partial<PerfumeSpec>) => onChange({ ...spec, ...patch });
  const notes = (k: 'top' | 'heart' | 'base') => (
    <label className="text-xs capitalize">{k} notes
      <input className="field mt-1" value={spec.notes[k].join(', ')} onChange={(e) => set({ notes: { ...spec.notes, [k]: e.target.value.split(',').map((s) => s.trimStart()) } })} placeholder="Comma separated" data-testid={`pf-notes-${k}`} />
    </label>
  );
  return (
    <fieldset className="space-y-3 border border-line p-3" data-testid="perfume-fields">
      <legend className="px-1 text-xs">Perfume</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs">Volume (ml)<input className="field mt-1" type="number" min={5} max={500} value={spec.volumeMl} onChange={(e) => set({ volumeMl: Number(e.target.value) })} data-testid="pf-volume" /></label>
        <label className="text-xs">Concentration
          <select className="field mt-1" value={spec.concentration} onChange={(e) => set({ concentration: e.target.value })}>
            {CONCENTRATIONS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="text-xs">Family<input className="field mt-1" value={spec.family} onChange={(e) => set({ family: e.target.value })} placeholder="e.g. Oriental · Woody" /></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">{notes('top')}{notes('heart')}{notes('base')}</div>
      <details className="text-xs" open={!liquidHint}>
        <summary className="cursor-pointer font-semibold">3D bottle (used when there are no photos, and as the label colours)</summary>
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Bottle">
            {BOTTLE_STYLES.map((b) => (
              <button type="button" key={b} role="radio" aria-checked={spec.bottle === b} className="chip" onClick={() => set({ bottle: b })} data-testid={`pf-bottle-${b}`}>
                {BOTTLES[b].label} <span className="ml-1 font-normal opacity-60">{BOTTLES[b].blurb}</span>
              </button>
            ))}
          </div>
          <div>
            <p>Liquid colour {liquidHint && <span className="text-brass">— {liquidHint}</span>}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Liquid colour">
              {LIQUID_PRESETS.map((l) => (
                <button type="button" key={l.hex} role="radio" aria-checked={spec.liquid === l.hex} aria-label={l.name} title={l.name} onClick={() => set({ liquid: l.hex })} className={`h-8 w-8 rounded-full border-2 ${spec.liquid === l.hex ? 'border-ink' : 'border-line'}`} style={{ background: l.hex }} />
              ))}
              <input type="color" className="h-8 w-10 cursor-pointer border border-line bg-transparent p-0" value={spec.liquid} onChange={(e) => set({ liquid: e.target.value })} aria-label="Custom liquid colour" />
            </div>
          </div>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Cap finish">
            {(Object.keys(CAP_FINISHES) as CapFinish[]).map((c) => (
              <button type="button" key={c} role="radio" aria-checked={spec.cap === c} className="chip gap-2" onClick={() => set({ cap: c })} data-testid={`pf-cap-${c}`}>
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: CAP_FINISHES[c].color }} />
                {CAP_FINISHES[c].label}
              </button>
            ))}
          </div>
        </div>
      </details>
    </fieldset>
  );
}

function ProductEditor({ product, reload, setMsg }: { product: Product; reload: () => Promise<void>; setMsg: (m: Msg) => void }) {
  const [uploading, setUploading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  // follows the server; only holds an optimistic value while a toggle request is in flight
  const [pendingActive, setPendingActive] = useState<boolean | null>(null);
  const active = pendingActive ?? product.active;
  const [versionId, setVersionId] = useState<string | null>(product.versions.at(-1)?.id ?? null);
  const version = product.versions.find((v) => v.id === versionId) ?? null;
  const live = product.versions.find((v) => v.id === product.liveVersionId);
  const isPerfume = product.kind === 'perfume';
  const rack = isPerfume ? 'perfume salon' : `${CATEGORY_INFO[product.garment].plural} rack`;

  const run = async (fn: () => Promise<unknown>, ok: string, href?: string) => {
    try {
      await fn();
      await reload();
      setMsg({ kind: 'ok', text: ok, href });
      return true;
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
      return false;
    }
  };

  const uploadGlb = async (file: File) => {
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch(`/api/admin/products/${product.id}/model`, { method: 'POST', body: fd });
      const body = await res.json();
      await reload();
      if (body.version) {
        setVersionId(body.version.id);
        setMsg(body.version.status === 'failed'
          ? { kind: 'error', text: 'The GLB failed validation. The live product was not changed. See the errors below.' }
          : { kind: 'ok', text: 'GLB validated and web derivative created. Define the print profile, verify the mapping test, then publish.' });
      } else setMsg({ kind: 'error', text: (body.errors ?? ['Upload failed']).join(' ') });
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-3xl">{product.title}</h2>
        {live && product.active ? (
          <span className="border border-ok px-2 py-1 text-xs text-ok" data-testid="live-status">
            Live on the {rack} · <a className="underline" href={isPerfume ? `/perfumes?p=${product.id}` : `/?product=${product.id}`} target="_blank" rel="noreferrer">View in store ↗</a>
          </span>
        ) : (
          <span className="border border-line px-2 py-1 text-xs text-mute" data-testid="live-status">Not in the store yet — follow the steps below</span>
        )}
        {product.liveVersionId && (
          <>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => {
                  const next = e.target.checked;
                  setPendingActive(next);
                  void run(() => api(`/api/admin/products/${product.id}`, json('PATCH', { active: next })), next ? 'Product activated.' : 'Product hidden from the store.').finally(() => setPendingActive(null));
                }}
                data-testid="active-toggle"
              />
              Visible in store
            </label>
            <button className="btn btn-ghost" onClick={() => run(() => api(`/api/admin/products/${product.id}/publish`, json('POST', { versionId: null })), 'Unpublished: removed from the store.')} data-testid="unpublish">Unpublish</button>
          </>
        )}
      </div>

      {isPerfume ? (
        <ol className="grid gap-2 text-xs sm:grid-cols-3" aria-label="Steps">
          <li className="border border-line bg-bone p-3"><strong>1 · Photos</strong><br />Upload the bottle photos. On a plain light background the bottle is cut out automatically.</li>
          <li className="border border-line bg-bone p-3"><strong>2 · Check &amp; publish</strong><br />See it on its plinth in the salon preview, then publish.</li>
          <li className="border border-line bg-bone p-3"><strong>3 · Details</strong><br />Name, price, volume, notes; the 3D bottle used when there are no photos.</li>
        </ol>
      ) : (
      <ol className="grid gap-2 text-xs sm:grid-cols-3" aria-label="Steps">
        <li className="border border-line bg-bone p-3"><strong>1 · Front &amp; back images</strong><br />Product photos (garment on a plain background) or print artwork (PNG with transparency).</li>
        <li className="border border-line bg-bone p-3"><strong>2 · Check &amp; publish</strong><br />Check the 3D preview, adjust if needed, tick the box and press Publish.</li>
        <li className="border border-line bg-bone p-3"><strong>3 · Details</strong><br />Name, price, sizes, colours and category (= which rack it hangs on).</li>
      </ol>
      )}


      {isPerfume ? (
        <>
          <PhotoManager product={product} reload={reload} onChanged={async (m) => { await reload(); setMsg(m); }} />
          <PerfumePanel product={product} run={run} />
        </>
      ) : (
        <>
      <section className="border border-line bg-bone p-5">
        <h3 className="font-display text-2xl">1 · Front &amp; back images</h3>
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setPreparing(true);
            void run(async () => {
              const res = await fetch(`/api/admin/products/${product.id}/images`, { method: 'POST', body: fd });
              const body = await res.json();
              if (!res.ok) throw new Error((body.errors ?? ['Upload failed']).join(' '));
              setVersionId(body.version.id);
            }, 'Images prepared. Check the 3D preview below, then publish.').finally(() => setPreparing(false));
          }}
        >
          <p className="text-xs text-mute">
            <strong>Product photo</strong> (a garment on a plain background): the fabric colour is detected and only the printed graphic is cut out and placed where it sits on the garment; a plain side stays plain.
            {' '}<strong>Print artwork</strong> (PNG/SVG with a transparent background): used as it is.
            {' '}It is shown on the <strong>{CATEGORY_INFO[product.garment].label.toLowerCase()}</strong> 3D template — change the garment type above if that is wrong.
          </p>
          {live && <p className="text-xs text-brass" data-testid="replace-warning">This product is already live. Publishing new images will replace its current design.</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block border border-dashed border-line p-3 text-xs">Front image<input name="front" type="file" accept="image/png,image/jpeg,image/svg+xml" className="mt-1 block text-xs" data-testid="img-front" /></label>
            <label className="block border border-dashed border-line p-3 text-xs">Back image<input name="back" type="file" accept="image/png,image/jpeg,image/svg+xml" className="mt-1 block text-xs" data-testid="img-back" /></label>
          </div>
          <button className="btn btn-primary" disabled={preparing} data-testid="img-submit">{preparing ? 'Preparing…' : 'Upload & prepare'}</button>
        </form>
        <details className="mt-5 text-xs">
          <summary className="cursor-pointer text-mute">Advanced: upload a 3D model (GLB) instead</summary>
          <p className="mt-2 text-mute">Binary glTF 2.0 with embedded textures and a UV map, max 60 MB. Needs a print profile and a mapping test before customers can customise it.</p>
          <input type="file" accept=".glb,model/gltf-binary" className="mt-2 text-xs" disabled={uploading} onChange={(e) => e.target.files?.[0] && uploadGlb(e.target.files[0])} data-testid="glb-input" />
          {uploading && <p className="mt-1" role="status">Validating and optimising…</p>}
        </details>
      </section>

      {product.versions.length > 1 && (
        <section>
          <h3 className="eyebrow mb-2">Versions</h3>
          <div className="flex flex-wrap gap-1">
            {product.versions.map((v, i) => (
              <button key={v.id} className="chip" aria-pressed={v.id === versionId} onClick={() => setVersionId(v.id)}>
                #{i + 1} {v.pathway === 'glb' ? (v.modelConfig.source === 'template' ? 'Template' : 'GLB') : 'Images'} · {v.id === product.liveVersionId ? 'live' : v.status}
              </button>
            ))}
          </div>
        </section>
      )}
      {version && <VersionPanel key={version.id} product={product} version={version} run={run} />}
        </>
      )}

      <ProductForm
        initial={product}
        onSubmit={(d) => run(() => api(`/api/admin/products/${product.id}`, json('PATCH', d)), 'Details saved.')}
        onGarmentChange={(g) =>
          run(
            () => api(`/api/admin/products/${product.id}`, json('PATCH', { garment: g })),
            g === 'perfume' ? 'Moved to the perfume salon. Fill in the perfume details and save.' : `Moved to the ${CATEGORY_INFO[g].plural} rack. Image-based designs now use the ${CATEGORY_INFO[g].label.toLowerCase()} template.`,
          )
        }
      />
    </div>
  );
}

const ISSUE_STYLE = { error: 'text-danger', warning: 'text-brass', info: 'text-graphite' } as const;

function VersionPanel({ product, version, run }: { product: Product; version: ProductVersion; run: (fn: () => Promise<unknown>, ok: string, href?: string) => Promise<boolean> }) {
  const cfg = version.modelConfig;
  const [printable, setPrintable] = useState<string[]>(cfg.printableMeshes);
  const [colorable, setColorable] = useState<string[]>(cfg.colorableMaterials);
  const [zones, setZones] = useState<PrintZone[]>(cfg.printZones);
  const [verified, setVerified] = useState(false);
  // image-based versions: placement edited locally and previewed live; saved when publishing
  const [layers, setLayers] = useState<Partial<Record<ZoneId, Layer[]>>>(version.baseLayers ?? {});
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const capture = useRef<(() => string) | null>(null);
  const report = version.report;
  const base = `/api/admin/products/${product.id}/versions/${version.id}`;
  const errors = version.issues.filter((i) => i.level === 'error');
  const isImages = version.pathway === 'template-images';
  const isLive = version.id === product.liveVersionId;
  const rack = CATEGORY_INFO[product.garment].plural;
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const setZone = (id: ZoneId, patch: Partial<PrintZone> | null) =>
    setZones((zs) => {
      if (patch === null) return zs.filter((z) => z.id !== id);
      const existing = zs.find((z) => z.id === id) ?? { ...TEMPLATE_ZONES.find((t) => t.id === id)!, uvRect: { u0: 0.1, v0: 0.1, u1: 0.4, v1: 0.5 } };
      return [...zs.filter((z) => z.id !== id), { ...existing, ...patch }].sort((a, b) => a.id.localeCompare(b.id)).reverse();
    });
  const issues = version.issues.filter((i) => !(isImages && i.code === 'artwork_unapproved'));

  /** One action for image versions: save placement → approve → publish → visible. */
  const publishImages = async () => {
    setBusy(true);
    await run(
      async () => {
        await api(base, json('PATCH', { baseLayers: layers }));
        await api(base, json('PATCH', { artworkApproved: true }));
        await api(`/api/admin/products/${product.id}/publish`, json('POST', { versionId: version.id }));
      },
      `Published: ${product.title} is now live on the ${rack} rack.`,
      `/?product=${product.id}`,
    );
    setBusy(false);
  };

  return (
    <section className="grid gap-6 border border-line bg-bone p-5 xl:grid-cols-[1fr_420px]" data-testid="version-panel">
      <div className="space-y-5">
        <div>
          <h3 className="font-display text-2xl">{isImages ? '2 · Check & publish' : 'Model version'}</h3>
          <p className="mt-1 text-sm">
            Status: <strong data-testid="version-status">{isLive ? 'live' : version.status}</strong>
            {version.derivativeBytes ? ` · derivative ${(version.derivativeBytes / 1048576).toFixed(2)} MB` : ''}
            {report ? ` · original ${(report.bytes / 1048576).toFixed(2)} MB, ${report.triangles.toLocaleString()} triangles` : ''}
          </p>
          {!isImages && <p className="mt-1 text-sm">Customisation: {isCustomizable(cfg) ? <span className="text-ok">enabled (verified profile)</span> : <span className="text-mute">disabled until a print profile is defined and the mapping test is confirmed</span>}</p>}
        </div>
        {isImages && <DetectedArtwork version={version} product={product} />}
        <ul className="space-y-1 text-sm" data-testid="version-issues">
          {issues.map((i, n) => (
            <li key={n} className={ISSUE_STYLE[i.level]} data-code={i.code}>
              {i.level === 'error' ? '✕ ' : i.level === 'warning' ? '! ' : '· '}
              {i.message}
            </li>
          ))}
        </ul>
        {report && (
          <details className="text-xs">
            <summary className="cursor-pointer font-semibold">Model inspection</summary>
            <table className="mt-2 w-full text-left">
              <thead><tr><th>Mesh</th><th>Triangles</th><th>UV</th><th>Material</th><th>Printable</th></tr></thead>
              <tbody>
                {report.meshes.map((m) => (
                  <tr key={m.name} className="border-t border-line">
                    <td>{m.name}</td><td>{m.triangles.toLocaleString()}</td><td>{m.hasUv ? 'yes' : 'no'}</td><td>{m.material ?? '—'}</td>
                    <td><input type="checkbox" disabled={!m.hasUv} checked={printable.includes(m.name)} onChange={() => setPrintable((p) => toggle(p, m.name))} aria-label={`Print on ${m.name}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2">Textures: {report.textures.map((t) => `${t.width}×${t.height} ${t.mimeType}`).join(', ') || 'none'}</p>
            <p className="mt-2">Colourable materials:</p>
            <div className="flex flex-wrap gap-2">
              {report.materials.map((m) => (
                <label key={m} className="flex items-center gap-1"><input type="checkbox" checked={colorable.includes(m)} onChange={() => setColorable((c) => toggle(c, m))} />{m || '(unnamed)'}</label>
              ))}
            </div>
          </details>
        )}
        {version.pathway === 'glb' && report && (
          <fieldset className="space-y-2 text-xs">
            <legend className="text-sm font-semibold">Print zones (UV0 space, v up; front u grows to the viewer’s right)</legend>
            {(['front', 'back'] as ZoneId[]).map((id) => {
              const z = zones.find((x) => x.id === id);
              return (
                <div key={id} className="flex flex-wrap items-center gap-2">
                  <label className="flex w-20 items-center gap-1"><input type="checkbox" checked={!!z} onChange={(e) => setZone(id, e.target.checked ? {} : null)} />{id}</label>
                  {z && (['u0', 'v0', 'u1', 'v1'] as const).map((k) => (
                    <label key={k}>{k}<input className="field ml-1 w-20" type="number" step="0.001" min={0} max={1} value={z.uvRect[k]} onChange={(e) => setZone(id, { uvRect: { ...z.uvRect, [k]: Number(e.target.value) } })} /></label>
                  ))}
                  {z && (
                    <>
                      <label>W cm<input className="field ml-1 w-16" type="number" value={z.widthCm} onChange={(e) => setZone(id, { widthCm: Number(e.target.value) })} /></label>
                      <label>H cm<input className="field ml-1 w-16" type="number" value={z.heightCm} onChange={(e) => setZone(id, { heightCm: Number(e.target.value) })} /></label>
                    </>
                  )}
                </div>
              );
            })}
            <button type="button" className="btn btn-ghost" onClick={() => run(() => api(base, json('PATCH', { printableMeshes: printable, colorableMaterials: colorable, printZones: zones })), 'Print profile saved and re-validated against the model.')} data-testid="save-profile">Save print profile</button>
          </fieldset>
        )}
        {!isImages && cfg.printZones.length > 0 && !cfg.mappingVerified && (
          <div className="space-y-2 border-t border-line pt-3 text-xs">
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} data-testid="mapping-check" />
              In the preview, red “FRONT LEFT” reads correctly on the wearer’s right chest (viewer’s left) of the front, green “BACK CENTER” reads correctly on the back, and “↑ TOP” points up. Nothing is mirrored, rotated or stretched.
            </label>
            <button className="btn btn-ghost" disabled={!verified} onClick={() => run(() => api(base, json('PATCH', { mappingVerified: true })), 'Mapping confirmed: customisation is enabled for this version.')} data-testid="confirm-mapping">Confirm mapping test</button>
          </div>
        )}
        {isImages && <PlacementControls layers={layers} onChange={setLayers} onReset={() => setLayers(version.baseLayers ?? {})} />}
        <div className="space-y-3 border-t border-line pt-3">
          {isImages && !isLive && (
            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} data-testid="approve-check" />
              I checked the front and back in the 3D preview: the print is the right way up, not mirrored, correctly sized and placed.
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            {isImages ? (
              <button className="btn btn-primary" disabled={busy || isLive || errors.length > 0 || !checked} onClick={publishImages} data-testid="publish">
                {isLive ? `Live on the ${rack} rack` : busy ? 'Publishing…' : `Publish to the ${rack} rack`}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                disabled={errors.length > 0 || isLive}
                onClick={() => run(() => api(`/api/admin/products/${product.id}/publish`, json('POST', { versionId: version.id })), `Published: live on the ${rack} rack.`, `/?product=${product.id}`)}
                data-testid="publish"
              >
                {isLive ? 'Live' : `Publish to the ${rack} rack`}
              </button>
            )}
            <button
              className="btn btn-ghost"
              onClick={() =>
                run(async () => {
                  const dataUrl = capture.current?.();
                  if (!dataUrl) throw new Error('Preview is not ready yet.');
                  await api(`${base}/preview`, json('POST', { dataUrl }));
                }, 'Preview image saved.')
              }
              data-testid="save-preview"
            >
              Save preview image
            </button>
            {/* dynamic, auth-scoped API image; next/image optimisation does not apply */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {version.previewUrl && <img src={version.previewUrl} alt="Saved preview" className="h-20 border border-line" />}
          </div>
        </div>
      </div>
      <div>
        {(version.status !== 'failed' || version.derivativeBytes) && (isImages || version.derivativeBytes) ? (
          <AdminPreview
            config={{ ...cfg, printableMeshes: printable.length ? printable : cfg.printableMeshes, printZones: zones.length ? zones : cfg.printZones }}
            colorHex={product.colors[0]?.hex}
            baseArtwork={version.baseArtwork}
            baseLayers={isImages ? layers : version.baseLayers}
            showTest={version.pathway === 'glb' && (zones.length > 0 || cfg.printZones.length > 0)}
            onCapture={(fn) => (capture.current = fn)}
          />
        ) : (
          <p className="text-sm text-mute">No preview: this upload did not pass validation.</p>
        )}
        {isImages && <p className="mt-2 text-xs text-mute">Live 3D preview on the {CATEGORY_INFO[product.garment].label.toLowerCase()} template in {product.colors[0]?.name ?? 'the base colour'}. Drag to rotate.</p>}
      </div>
    </section>
  );
}

/** Shows what the server made of the uploads: original photo → extracted print, plus the detected colour. */
function DetectedArtwork({ version, product }: { version: ProductVersion; product: Product }) {
  const checker = 'repeating-conic-gradient(#d9d2c5 0% 25%, #f3efe8 0% 50%) 50% / 14px 14px';
  return (
    <div className="grid gap-3 sm:grid-cols-2" data-testid="detected-artwork">
      {(['front', 'back'] as ZoneId[]).map((z) => {
        const src = version.sourceImages?.[z];
        const print = version.baseLayers?.[z]?.[0];
        if (!src && !print) return null;
        return (
          <figure key={z} className="border border-line p-2 text-xs">
            <figcaption className="mb-1 font-semibold capitalize">{z}</figcaption>
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {src && <img src={src} alt={`Uploaded ${z} image`} className="h-24 w-24 border border-line bg-white object-contain" />}
              <span aria-hidden>→</span>
              {print && print.type === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={print.src} alt={`Print used on the ${z}`} className="h-24 w-24 border border-line object-contain" style={{ background: checker }} data-testid={`print-${z}`} />
              ) : (
                <span className="flex h-24 w-24 items-center justify-center border border-line text-center text-mute" data-testid={`print-${z}`}>Plain (no print)</span>
              )}
            </div>
          </figure>
        );
      })}
      <p className="text-xs sm:col-span-2">
        Base colour: <span className="mr-1 inline-block h-3 w-3 border border-line align-middle" style={{ background: product.colors[0]?.hex }} />
        {product.colors[0]?.name} — edit the colours in step 3 (details) if needed.
      </p>
    </div>
  );
}

/** Size/position/rotation of each side's print; changes show instantly in the 3D preview. */
function PlacementControls({ layers, onChange, onReset }: { layers: Partial<Record<ZoneId, Layer[]>>; onChange: (l: Partial<Record<ZoneId, Layer[]>>) => void; onReset: () => void }) {
  const update = (zone: ZoneId, patch: Partial<ImageLayer>) =>
    onChange({ ...layers, [zone]: (layers[zone] ?? []).map((l, i) => (i === 0 ? ({ ...l, ...patch } as Layer) : l)) });
  const any = (['front', 'back'] as ZoneId[]).some((z) => layers[z]?.length);
  if (!any) return null;
  return (
    <div className="space-y-3 border-t border-line pt-3 text-xs" data-testid="artwork-placement">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Adjust the print (optional)</p>
        <button className="underline" onClick={onReset}>Reset to detected placement</button>
      </div>
      {(['front', 'back'] as ZoneId[]).map((zone) => {
        const l = layers[zone]?.[0];
        if (!l) return null;
        return (
          <div key={zone} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <span className="col-span-2 font-semibold capitalize sm:col-span-4">{zone}</span>
            <label>Size {Math.round(l.scale * 100)}%<input type="range" min={0.2} max={1.6} step={0.01} value={l.scale} onChange={(e) => update(zone, { scale: Number(e.target.value) })} className="w-full" data-testid={`place-${zone}-scale`} /></label>
            <label>Left ↔ right<input type="range" min={0} max={1} step={0.005} value={l.x} onChange={(e) => update(zone, { x: Number(e.target.value) })} className="w-full" /></label>
            <label>Up ↕ down<input type="range" min={0} max={1} step={0.005} value={l.y} onChange={(e) => update(zone, { y: Number(e.target.value) })} className="w-full" data-testid={`place-${zone}-y`} /></label>
            <label>Rotation {Math.round(l.rotation)}°<input type="range" min={-45} max={45} step={1} value={l.rotation} onChange={(e) => update(zone, { rotation: Number(e.target.value) })} className="w-full" /></label>
          </div>
        );
      })}
    </div>
  );
}

/** Perfumes: live 3D bottle preview and one-click publish to the perfume salon. */
function PerfumePanel({ product, run }: { product: Product; run: (fn: () => Promise<unknown>, ok: string, href?: string) => Promise<boolean> }) {
  const [busy, setBusy] = useState(false);
  const live = product.versions.find((v) => v.id === product.liveVersionId);
  const spec = product.perfume;
  const photo = product.photos?.[0];
  if (!spec) return null;
  const publish = async () => {
    setBusy(true);
    await run(
      async () => {
        const { version } = await api<{ version: ProductVersion }>(`/api/admin/products/${product.id}/perfume`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        await api(`/api/admin/products/${product.id}/publish`, json('POST', { versionId: version.id }));
      },
      `Published: ${product.title} is now in the perfume salon.`,
      `/perfumes?p=${product.id}`,
    );
    setBusy(false);
  };
  return (
    <section className="grid gap-6 border border-line bg-bone p-5 xl:grid-cols-[1fr_420px]" data-testid="perfume-panel">
      <div className="space-y-3">
        <h3 className="font-display text-2xl">2 · Check &amp; publish</h3>
        <p className="text-sm">
          {photo ? `${product.photos!.length} photo(s)` : `${BOTTLES[spec.bottle].label} bottle · ${CAP_FINISHES[spec.cap].label} cap`} · {spec.volumeMl} ml {spec.concentration}
        </p>
        <p className="text-xs text-mute">The preview shows the saved details. With photos, the salon shows your first photo; without photos it shows the 3D bottle from the details in step 3. Perfumes are presented as crafted: customers cannot customise them.</p>
        {live && <p className="text-xs text-brass">This perfume is live. Publishing again updates the salon with the saved details.</p>}
        <button className="btn btn-primary" disabled={busy} onClick={publish} data-testid="publish-perfume">
          {busy ? 'Publishing…' : live ? 'Update in the perfume salon' : 'Publish to the perfume salon'}
        </button>
      </div>
      {photo ? (
        // what the salon shows: the first photo standing on a plinth
        <figure className="relative flex h-[420px] items-end justify-center overflow-hidden bg-[radial-gradient(ellipse_at_50%_30%,#7a1d36,#2a0710_75%)]" data-testid="perfume-photo-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.useCutout && photo.cutoutUrl ? photo.cutoutUrl : photo.url} alt={`${product.title} as shown in the salon`} className={`relative z-10 mb-[86px] max-h-[270px] max-w-[70%] object-contain ${photo.useCutout && photo.cutoutUrl ? 'drop-shadow-[0_18px_14px_rgba(0,0,0,0.45)]' : 'border-4 border-[#e9dfcf]'}`} />
          <span aria-hidden className="absolute bottom-0 h-[92px] w-[58%] bg-gradient-to-b from-[#f3ede4] to-[#cfc5b6] shadow-[0_-2px_0_#b89a5e_inset]" />
          <figcaption className="absolute left-3 top-3 text-[0.68rem] uppercase tracking-[0.2em] text-[#f3dfc6]">Salon preview · photo {product.photos!.length > 1 ? `1 of ${product.photos!.length}` : ''}</figcaption>
        </figure>
      ) : (
        <PerfumePreview title={product.title} spec={spec} />
      )}
    </section>
  );
}
