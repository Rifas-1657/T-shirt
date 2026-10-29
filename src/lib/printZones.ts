// Transform between editor space (normalised zone coordinates) and the UV atlas canvas.
//
// Editor space: x in [0,1] left->right as the customer sees that side of the garment,
//               y in [0,1] top->bottom.
// UV space:     zones are stored bottom-left/v-up (as authored in Blender). glTF stores
//               v_gltf = 1 - v and three's GLTFLoader samples with flipY = false, so the atlas
//               CanvasTexture also uses flipY = false: canvas row y = v_gltf * H = (1 - v) * H.
// Therefore a zone with uvRect {u0,v0,u1,v1} occupies, in an atlas canvas of size W x H:
//   left = u0 * W, top = (1 - v1) * H, width = (u1 - u0) * W, height = (v1 - v0) * H
// and an editor point (x, y) maps to canvas (left + x * width, top + y * height).
// Orientation (front vs mirrored back) is encoded in the model's UV layout and verified per product
// with the asymmetric mapping test; it is never assumed here.
import type { Layer, ModelConfig, PrintZone, UvRect, ZoneId } from './types';

export interface PixelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function zoneToAtlasRect(uv: UvRect, atlasW: number, atlasH: number): PixelRect {
  return {
    left: uv.u0 * atlasW,
    top: (1 - uv.v1) * atlasH,
    width: (uv.u1 - uv.u0) * atlasW,
    height: (uv.v1 - uv.v0) * atlasH,
  };
}

export function editorToAtlas(x: number, y: number, rect: PixelRect): [number, number] {
  return [rect.left + x * rect.width, rect.top + y * rect.height];
}

export function editorToUv(x: number, y: number, uv: UvRect): [number, number] {
  return [uv.u0 + x * (uv.u1 - uv.u0), uv.v1 - y * (uv.v1 - uv.v0)];
}

export function uvToEditor(u: number, v: number, uv: UvRect): [number, number] {
  return [(u - uv.u0) / (uv.u1 - uv.u0), (uv.v1 - v) / (uv.v1 - uv.v0)];
}

export function isValidUvRect(r: UvRect): boolean {
  const nums = [r.u0, r.v0, r.u1, r.v1];
  return nums.every((n) => Number.isFinite(n) && n >= 0 && n <= 1) && r.u1 > r.u0 && r.v1 > r.v0;
}

export function zoneAspect(zone: PrintZone): number {
  return zone.heightCm / zone.widthCm;
}

/**
 * Checks that the zone's UV rect, rendered into the atlas, has the same aspect as its physical size.
 * A mismatch means artwork would be stretched on the garment.
 */
export function zoneDistortion(zone: PrintZone, atlasW: number, atlasH: number): number {
  const r = zoneToAtlasRect(zone.uvRect, atlasW, atlasH);
  return Math.abs(r.height / r.width / zoneAspect(zone) - 1);
}

export function getZone(cfg: ModelConfig, id: ZoneId): PrintZone | undefined {
  return cfg.printZones.find((z) => z.id === id);
}

/** Base (unscaled) size of a layer in zone-normalised units. */
export function layerBaseSize(layer: Layer, zone: PrintZone, measureTextWidth?: (l: Layer) => number) {
  const aspect = zoneAspect(zone);
  if (layer.type === 'image') {
    const w = layer.width;
    // image height as a fraction of zone height = w * imageAspect / zoneAspect
    return { w, h: (w * layer.aspect) / aspect };
  }
  const h = layer.fontSize * 1.2;
  const w = measureTextWidth ? measureTextWidth(layer) : layer.text.length * layer.fontSize * 0.55 * aspect;
  return { w, h };
}

/** Corners of the transformed layer in zone-normalised coordinates (accounts for aspect when rotating). */
export function layerCorners(
  layer: Layer,
  zone: PrintZone,
  measureTextWidth?: (l: Layer) => number,
): [number, number][] {
  const { w, h } = layerBaseSize(layer, zone, measureTextWidth);
  const aspect = zoneAspect(zone);
  // work in a metric space where 1 unit = zone width on both axes
  const hw = (w * layer.scale) / 2;
  const hh = (h * layer.scale * aspect) / 2;
  const a = (layer.rotation * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const cx = layer.x;
  const cy = layer.y * aspect;
  return (
    [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ] as [number, number][]
  ).map(([px, py]) => [cx + px * c - py * s, (cy + px * s + py * c) / aspect]);
}

export const SAFE_MARGIN = 0.03;

export type BoundsStatus = 'inside' | 'outside-safe' | 'clipped';

/** 'clipped' = part of the artwork leaves the printable zone (it will be cut off). */
export function layerBoundsStatus(
  layer: Layer,
  zone: PrintZone,
  measureTextWidth?: (l: Layer) => number,
): BoundsStatus {
  const pts = layerCorners(layer, zone, measureTextWidth);
  const out = (lo: number, hi: number) => pts.some(([x, y]) => x < lo || x > hi || y < lo || y > hi);
  if (out(-1e-6, 1 + 1e-6)) return 'clipped';
  if (out(SAFE_MARGIN, 1 - SAFE_MARGIN)) return 'outside-safe';
  return 'inside';
}

/** Customisation is only offered when the model has a print profile whose mapping was verified. */
export function isCustomizable(cfg: ModelConfig): boolean {
  return cfg.printZones.length > 0 && cfg.printableMeshes.length > 0 && cfg.mappingVerified;
}
