'use client';
// Front/back artwork editor. Konva shows and manipulates the active print zone; every change is
// written to the design store, from which the 3D atlas is rendered (single source of truth).
import type Konva from 'konva';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Group, Image as KImage, Layer as KLayer, Line, Rect, Stage, Text as KText, Transformer } from 'react-konva';
import { measureTextFraction } from '@/lib/atlasRenderer';
import { getFontFamilies, getLoadedImage, loadImage, measureContext } from '@/lib/clientAssets';
import { getZone, layerBoundsStatus, SAFE_MARGIN, zoneAspect } from '@/lib/printZones';
import type { FontKey, ImageLayer, Layer, PrintZone, PublicProduct, TextLayer, ZoneId } from '@/lib/types';
import { layerId, useDesign } from '@/store/designStore';
import { useShowroom } from '@/store/showroomStore';

const FONT_LABEL: Record<FontKey, string> = { serif: 'Cormorant (serif)', sans: 'Manrope (sans)', mono: 'DM Mono' };

function textWidthFraction(layer: TextLayer, zone: PrintZone) {
  return measureTextFraction(measureContext(), layer, zone, getFontFamilies());
}
const measureFn = (zone: PrintZone) => (l: Layer) => (l.type === 'text' ? textWidthFraction(l, zone) : 0);

