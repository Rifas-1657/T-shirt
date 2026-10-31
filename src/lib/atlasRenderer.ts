// Draws a design's print zones into the garment's UV atlas canvas. This is the single source of
// truth for what appears on the 3D shirt; the Konva editor only edits the design JSON.
// Pure apart from the Canvas2D context passed in, so it is unit-tested with a recording context.
import { layerBaseSize, zoneAspect, zoneToAtlasRect, type PixelRect } from './printZones';
import type { FontKey, Layer, ModelConfig, PrintZone, TextLayer, ZoneId } from './types';

export type Ctx2D = Pick<
  CanvasRenderingContext2D,
  | 'save'
  | 'restore'
  | 'clearRect'
  | 'beginPath'
  | 'rect'
  | 'clip'
  | 'translate'
  | 'rotate'
  | 'scale'
  | 'drawImage'
  | 'fillText'
  | 'measureText'
  | 'font'
  | 'fillStyle'
  | 'globalAlpha'
  | 'textAlign'
  | 'textBaseline'
> & { letterSpacing?: string };

export type FontFamilies = Record<FontKey, string>;

export const DEFAULT_FONTS: FontFamilies = {
  serif: 'Georgia, "Times New Roman", serif',
  sans: 'Helvetica, Arial, sans-serif',
  mono: '"Courier New", monospace',
};

export function fontString(layer: TextLayer, pxSize: number, fonts: FontFamilies): string {
  return `${layer.weight} ${Math.max(1, Math.round(pxSize))}px ${fonts[layer.font]}`;
}

/** Width of a text layer as a fraction of the zone width, measured with a real canvas context. */
export function measureTextFraction(
  ctx: Pick<CanvasRenderingContext2D, 'measureText' | 'font'> & { letterSpacing?: string },
  layer: TextLayer,
  zone: PrintZone,
  fonts: FontFamilies,
): number {
  const refH = 1000; // measure at a fixed reference zone height
  const refW = refH / zoneAspect(zone);
  const px = layer.fontSize * refH;
  ctx.font = fontString(layer, px, fonts);
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${layer.letterSpacing * px}px`;
  const w = ctx.measureText(layer.text).width;
  return w / refW;
}

export interface RenderOptions {
  config: Pick<ModelConfig, 'printZones'>;
  zones: Partial<Record<ZoneId, Layer[]>>;
  /** Loaded images keyed by layer src. Missing images are skipped (reported via onMissing). */
  images: Map<string, CanvasImageSource>;
  fonts?: FontFamilies;
  /** Optional non-editable base artwork per zone (image-only product pathway), drawn first. */
  baseArtwork?: Partial<Record<ZoneId, CanvasImageSource & { width: number; height: number }>>;
  onMissing?: (src: string) => void;
}

function drawLayer(ctx: Ctx2D, layer: Layer, rect: PixelRect, zone: PrintZone, opts: RenderOptions) {
  const fonts = opts.fonts ?? DEFAULT_FONTS;
  ctx.save();
  ctx.globalAlpha = layer.opacity;
  ctx.translate(rect.left + layer.x * rect.width, rect.top + layer.y * rect.height);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.scale(layer.scale, layer.scale);
  if (layer.type === 'image') {
    const img = opts.images.get(layer.src);
    if (!img) {
      opts.onMissing?.(layer.src);
    } else {
      const { w, h } = layerBaseSize(layer, zone);
      const pw = w * rect.width;
      const ph = h * rect.height;
      ctx.drawImage(img, -pw / 2, -ph / 2, pw, ph);
    }
  } else {
    const px = layer.fontSize * rect.height;
    ctx.font = fontString(layer, px, fonts);
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${layer.letterSpacing * px}px`;
    ctx.fillStyle = layer.fill;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(layer.text, 0, 0);
  }
  ctx.restore();
}

/** Clears the atlas and redraws every zone, clipped to its printable rectangle. */
export function renderAtlas(ctx: Ctx2D, width: number, height: number, opts: RenderOptions): void {
  ctx.clearRect(0, 0, width, height);
  for (const zone of opts.config.printZones) {
    const box = zoneToAtlasRect(zone.uvRect, width, height);
    ctx.save();
    // a zone that follows a sleeve is drawn in its own rotated frame, centred on the zone
    let rect = box;
    if (zone.angle) {
      ctx.translate(box.left + box.width / 2, box.top + box.height / 2);
      ctx.rotate((zone.angle * Math.PI) / 180);
      rect = { left: -box.width / 2, top: -box.height / 2, width: box.width, height: box.height };
    }
    ctx.beginPath();
    ctx.rect(rect.left, rect.top, rect.width, rect.height);
    ctx.clip();
    const base = opts.baseArtwork?.[zone.id];
    if (base) {
      // contain-fit the base artwork inside the zone
      const s = Math.min(rect.width / base.width, rect.height / base.height);
      const w = base.width * s;
      const h = base.height * s;
      ctx.drawImage(base, rect.left + (rect.width - w) / 2, rect.top + (rect.height - h) / 2, w, h);
    }
    for (const layer of opts.zones[zone.id] ?? []) drawLayer(ctx, layer, rect, zone, opts);
    ctx.restore();
  }
}

/** Collects every image src referenced by the design (for preloading). */
export function referencedImages(zones: Partial<Record<ZoneId, Layer[]>>): string[] {
  const set = new Set<string>();
  for (const layers of Object.values(zones)) for (const l of layers ?? []) if (l.type === 'image') set.add(l.src);
  return [...set];
}
