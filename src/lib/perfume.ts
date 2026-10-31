// Perfume products: bottle templates (built by scripts/blender/build_bottles.py), finishes and
// validation. Perfumes are presented, not customised: their versions have no print zones.
import bottles from './perfume/bottles.json';
import type { BottleStyle, CapFinish, ModelConfig, PerfumeSpec } from './types';

export const BOTTLES = bottles as unknown as Record<BottleStyle, { id: BottleStyle; label: string; blurb: string; height: number; width: number; labelSize: [number, number]; capTrim: boolean }>;
export const BOTTLE_STYLES: BottleStyle[] = ['qasr', 'ward', 'majlis'];

export const CAP_FINISHES: Record<CapFinish, { label: string; color: string; metal: number; rough: number }> = {
  gold: { label: 'Gold', color: '#d2b06a', metal: 1, rough: 0.22 },
  'rose-gold': { label: 'Rose gold', color: '#d9a08b', metal: 1, rough: 0.24 },
  silver: { label: 'Silver', color: '#d9dadc', metal: 1, rough: 0.18 },
  onyx: { label: 'Onyx', color: '#141213', metal: 0.2, rough: 0.12 },
};

export const CONCENTRATIONS = ['Extrait de Parfum', 'Parfum', 'Eau de Parfum', 'Eau de Toilette', 'Perfume Oil'] as const;

export const LIQUID_PRESETS: { name: string; hex: string }[] = [
  { name: 'Amber oud', hex: '#8a4a12' },
  { name: 'Taif rose', hex: '#e39aa8' },
  { name: 'Ruby', hex: '#7a0f24' },
  { name: 'Saffron', hex: '#d68a1c' },
  { name: 'Pearl', hex: '#f1e8da' },
  { name: 'Smoke', hex: '#5b4a46' },
];

export const DEFAULT_PERFUME: PerfumeSpec = {
  bottle: 'qasr',
  liquid: '#8a4a12',
  cap: 'gold',
  volumeMl: 100,
  concentration: 'Eau de Parfum',
  family: 'Oriental · Woody',
  notes: { top: ['Saffron', 'Bergamot'], heart: ['Damask rose', 'Oud'], base: ['Amber', 'Musk', 'Sandalwood'] },
};

export const isBottleStyle = (v: unknown): v is BottleStyle => typeof v === 'string' && (BOTTLE_STYLES as string[]).includes(v);

export function perfumeModelConfig(bottle: BottleStyle): ModelConfig {
  return {
    modelUrl: `/models/perfume/${bottle}.glb`,
    source: 'template',
    printableMeshes: [],
    colorableMaterials: [],
    printZones: [], // perfumes are not customisable
    scale: 1,
    hangOffset: [0, 0, 0],
    rotationY: 0,
    centerDrop: BOTTLES[bottle].height / 2,
    mappingVerified: false,
    atlasSize: [1024, 512],
  };
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const noteList = (v: unknown) =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [])
    .map((s) => String(s).trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((s) => s.slice(0, 30));

/** Validates/normalises an admin-supplied perfume spec; returns errors for anything unusable. */
export function validatePerfumeSpec(raw: unknown): { spec: PerfumeSpec; errors: string[] } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  const bottle = isBottleStyle(r.bottle) ? r.bottle : (errors.push('Choose a bottle style.'), DEFAULT_PERFUME.bottle);
  const liquid = typeof r.liquid === 'string' && HEX.test(r.liquid) ? r.liquid.toLowerCase() : (errors.push('Liquid colour must be #rrggbb.'), DEFAULT_PERFUME.liquid);
  const cap = typeof r.cap === 'string' && r.cap in CAP_FINISHES ? (r.cap as CapFinish) : (errors.push('Choose a cap finish.'), DEFAULT_PERFUME.cap);
  const volumeMl = Number(r.volumeMl);
  if (!Number.isInteger(volumeMl) || volumeMl < 5 || volumeMl > 500) errors.push('Volume must be a whole number of ml between 5 and 500.');
  const concentration = typeof r.concentration === 'string' && (CONCENTRATIONS as readonly string[]).includes(r.concentration) ? r.concentration : (errors.push('Choose a concentration.'), DEFAULT_PERFUME.concentration);
  const family = typeof r.family === 'string' ? r.family.trim().slice(0, 40) : '';
  const n = (r.notes ?? {}) as Record<string, unknown>;
  const notes = { top: noteList(n.top), heart: noteList(n.heart), base: noteList(n.base) };
  if (!notes.top.length && !notes.heart.length && !notes.base.length) errors.push('Add at least one fragrance note.');
  return { spec: { bottle, liquid, cap, volumeMl: Number.isInteger(volumeMl) ? volumeMl : DEFAULT_PERFUME.volumeMl, concentration, family, notes }, errors };
}

/** Human name for a liquid colour (used as the product's single "colour"). */
export function liquidName(hex: string): string {
  return LIQUID_PRESETS.find((p) => p.hex === hex.toLowerCase())?.name ?? 'Signature';
}
