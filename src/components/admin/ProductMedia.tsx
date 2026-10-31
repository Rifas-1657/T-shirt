'use client';
// Admin building blocks: category cards with a real preview of where the product appears,
// the photo picker used before a product exists, and the photo manager for saved perfumes.
import { useEffect, useMemo, useState } from 'react';
import { CATEGORY_INFO, RACK_ORDER } from '@/lib/garments';
import type { GarmentCategory, PhotoView, Product, ProductPhoto } from '@/lib/types';

export type Cat = GarmentCategory | 'perfume';

export const CATEGORY_CARDS: { id: Cat; label: string; where: string; can: string }[] = [
  ...RACK_ORDER.map((c) => ({ id: c as Cat, label: CATEGORY_INFO[c].label, where: `${CATEGORY_INFO[c].plural} rack in the 3D boutique`, can: 'Customers can customise the front and back' })),
  { id: 'perfume', label: 'Perfume', where: 'Perfume salon (/perfumes)', can: 'Shown with your photos; no customisation' },
];

export function CategoryCards({ value, suggested, onPick }: { value: Cat | ''; suggested: Cat | null; onPick: (c: Cat) => void }) {
  const effective = value || suggested;
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-5" role="radiogroup" aria-label="Category">
      {CATEGORY_CARDS.map((c) => {
        const on = effective === c.id;
        return (
          <button
            type="button"
            key={c.id}
            role="radio"
            aria-checked={on}
            onClick={() => onPick(c.id)}
            className={`group overflow-hidden border text-left transition ${on ? 'border-ink ring-2 ring-ink' : 'border-line hover:border-graphite'}`}
            data-testid={`pf-garment-${c.id}`}
          >
            <span className={`block aspect-[4/3] w-full overflow-hidden ${c.id === 'perfume' ? 'bg-[#5a0b23]' : 'bg-stone'}`}>
              {/* real screenshot of where the product will appear */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/admin-previews/${c.id}.jpg`} alt="" className="h-full w-full object-cover transition group-hover:scale-105" onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />
            </span>
            <span className="block p-2">
              <span className="block text-xs font-semibold">{c.label}{suggested === c.id && !value ? <span className="ml-1 font-normal text-mute">(detected)</span> : null}</span>
              <span className="block text-[0.68rem] leading-snug text-mute">{c.where}</span>
              <span className="block text-[0.68rem] leading-snug text-mute">{c.can}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export interface PendingPhotos {
  front?: File;
  back?: File;
  photos: { file: File; view: PhotoView }[];
}

const VIEWS: PhotoView[] = ['front', 'angle', 'side', 'back', 'detail'];
const VIEW_LABEL: Record<PhotoView, string> = { front: 'Front', angle: '¾ angle', side: 'Side', back: 'Back', detail: 'Detail' };

function useObjectUrl(file?: File) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  return url;
}

function Slot({ label, file, onFile, testId }: { label: string; file?: File; onFile: (f?: File) => void; testId: string }) {
  const url = useObjectUrl(file);
  return (
    <label className="flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-line bg-bone p-3 text-center text-xs hover:border-graphite">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={`${label} preview`} className="h-32 w-full object-contain" />
      ) : (
        <span className="flex h-32 w-full items-center justify-center text-mute">Drop or choose a photo</span>
      )}
      <span className="font-semibold">{label}</span>
      <input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} data-testid={testId} />
    </label>
  );
}

function PendingThumb({ file, view, onView, onRemove }: { file: File; view: PhotoView; onView: (v: PhotoView) => void; onRemove: () => void }) {
  const url = useObjectUrl(file);
  return (
    <li className="border border-line bg-bone p-2 text-xs">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt={file.name} className="h-28 w-full object-contain" />}
      <div className="mt-1 flex items-center gap-1">
        <select className="field !min-h-8 !py-0 text-xs" value={view} onChange={(e) => onView(e.target.value as PhotoView)} aria-label={`View of ${file.name}`}>
          {VIEWS.map((v) => <option key={v} value={v}>{VIEW_LABEL[v]}</option>)}
        </select>
        <button type="button" className="chip !h-8 !min-w-8" onClick={onRemove} aria-label={`Remove ${file.name}`}>✕</button>
      </div>
    </li>
  );
}

/** Photos chosen before the product exists; uploaded right after "Create product". */
export function PhotoPicker({ isPerfume, value, onChange }: { isPerfume: boolean; value: PendingPhotos; onChange: (v: PendingPhotos) => void }) {
  if (!isPerfume)
    return (
      <div className="grid grid-cols-2 gap-3" data-testid="photo-picker">
        <Slot label="Front" file={value.front} onFile={(f) => onChange({ ...value, front: f })} testId="img-front" />
        <Slot label="Back" file={value.back} onFile={(f) => onChange({ ...value, back: f })} testId="img-back" />
        <p className="col-span-2 text-xs text-mute">Product photos (garment on a plain light background) or print artwork (PNG). Optional — you can add them later.</p>
      </div>
    );
  const add = (files: FileList | null) => {
    if (!files) return;
    const used = new Set(value.photos.map((p) => p.view));
    const next = [...value.photos];
    for (const f of Array.from(files).slice(0, 8 - next.length)) {
      const view = VIEWS.find((v) => v !== 'detail' && !used.has(v)) ?? 'detail';
      used.add(view);
      next.push({ file: f, view });
    }
    onChange({ ...value, photos: next });
  };
  return (
    <div className="space-y-2" data-testid="photo-picker">
      <label
        className="flex cursor-pointer flex-col items-center justify-center border border-dashed border-line bg-bone p-6 text-center text-xs hover:border-graphite"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          add(e.dataTransfer.files);
        }}
      >
        <span className="font-semibold">Drop perfume photos here or click to choose</span>
        <span className="mt-1 text-mute">Up to 8 · front first, then ¾ angle, side, back. Any background: the bottle is cut out automatically. With 3–4 angles customers can turn it in the salon.</span>
        <input type="file" accept="image/png,image/jpeg" multiple className="sr-only" onChange={(e) => add(e.target.files)} data-testid="perfume-photos-input" />
      </label>
      {value.photos.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {value.photos.map((p, i) => (
            <PendingThumb
              key={i}
              file={p.file}
              view={p.view}
              onView={(v) => onChange({ ...value, photos: value.photos.map((x, j) => (j === i ? { ...x, view: v } : x)) })}
              onRemove={() => onChange({ ...value, photos: value.photos.filter((_, j) => j !== i) })}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

const checker = 'repeating-conic-gradient(#d9d2c5 0% 25%, #f3efe8 0% 50%) 50% / 14px 14px';

/** Saved perfume photos: original → cut-out, view, cut-out on/off, make first, delete, add more. */
export function PhotoManager({ product, onChanged, reload }: { product: Product; onChanged: (msg: { kind: 'ok' | 'error'; text: string }) => Promise<void>; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const photos = product.photos ?? [];
  const working = photos.some((ph) => ph.cutout === 'working');
  // AI cut-outs finish in the background: refresh until they are done
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => void reload(), 4000);
    return () => clearInterval(t);
  }, [working, reload]);
  const call = async (url: string, init: RequestInit, ok: string) => {
    setBusy(true);
    try {
      const res = await fetch(url, init);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body.errors ?? ['Request failed']).join(' '));
      const extra = [...(body.errors ?? []), ...(body.notes ?? [])].join(' ');
      await onChanged({ kind: body.errors?.length ? 'error' : 'ok', text: extra ? `${ok} ${extra}` : ok });
    } catch (e) {
      await onChanged({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const base = `/api/admin/products/${product.id}/photos`;
  const patch = (ph: ProductPhoto, body: Record<string, unknown>, ok: string) => call(`${base}/${ph.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, ok);
  return (
    <section className="border border-line bg-bone p-5" data-testid="photo-manager">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-2xl">1 · Photos</h3>
        <span className="text-xs text-mute">{photos.length} / 8 · the first photo is the one on display</span>
      </div>
      {photos.length === 0 && <p className="mt-2 text-sm text-mute">No photos yet. Without photos the salon shows a 3D bottle made from the details below.</p>}
      <p className="mt-2 text-xs text-mute">Any photo works: the bottle is cut out of its background automatically (instantly on a plain light background, with AI in about 20 s otherwise). Best results: one bottle, upright, fully in the picture, sharp, 1000 px or larger. Add front, ¾ angle, side and back photos and customers can turn the bottle in the salon.</p>
      <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {photos.map((ph, i) => (
          <li key={ph.id} className="border border-line p-2 text-xs" data-testid="saved-photo">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ph.url} alt={`Uploaded ${ph.view} photo`} className="h-28 w-1/2 border border-line bg-white object-contain" />
              <span aria-hidden>→</span>
              {ph.cutout === 'working' ? (
                <span className="flex h-28 w-1/2 animate-pulse flex-col items-center justify-center border border-line text-center text-mute" role="status" data-testid="cutout-working">
                  Removing the background…<span className="text-[0.65rem]">about 20 s</span>
                </span>
              ) : ph.cutoutUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ph.useCutout ? ph.cutoutUrl : ph.url} alt={`Shown ${ph.view} photo`} className="h-28 w-1/2 border border-line object-contain" style={{ background: ph.useCutout ? checker : '#fff' }} />
              ) : (
                <span className="flex h-28 w-1/2 flex-col items-center justify-center gap-1 border border-line p-1 text-center text-mute">
                  {ph.cutout === 'failed' ? 'Cut-out failed — shown framed' : 'Shown framed'}
                  <button className="chip !h-7 text-[0.68rem]" disabled={busy} onClick={() => patch(ph, { aiCutout: true }, 'Removing the background with AI…')} data-testid="ai-cutout">Cut out with AI</button>
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {i === 0 ? <span className="chip !h-8" aria-current="true">On display</span> : <button className="chip !h-8" disabled={busy} onClick={() => patch(ph, { first: true }, 'Photo moved first.')}>Show first</button>}
              <select className="field !min-h-8 !w-auto !py-0 text-xs" value={ph.view} disabled={busy} onChange={(e) => patch(ph, { view: e.target.value }, 'View updated.')} aria-label="Photo view">
                {VIEWS.map((v) => <option key={v} value={v}>{VIEW_LABEL[v]}</option>)}
              </select>
              {ph.cutoutUrl && (
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={ph.useCutout} disabled={busy} onChange={(e) => patch(ph, { useCutout: e.target.checked }, e.target.checked ? 'Using the cut-out.' : 'Using the original photo.')} />
                  Cut-out
                </label>
              )}
              <button className="chip !h-8 text-danger" disabled={busy} onClick={() => call(`${base}/${ph.id}`, { method: 'DELETE' }, 'Photo deleted.')} aria-label="Delete photo">Delete</button>
            </div>
          </li>
        ))}
      </ul>
      {photos.length < 8 && (
        <label className="btn btn-ghost mt-3 cursor-pointer" aria-disabled={busy}>
          {busy ? 'Uploading…' : '+ Add photos'}
          <input
            type="file"
            accept="image/png,image/jpeg"
            multiple
            className="sr-only"
            data-testid="add-photos-input"
            onChange={(e) => {
              const files = e.target.files;
              if (!files?.length) return;
              const fd = new FormData();
              for (const f of Array.from(files)) fd.append('photo', f);
              e.target.value = '';
              void call(base, { method: 'POST', body: fd }, 'Photos uploaded.');
            }}
          />
        </label>
      )}
    </section>
  );
}
