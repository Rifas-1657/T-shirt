// Validation and (de)serialisation of versioned design JSON. Used by the client before saving
// and again on the server, which never trusts the client copy.
import { DESIGN_SCHEMA_VERSION, type Design, type FontKey, type Layer, type PublicProduct, type ZoneId } from './types';

export const LIMITS = {
  maxLayersPerZone: 24,
  maxTextLength: 120,
  minScale: 0.05,
  maxScale: 8,
};

const FONTS: FontKey[] = ['serif', 'sans', 'mono'];
const HEX = /^#[0-9a-fA-F]{6}$/;
const UPLOAD_SRC = /^\/api\/uploads\/[a-zA-Z0-9_-]{8,64}$/;

export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const isNum = (n: unknown, lo = -Infinity, hi = Infinity): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;

export function validateLayer(raw: unknown, path: string, errors: string[]): Layer | null {
  if (!raw || typeof raw !== 'object') {
    errors.push(`${path}: not an object`);
    return null;
  }
  const l = raw as Record<string, unknown>;
  const base = {
    id: typeof l.id === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(l.id) ? l.id : null,
    x: isNum(l.x, -1, 2) ? l.x : null,
    y: isNum(l.y, -1, 2) ? l.y : null,
    rotation: isNum(l.rotation, -3600, 3600) ? l.rotation : null,
    scale: isNum(l.scale, LIMITS.minScale, LIMITS.maxScale) ? l.scale : null,
    opacity: isNum(l.opacity, 0, 1) ? l.opacity : null,
  };
  for (const [k, v] of Object.entries(base)) if (v === null) errors.push(`${path}.${k}: invalid`);
  if (Object.values(base).some((v) => v === null)) return null;
  if (l.type === 'image') {
    if (typeof l.src !== 'string' || !UPLOAD_SRC.test(l.src)) errors.push(`${path}.src: must reference a validated upload`);
    if (!isNum(l.width, 0.01, 4)) errors.push(`${path}.width: invalid`);
    if (!isNum(l.aspect, 0.01, 100)) errors.push(`${path}.aspect: invalid`);
    const name = typeof l.name === 'string' ? l.name.slice(0, 80) : 'image';
    if (errors.some((e) => e.startsWith(path))) return null;
    return { ...(base as Omit<Layer, 'type'>), type: 'image', src: l.src as string, width: l.width as number, aspect: l.aspect as number, name } as Layer;
  }
  if (l.type === 'text') {
    if (typeof l.text !== 'string' || l.text.length === 0 || l.text.length > LIMITS.maxTextLength)
      errors.push(`${path}.text: 1-${LIMITS.maxTextLength} characters required`);
    if (!FONTS.includes(l.font as FontKey)) errors.push(`${path}.font: invalid`);
    if (!isNum(l.fontSize, 0.01, 1)) errors.push(`${path}.fontSize: invalid`);
    if (typeof l.fill !== 'string' || !HEX.test(l.fill)) errors.push(`${path}.fill: must be #rrggbb`);
    if (![400, 600, 700].includes(l.weight as number)) errors.push(`${path}.weight: invalid`);
    if (!isNum(l.letterSpacing, -0.2, 1)) errors.push(`${path}.letterSpacing: invalid`);
    if (errors.some((e) => e.startsWith(path))) return null;
    return {
      ...(base as Omit<Layer, 'type'>),
      type: 'text',
      // strip control characters; text is rendered via canvas/Konva, never as HTML
      text: (l.text as string).replace(/[\u0000-\u001f\u007f]/g, ''),
      font: l.font as FontKey,
      fontSize: l.fontSize as number,
      fill: l.fill as string,
      weight: l.weight as 400 | 600 | 700,
      letterSpacing: l.letterSpacing as number,
    } as Layer;
  }
  errors.push(`${path}.type: unknown layer type`);
  return null;
}

/** Validate a design against the published product it claims to customise. */
export function validateDesign(raw: unknown, product: PublicProduct | null): Result<Design> {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['design: not an object'] };
  const d = raw as Record<string, unknown>;
  if (d.schemaVersion !== DESIGN_SCHEMA_VERSION) errors.push(`schemaVersion: expected ${DESIGN_SCHEMA_VERSION}`);
  if (!product) return { ok: false, errors: [...errors, 'productId: product not found or not published'] };
  if (d.productId !== product.id) errors.push('productId: mismatch');
  if (d.productVersionId !== product.version.id) errors.push('productVersionId: design was made for a different model version');
  const color = d.color as { name?: unknown; hex?: unknown } | undefined;
  if (!color || !product.colors.some((c) => c.hex.toLowerCase() === String(color.hex).toLowerCase()))
    errors.push('color: not offered for this product');
  if (typeof d.size !== 'string' || !product.sizes.includes(d.size)) errors.push('size: not offered for this product');
  const zonesRaw = (d.zones ?? {}) as Record<string, unknown>;
  const zoneIds = product.version.modelConfig.printZones.map((z) => z.id);
  const zones = { front: [], back: [] } as Record<ZoneId, Layer[]>;
  for (const key of Object.keys(zonesRaw)) {
    if (!zoneIds.includes(key as ZoneId)) {
      const layers = zonesRaw[key];
      if (Array.isArray(layers) && layers.length) errors.push(`zones.${key}: this product has no ${key} print zone`);
      continue;
    }
    const layers = zonesRaw[key];
    if (!Array.isArray(layers)) {
      errors.push(`zones.${key}: must be an array`);
      continue;
    }
    if (layers.length > LIMITS.maxLayersPerZone) errors.push(`zones.${key}: at most ${LIMITS.maxLayersPerZone} layers`);
    layers.slice(0, LIMITS.maxLayersPerZone).forEach((l, i) => {
      const v = validateLayer(l, `zones.${key}[${i}]`, errors);
      if (v) zones[key as ZoneId].push(v);
    });
  }
  if (errors.length) return { ok: false, errors };
  const match = product.colors.find((c) => c.hex.toLowerCase() === String(color!.hex).toLowerCase())!;
  return {
    ok: true,
    value: {
      schemaVersion: DESIGN_SCHEMA_VERSION,
      productId: product.id,
      productVersionId: product.version.id,
      modelUrl: product.version.modelConfig.modelUrl,
      textureConfigVersion: 1,
      color: match,
      size: d.size as string,
      zones,
    },
  };
}

export function emptyDesign(product: PublicProduct): Design {
  return {
    schemaVersion: DESIGN_SCHEMA_VERSION,
    productId: product.id,
    productVersionId: product.version.id,
    modelUrl: product.version.modelConfig.modelUrl,
    textureConfigVersion: 1,
    color: product.colors[0],
    size: product.sizes[Math.min(2, product.sizes.length - 1)] ?? product.sizes[0],
    zones: { front: [], back: [] },
  };
}