function useImage(src: string | null) {
  const [img, setImg] = useState<HTMLImageElement | undefined>(() => (src ? getLoadedImage(src) : undefined));
  useEffect(() => {
    if (!src) return;
    let alive = true;
    loadImage(src).then((i) => alive && setImg(i)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [src]);
  return img;
}

function LayerNode({ layer, W, H, zone, onSelect, nodeRef, locked }: {
  layer: Layer;
  W: number;
  H: number;
  zone: PrintZone;
  onSelect: () => void;
  nodeRef: (n: Konva.Node | null) => void;
  /** the product's own printed artwork: shown for context, never editable by the customer */
  locked?: boolean;
}) {
  const { beginGesture, live, endGesture, activeZone } = useDesign.getState();
  const img = useImage(layer.type === 'image' ? layer.src : null);
  const zoneId = activeZone;
  const patch = (fn: (l: Layer) => Partial<Layer>) =>
    live((d) => ({ ...d, zones: { ...d.zones, [zoneId]: d.zones[zoneId].map((l) => (l.id === layer.id ? ({ ...l, ...fn(l) } as Layer) : l)) } }));
  const common = {
    ref: nodeRef,
    x: layer.x * W,
    y: layer.y * H,
    rotation: layer.rotation,
    scaleX: layer.scale,
    scaleY: layer.scale,
    opacity: layer.opacity,
    draggable: !locked,
    listening: !locked,
    onMouseDown: onSelect,
    onTap: onSelect,
    onDragStart: () => {
      onSelect();
      beginGesture();
    },
    onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => patch(() => ({ x: e.target.x() / W, y: e.target.y() / H })),
    onDragEnd: () => endGesture(),
    onTransformStart: () => beginGesture(),
    onTransform: (e: Konva.KonvaEventObject<Event>) => {
      const n = e.target;
      patch(() => ({ x: n.x() / W, y: n.y() / H, rotation: n.rotation(), scale: n.scaleX() }));
    },
    onTransformEnd: () => endGesture(),
    name: `layer-${layer.id}`,
  };
  if (layer.type === 'image') {
    const w = layer.width * W;
    const h = w * layer.aspect;
    return img ? <KImage {...common} image={img} width={w} height={h} offsetX={w / 2} offsetY={h / 2} /> : <Rect {...common} width={w} height={h} offsetX={w / 2} offsetY={h / 2} fill="#00000010" />;
  }
  const px = layer.fontSize * H;
  // Konva applies letter-spacing per glyph slightly differently from Canvas2D, so give the box
  // headroom; with align=center and the offset at half the box, the visual centre is unchanged.
  const w = textWidthFraction(layer, zone) * W * 1.15 + layer.text.length * layer.letterSpacing * px + 8;
  return (
    <KText
      {...common}
      text={layer.text}
      fontFamily={getFontFamilies()[layer.font]}
      fontStyle={String(layer.weight)}
      fontSize={px}
      letterSpacing={layer.letterSpacing * px}
      fill={layer.fill}
      lineHeight={1.2}
      width={w}
      height={px * 1.2}
      offsetX={w / 2}
      offsetY={(px * 1.2) / 2}
      align="center"
      wrap="none"
    />
  );
}

export function DesignEditor({ product, onSave, saving, savedUrl, saveError }: {
  product: PublicProduct;
  onSave: () => void;
  saving: boolean;
  savedUrl: string | null;
  saveError: string | null;
}) {
  const design = useDesign((s) => s.design);
  const activeZone = useDesign((s) => s.activeZone);
  const selectedId = useDesign((s) => s.selectedId);
  const canUndo = useDesign((s) => s.past.length > 0);
  const canRedo = useDesign((s) => s.future.length > 0);
  const st = useDesign.getState();
  const setSide = useShowroom((s) => s.setSide);
  const cfg = product.version.modelConfig;
  const zone = getZone(cfg, activeZone) ?? cfg.printZones[0];
  const wrap = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(340);
  const H = W * zoneAspect(zone);
  const nodes = useRef(new Map<string, Konva.Node>());
  const tr = useRef<Konva.Transformer>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [, force] = useState(0);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(220, Math.min(380, Math.floor(e.contentRect.width)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // re-measure text once web fonts arrive
  useEffect(() => {
    const f = () => force((n) => n + 1);
    document.fonts?.addEventListener?.('loadingdone', f);
    return () => document.fonts?.removeEventListener?.('loadingdone', f);
  }, []);

  const layers = useMemo(() => design?.zones[activeZone] ?? [], [design, activeZone]);
  const selected = layers.find((l) => l.id === selectedId) ?? null;

  useEffect(() => {
    const t = tr.current;
    if (!t) return;
    const n = selectedId ? nodes.current.get(selectedId) : undefined;
    t.nodes(n ? [n] : []);
    t.getLayer()?.batchDraw();
  }, [selectedId, layers, W]);

  const warnings = useMemo(
    () =>
      layers
        .map((l) => ({ l, s: layerBoundsStatus(l, zone, measureFn(zone)) }))
        .filter((x) => x.s !== 'inside'),
    [layers, zone],
  );

  const switchZone = (z: ZoneId) => {
    st.setZone(z);
    setSide(z);
  };

  const addText = () => {
    const l: TextLayer = {
      id: layerId(), type: 'text', text: activeZone === 'front' ? 'ATELIER' : 'BACK CENTER', font: 'serif', fontSize: 0.065,
      fill: design && isDark(design.color.hex) ? '#f4efe6' : '#1c1a17', weight: 600, letterSpacing: 0.06,
      x: 0.5, y: 0.3, rotation: 0, scale: 1, opacity: 1,
    };
    st.addLayer(l);
  };

  const onFile = async (file: File) => {
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/uploads', { method: 'POST', body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error((body.errors ?? ['Upload failed']).join(' '));
      await loadImage(body.url);
      const aspect = body.height / body.width;
      const za = zoneAspect(zone);
      const width = Math.min(0.6, (0.7 * za) / aspect);
      const l: ImageLayer = { id: layerId(), type: 'image', src: body.url, width, aspect, name: file.name.slice(0, 60), x: 0.5, y: 0.42, rotation: 0, scale: 1, opacity: 1 };
      st.addLayer(l);
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const onKey = useCallback((e: React.KeyboardEvent) => {
    const s = useDesign.getState();
    const sel = s.design?.zones[s.activeZone].find((l) => l.id === s.selectedId);
    if (sel && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      s.removeLayer(sel.id);
    } else if (sel && e.key.startsWith('Arrow')) {
      e.preventDefault();
      const d = e.shiftKey ? 0.05 : 0.01;
      const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
      const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
      s.updateLayer(sel.id, { x: sel.x + dx, y: sel.y + dy });
    }
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) useDesign.getState().redo();
        else useDesign.getState().undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        useDesign.getState().redo();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  if (!design) return null;
  const m = SAFE_MARGIN;

  return (
    <div className="flex flex-col gap-5" data-testid="design-editor">
      <div className="flex items-center justify-between gap-3">
        <div role="tablist" aria-label="Print side" className="flex">
          {cfg.printZones.map((z) => (
            <button key={z.id} role="tab" aria-selected={activeZone === z.id} className="chip" onClick={() => switchZone(z.id)} data-testid={`zone-${z.id}`}>
              {z.label} <span className="ml-1 font-normal opacity-60">{z.widthCm}×{z.heightCm}cm</span>
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <button className="chip" onClick={st.undo} disabled={!canUndo} aria-label="Undo (Ctrl+Z)" data-testid="undo">↶</button>
          <button className="chip" onClick={st.redo} disabled={!canRedo} aria-label="Redo (Ctrl+Shift+Z)" data-testid="redo">↷</button>
        </div>
      </div>

      <div ref={wrap} className="w-full">
        <div
          tabIndex={0}
          onKeyDown={onKey}
          aria-label={`${zone.label} print area editor. Select a layer, then use arrow keys to move it and Delete to remove it.`}
          className="relative mx-auto border border-line bg-bone"
          style={{ width: W, height: H }}
          data-testid="zone-stage"
        >
          <Stage width={W} height={H} onMouseDown={(e) => e.target === e.target.getStage() && st.select(null)} onTouchStart={(e) => e.target === e.target.getStage() && st.select(null)}>
            <KLayer>
              <Rect width={W} height={H} fill={design.color.hex} listening={false} />
              <Rect x={m * W} y={m * H} width={(1 - 2 * m) * W} height={(1 - 2 * m) * H} stroke={isDark(design.color.hex) ? '#ffffff55' : '#00000040'} dash={[6, 5]} strokeWidth={1} listening={false} />
              <Line points={[W / 2, 0, W / 2, H]} stroke={isDark(design.color.hex) ? '#ffffff22' : '#00000018'} strokeWidth={1} listening={false} />
              <Group clipX={0} clipY={0} clipWidth={W} clipHeight={H}>
                {(product.version.baseLayers?.[activeZone] ?? []).map((l) => (
                  <LayerNode key={`base-${l.id}`} layer={l} W={W} H={H} zone={zone} locked onSelect={() => undefined} nodeRef={() => undefined} />
                ))}
                {layers.map((l) => (
                  <LayerNode
                    key={l.id}
                    layer={l}
                    W={W}
                    H={H}
                    zone={zone}
                    onSelect={() => st.select(l.id)}
                    nodeRef={(n) => {
                      if (n) nodes.current.set(l.id, n);
                      else nodes.current.delete(l.id);
                    }}
                  />
                ))}
              </Group>
              <Transformer ref={tr} keepRatio rotationSnaps={[0, 90, 180, 270]} rotationSnapTolerance={4} enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']} anchorSize={9} borderStroke="#9c4a2e" anchorStroke="#9c4a2e" boundBoxFunc={(o, n) => (Math.abs(n.width) < 12 || Math.abs(n.height) < 8 ? o : n)} />
            </KLayer>
          </Stage>
        </div>
        <p className="mt-2 text-center text-[0.7rem] text-mute">Dashed line: print-safe area. Artwork outside the panel is clipped.</p>
      </div>

      {warnings.length > 0 && (
        <ul className="space-y-1 text-xs" role="status" data-testid="bounds-warnings">
          {warnings.map(({ l, s }) => (
            <li key={l.id} className={s === 'clipped' ? 'text-danger' : 'text-brass'}>
              {s === 'clipped' ? '⚠ ' : '• '}
              {layerLabel(l)} {s === 'clipped' ? 'extends beyond the printable area and will be cut off.' : 'is close to the edge of the print-safe area.'}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <button className="btn btn-ghost" onClick={addText} data-testid="add-text">+ Text</button>
        <label className="btn btn-ghost cursor-pointer" aria-disabled={uploading}>
          {uploading ? 'Uploading…' : '+ Image'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,.svg"
            className="sr-only"
            data-testid="upload-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {uploadError && <p className="text-xs text-danger" role="alert" data-testid="upload-error">{uploadError}</p>}

      <section aria-label="Layers">
        <h3 className="eyebrow mb-2">Layers · {zone.label}</h3>
        {layers.length === 0 && <p className="text-xs text-mute">No artwork on this side yet.</p>}
        <ol className="space-y-1" data-testid="layer-list">
          {[...layers].reverse().map((l) => (
            <li key={l.id} className={`flex items-center gap-1 border px-2 py-1 text-xs ${l.id === selectedId ? 'border-ink bg-bone' : 'border-line'}`}>
              <button className="flex-1 truncate text-left" onClick={() => st.select(l.id)} aria-pressed={l.id === selectedId}>
                {l.type === 'text' ? 'T' : '▣'} {layerLabel(l)}
              </button>
              <button className="px-1" aria-label="Bring forward" onClick={() => st.moveLayer(l.id, 1)}>▲</button>
              <button className="px-1" aria-label="Send backward" onClick={() => st.moveLayer(l.id, -1)}>▼</button>
              <button className="px-1" aria-label="Duplicate" onClick={() => st.duplicateLayer(l.id)}>⧉</button>
              <button className="px-1 text-danger" aria-label="Delete" onClick={() => st.removeLayer(l.id)}>✕</button>
            </li>
          ))}
        </ol>
      </section>

      {selected && <LayerProperties layer={selected} />}

      <div className="border-t border-line pt-4">
        <button className="btn btn-primary w-full" onClick={onSave} disabled={saving} data-testid="save-design">
          {saving ? 'Saving…' : 'Save design'}
        </button>
        {saveError && <p className="mt-2 text-xs text-danger" role="alert">{saveError}</p>}
        {savedUrl && (
          <p className="mt-2 break-all text-xs text-ok" role="status" data-testid="saved-link">
            Saved. Reopen anytime: <a className="underline" href={savedUrl}>{savedUrl}</a>
          </p>
        )}
      </div>
    </div>
  );
}

function LayerProperties({ layer }: { layer: Layer }) {
  const st = useDesign.getState();
  const up = (p: Partial<Layer>) => st.updateLayer(layer.id, p);
  return (
    <section aria-label="Selected layer" className="space-y-3 border border-line p-3" data-testid="layer-props">
      <h3 className="eyebrow">Selected · {layerLabel(layer)}</h3>
      {layer.type === 'text' && (
        <>
          <label className="block text-xs">
            Text
            <input className="field mt-1" maxLength={120} value={layer.text} onChange={(e) => e.target.value && up({ text: e.target.value })} data-testid="text-input" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs">
              Font
              <select className="field mt-1" value={layer.font} onChange={(e) => up({ font: e.target.value as FontKey })}>
                {(Object.keys(FONT_LABEL) as FontKey[]).map((f) => (
                  <option key={f} value={f}>{FONT_LABEL[f]}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              Weight
              <select className="field mt-1" value={layer.weight} onChange={(e) => up({ weight: Number(e.target.value) as 400 | 600 | 700 })}>
                <option value={400}>Regular</option>
                <option value={600}>Semibold</option>
                <option value={700}>Bold</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs">
              Ink colour
              <input type="color" className="field mt-1 h-10 p-1" value={layer.fill} onChange={(e) => up({ fill: e.target.value })} />
            </label>
            <label className="block text-xs">
              Letter spacing
              <input type="range" min={-0.1} max={0.6} step={0.01} className="mt-3 w-full" value={layer.letterSpacing} onChange={(e) => up({ letterSpacing: Number(e.target.value) })} />
            </label>
          </div>
        </>
      )}
      <label className="block text-xs">
        Rotation {Math.round(layer.rotation)}°
        <input type="range" min={-180} max={180} step={1} className="w-full" value={layer.rotation} onChange={(e) => up({ rotation: Number(e.target.value) })} />
      </label>
      <label className="block text-xs">
        Size {Math.round(layer.scale * 100)}%
        <input type="range" min={0.1} max={3} step={0.01} className="w-full" value={layer.scale} onChange={(e) => up({ scale: Number(e.target.value) })} data-testid="scale-input" />
      </label>
      <label className="block text-xs">
        Opacity {Math.round(layer.opacity * 100)}%
        <input type="range" min={0.1} max={1} step={0.01} className="w-full" value={layer.opacity} onChange={(e) => up({ opacity: Number(e.target.value) })} />
      </label>
    </section>
  );
}

function layerLabel(l: Layer) {
  return l.type === 'text' ? `“${l.text.slice(0, 22)}”` : l.name;
}

export function isDark(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 110;
}
