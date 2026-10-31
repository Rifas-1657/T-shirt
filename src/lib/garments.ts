// Garment categories, their racks and their Blender-built templates.
// Print zones, mesh names and framing come from the JSON sidecars written by
// scripts/blender/build_garment.py, so the app never duplicates those numbers by hand.
import fullSleeve from './garment-templates/full-sleeve.json';
import halfSleeve from './garment-templates/half-sleeve.json';
import hoodie from './garment-templates/hoodie.json';
import oversized from './garment-templates/oversized.json';
import type { GarmentCategory, ModelConfig, PrintZone } from './types';

export interface TemplateMeta {
  id: GarmentCategory;
  label: string;
  version: number;
  printableMeshes: string[];
  colorableMaterials: string[];
  printZones: PrintZone[];
  /** Garment body size in three.js axes (x width, y height, z depth), metres. */
  size: [number, number, number];
  centerDrop: number;
  simulated: boolean;
  triangles: number;
  /** UV atlas mapping: v = (z - z0) / span; front u = 0.5 * (x / span + 0.5). */
  span: number;
  z0: number;
}

/**
 * Body geometry of each template in garment metres (hem at z = 0), taken from the outlines in
 * scripts/blender/build_garment.py. Used to place artwork measured on a product photo at the same
 * physical spot on the 3D garment.
 */
export const BODY_GEOMETRY: Record<GarmentCategory, { topZ: number; bodyWidth: number }> = {
  'half-sleeve': { topZ: 0.722, bodyWidth: 0.516 },
  'full-sleeve': { topZ: 0.722, bodyWidth: 0.516 },
  oversized: { topZ: 0.798, bodyWidth: 0.6 },
  hoodie: { topZ: 0.8, bodyWidth: 0.57 },
};

export const TEMPLATES = {
  'half-sleeve': halfSleeve,
  'full-sleeve': fullSleeve,
  oversized,
  hoodie,
} as unknown as Record<GarmentCategory, TemplateMeta>;

export const CATEGORY_INFO: Record<GarmentCategory, { label: string; plural: string; blurb: string }> = {
  'half-sleeve': { label: 'Half-sleeve tee', plural: 'Half-sleeve tees', blurb: 'Classic crew necks, regular fit' },
  'full-sleeve': { label: 'Full-sleeve tee', plural: 'Full-sleeve tees', blurb: 'Long sleeves with rib cuffs' },
  oversized: { label: 'Oversized tee', plural: 'Oversized tees', blurb: 'Dropped shoulders, boxy heavyweight' },
  hoodie: { label: 'Hoodie', plural: 'Hoodies', blurb: 'Brushed fleece, kangaroo pocket' },
};

export const RACK_ORDER: GarmentCategory[] = ['half-sleeve', 'full-sleeve', 'oversized', 'hoodie'];

export function isGarmentCategory(v: unknown): v is GarmentCategory {
  return typeof v === 'string' && v in TEMPLATES;
}

export const templateUrl = (c: GarmentCategory) => `/models/garments/${c}-v${TEMPLATES[c].version}.glb`;

export function templateModelConfig(c: GarmentCategory): ModelConfig {
  const t = TEMPLATES[c];
  return {
    modelUrl: templateUrl(c),
    source: 'template',
    printableMeshes: t.printableMeshes,
    colorableMaterials: t.colorableMaterials,
    printZones: t.printZones,
    scale: 1,
    hangOffset: [0, 0, 0],
    rotationY: 0,
    centerDrop: t.centerDrop,
    // verified for every template by tests/unit/garments.test.ts (UV coverage) and
    // tests/e2e (asymmetric FRONT LEFT / BACK CENTER screenshots)
    mappingVerified: true,
    atlasSize: [2048, 1024],
  };
}

const RULES: [GarmentCategory, RegExp][] = [
  ['hoodie', /\b(hood(ie|y|ed)?|sweat ?shirt|pullover|zip[- ]?up)\b/i],
  ['oversized', /\b(over[- ]?sized?|boxy|drop(ped)?[- ]shoulder|relaxed fit|loose fit)\b/i],
  ['full-sleeve', /\b(full[- ]?sleeves?|long[- ]?sleeved?|l\/s|longsleeve)\b/i],
  ['half-sleeve', /\b(half[- ]?sleeves?|short[- ]?sleeved?|s\/s|tee|t-?shirt|crew)\b/i],
];

const PERFUME_RE = /\b(perfumes?|parfums?|eau de|edp|edt|extrait|fragrances?|cologne|attar|ittar|bakhoor|oud oil|musk oil)\b/i;

/** Like classifyGarment, but also recognises perfumes ("Oud Royale Eau de Parfum"). */
export function classifyProduct(title?: string, ...rest: (string | undefined)[]): GarmentCategory | 'perfume' | null {
  for (const text of [title ?? '', rest.filter(Boolean).join(' ')]) if (PERFUME_RE.test(text)) return 'perfume';
  return classifyGarment(title, ...rest);
}

/**
 * Suggests a category from product text. The title decides when it names a garment type; the
 * description/category are only consulted when it does not (so "Crew Tee … slightly boxy" stays a
 * half-sleeve tee). Within one text, rule order matters: "oversized hoodie" is a hoodie,
 * "long sleeve tee" is full-sleeve. Returns null when nothing matches (the admin must choose).
 */
export function classifyGarment(title?: string, ...rest: (string | undefined)[]): GarmentCategory | null {
  for (const text of [title ?? '', rest.filter(Boolean).join(' ')]) {
    for (const [cat, re] of RULES) if (re.test(text)) return cat;
  }
  return null;
}
