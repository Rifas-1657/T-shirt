'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CATEGORY_INFO, classifyGarment, RACK_ORDER } from '@/lib/garments';
import { isCustomizable } from '@/lib/printZones';
import { TEMPLATE_ZONES } from '@/lib/template';
import type { GarmentCategory, ImageLayer, Layer, PrintZone, Product, ProductColor, ProductVersion, ZoneId } from '@/lib/types';

const AdminPreview = dynamic(() => import('./AdminPreview').then((m) => m.AdminPreview), { ssr: false });

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
        <ul className="space-y-1" data-testid="admin-product-list">
          {products.map((p) => {
            const live = p.versions.find((v) => v.id === p.liveVersionId);
            return (
              <li key={p.id}>
                <button className={`w-full border px-3 py-2 text-left text-sm ${p.id === selectedId ? 'border-ink bg-bone' : 'border-line'}`} onClick={() => { setSelectedId(p.id); setCreating(false); setMsg(null); }}>
                  <span className="block font-semibold">{p.title}</span>
                  <span className="text-xs text-mute">{p.sku} · {CATEGORY_INFO[p.garment].label} · {live ? (p.active ? 'Live' : 'Inactive') : 'Unpublished'} · {p.versions.length} version(s)</span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
      <section>
        {msg && <p role={msg.kind === 'error' ? 'alert' : 'status'} className={`mb-4 border px-3 py-2 text-sm ${msg.kind === 'error' ? 'border-danger text-danger' : 'border-ok text-ok'}`} data-testid="admin-msg">{msg.text}{msg.href && <> · <a className="font-semibold underline" href={msg.href} target="_blank" rel="noreferrer" data-testid="admin-msg-link">View in store ↗</a></>}</p>}
        {creating && (
          <ProductForm
            onSubmit={async (data) => {
              try {
                const { product } = await api<{ product: Product }>('/api/admin/products', json('POST', data));
                await reload();
                setCreating(false);
                setSelectedId(product.id);
                setMsg({ kind: 'ok', text: `Created ${product.title} on the ${CATEGORY_INFO[product.garment].plural} rack. Next: step 2, upload the front and back images.` });
              } catch (e) {
                setMsg({ kind: 'error', text: (e as Error).message });
              }
            }}
          />
        )}
        {selected && <ProductEditor key={selected.id} product={selected} reload={reload} setMsg={setMsg} />}
        {!creating && !selected && <p className="text-sm text-mute">Select a product or create a new one.</p>}
      </section>
    </div>
  );
}

function ProductForm({ initial, onSubmit, onGarmentChange }: { initial?: Product; onSubmit: (d: Record<string, unknown>) => Promise<unknown>; onGarmentChange?: (g: GarmentCategory) => Promise<unknown> }) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [sku, setSku] = useState(initial?.sku ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [category, setCategory] = useState(initial?.category ?? 'T-Shirts');
  // '' = follow the automatic suggestion; otherwise an explicit admin override
  const [garment, setGarment] = useState<GarmentCategory | ''>(initial?.garment ?? '');
  const [price, setPrice] = useState(String(initial?.price ?? ''));
  const [sizes, setSizes] = useState<string[]>(initial?.sizes ?? ['S', 'M', 'L', 'XL']);
  const [colors, setColors] = useState<ProductColor[]>(initial?.colors ?? [{ name: 'Chalk', hex: '#ece8df' }]);
  const [busy, setBusy] = useState(false);
  const suggested = classifyGarment(title, description, category);
  return (
    <form
      className="max-w-2xl space-y-3 border border-line bg-bone p-5"
      data-testid="product-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSubmit({ title, sku, description, category, price: Number(price), sizes, colors, garment: garment || suggested || undefined });
        setBusy(false);
      }}
    >
      <h2 className="font-display text-2xl">{initial ? 'Product details' : 'New product'}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs">Title<input className="field mt-1" value={title} onChange={(e) => setTitle(e.target.value)} required data-testid="pf-title" /></label>
        <label className="text-xs">SKU<input className="field mt-1" value={sku} onChange={(e) => setSku(e.target.value)} required data-testid="pf-sku" /></label>
        <label className="text-xs">Display category<input className="field mt-1" value={category} onChange={(e) => setCategory(e.target.value)} /></label>
        <label className="text-xs">Price (USD)<input className="field mt-1" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required data-testid="pf-price" /></label>
      </div>
      <fieldset className="border border-line p-3" data-testid="garment-field">
        <legend className="px-1 text-xs">Garment type → rack &amp; 3D template</legend>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Garment type">
          {RACK_ORDER.map((c) => (
            <button type="button" key={c} role="radio" aria-checked={(garment || suggested) === c} className="chip" onClick={() => {
                setGarment(c);
                // existing products: the rack changes immediately (no hidden unsaved state)
                if (onGarmentChange && initial && c !== initial.garment) void onGarmentChange(c);
              }} data-testid={`pf-garment-${c}`}>
              {CATEGORY_INFO[c].label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-mute" data-testid="garment-hint">
          {garment
            ? <>Set manually.{suggested && suggested !== garment ? ` (Text suggests ${CATEGORY_INFO[suggested].label}.)` : ''} <button type="button" className="underline" onClick={() => setGarment('')}>Use automatic</button></>
            : suggested
              ? `Automatic: ${CATEGORY_INFO[suggested].label}, detected from the title/description. Click another type to override.`
              : 'Could not detect the type from the text — choose one.'}
        </p>
      </fieldset>
      <label className="block text-xs">Description<textarea className="field mt-1" rows={3} maxLength={600} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <fieldset>
        <legend className="text-xs">Sizes</legend>
        <div className="mt-1 flex gap-1">
          {SIZES.map((s) => (
            <button type="button" key={s} className="chip" aria-pressed={sizes.includes(s)} onClick={() => setSizes((v) => (v.includes(s) ? v.filter((x) => x !== s) : [...v, s]))}>{s}</button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-xs">Base colours</legend>
        {colors.map((c, i) => (
          <div key={i} className="mt-1 flex gap-2">
            <input className="field" value={c.name} onChange={(e) => setColors((cs) => cs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label="Colour name" />
            <input type="color" className="field w-16 p-1" value={c.hex} onChange={(e) => setColors((cs) => cs.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)))} aria-label="Colour value" />
            <button type="button" className="chip" onClick={() => setColors((cs) => cs.filter((_, j) => j !== i))} disabled={colors.length === 1} aria-label="Remove colour">✕</button>
          </div>
        ))}
        <button type="button" className="mt-2 text-xs underline" onClick={() => setColors((cs) => [...cs, { name: 'New colour', hex: '#888888' }])}>+ Add colour</button>
      </fieldset>
      <button className="btn btn-primary" disabled={busy} data-testid="pf-submit">{busy ? 'Saving…' : initial ? 'Save details' : 'Create product'}</button>
    </form>
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
  const rack = CATEGORY_INFO[product.garment].plural;

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
            Live on the {rack} rack · <a className="underline" href={`/?product=${product.id}`} target="_blank" rel="noreferrer">View in store ↗</a>
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

      <ol className="grid gap-2 text-xs sm:grid-cols-3" aria-label="Steps">
        <li className="border border-line bg-bone p-3"><strong>1 · Details &amp; rack</strong><br />Name, price, sizes, colours and the garment type (= which rack it hangs on).</li>
        <li className="border border-line bg-bone p-3"><strong>2 · Front &amp; back images</strong><br />Product photos (garment on a plain background) or print artwork (PNG with transparency).</li>
        <li className="border border-line bg-bone p-3"><strong>3 · Check &amp; publish</strong><br />Check the 3D preview, adjust if needed, tick the box and press Publish.</li>
      </ol>

      <ProductForm
        initial={product}
        onSubmit={(d) => run(() => api(`/api/admin/products/${product.id}`, json('PATCH', d)), 'Details saved.')}
        onGarmentChange={(g) => run(() => api(`/api/admin/products/${product.id}`, json('PATCH', { garment: g })), `Moved to the ${CATEGORY_INFO[g].plural} rack. Image-based designs now use the ${CATEGORY_INFO[g].label.toLowerCase()} template.`)}
      />

      <section className="border border-line bg-bone p-5">
        <h3 className="font-display text-2xl">2 · Front &amp; back images</h3>
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
          <h3 className="font-display text-2xl">{isImages ? '3 · Check & publish' : 'Model version'}</h3>
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
        {product.colors[0]?.name} — edit the colours in step 1 if needed.
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
