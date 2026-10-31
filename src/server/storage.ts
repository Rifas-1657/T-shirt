// File-backed persistence for local development and single-node deployments.
// Every write goes to a temp file and is renamed into place, so readers never see a half-written
// catalogue (this is what makes "publish" atomic). A hosted deployment would swap this module for
// a database + object storage (see docs/SETUP.md, "Production storage").
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { classifyGarment, isGarmentCategory, templateModelConfig } from '@/lib/garments';
import { perfumeModelConfig } from '@/lib/perfume';
import type { GarmentCategory, Product, PublicProduct, SavedDesign } from '@/lib/types';

// runtime data lives outside the bundle; tell Turbopack not to trace it
export const DATA_DIR = path.resolve(/* turbopackIgnore: true */ process.env.ATELIER_DATA_DIR ?? path.join(/* turbopackIgnore: true */ process.cwd(), 'data'));
export const PATHS = {
  products: path.join(DATA_DIR, 'db', 'products.json'),
  designs: path.join(DATA_DIR, 'db', 'designs'),
  originals: path.join(DATA_DIR, 'private', 'originals'), // never served
  models: path.join(DATA_DIR, 'models'), // derivatives, served only when published (or to admins)
  uploads: path.join(DATA_DIR, 'uploads'), // validated customer/admin artwork
  previews: path.join(DATA_DIR, 'previews'),
};

export function newId(prefix = ''): string {
  return prefix + crypto.randomBytes(12).toString('base64url');
}

export async function atomicWrite(file: string, data: string | Buffer): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

/** Resolve a storage key inside a root, refusing path traversal. */
export function safeJoin(root: string, ...parts: string[]): string {
  const p = path.resolve(root, ...parts);
  if (p !== root && !p.startsWith(root + path.sep)) throw new Error('path escapes storage root');
  return p;
}

// Serialise catalogue mutations in-process so concurrent admin requests cannot interleave.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

/**
 * Normalises stored products: legacy rows get a garment category (inferred from their text,
 * otherwise half-sleeve), and template-based versions always resolve to the current template of
 * the product's category, so template upgrades and category overrides apply without data edits.
 */
export function normalizeProduct(p: Product): Product {
  const garment: GarmentCategory = isGarmentCategory(p.garment) ? p.garment : (classifyGarment(p.title, p.description, p.category) ?? 'half-sleeve');
  if (p.kind === 'perfume' && p.perfume) {
    // perfume versions always use the current bottle template of the chosen style
    const perfume = p.perfume;
    return { ...p, garment, versions: p.versions.map((v) => (v.pathway === 'perfume' ? { ...v, modelConfig: perfumeModelConfig(perfume.bottle) } : v)) };
  }
  return {
    ...p,
    kind: 'apparel',
    garment,
    versions: p.versions.map((v) =>
      v.modelConfig.source === 'template' ? { ...v, templateId: garment, modelConfig: templateModelConfig(garment) } : v,
    ),
  };
}

export async function readProducts(): Promise<Product[]> {
  try {
    return (JSON.parse(await fs.readFile(/* turbopackIgnore: true */ PATHS.products, 'utf8')) as Product[]).map(normalizeProduct);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
}

export function mutateProducts<T>(fn: (products: Product[]) => T | Promise<T>): Promise<T> {
  return serial(async () => {
    const products = await readProducts();
    const result = await fn(products);
    await atomicWrite(PATHS.products, JSON.stringify(products, null, 2));
    return result;
  });
}

export function toPublic(p: Product): PublicProduct | null {
  if (!p.active || !p.liveVersionId) return null;
  const v = p.versions.find((x) => x.id === p.liveVersionId);
  if (!v || v.status !== 'published') return null;
  return {
    id: p.id,
    sku: p.sku,
    title: p.title,
    description: p.description,
    category: p.category,
    kind: p.kind ?? 'apparel',
    perfume: p.kind === 'perfume' ? p.perfume : undefined,
    photos: p.photos?.length ? p.photos : undefined,
    garment: p.garment,
    price: p.price,
    currency: p.currency,
    sizes: p.sizes,
    colors: p.colors,
    stock: p.stock,
    version: { id: v.id, pathway: v.pathway, modelConfig: v.modelConfig, baseArtwork: v.baseArtwork, baseLayers: v.baseLayers, previewUrl: v.previewUrl },
  };
}

export async function publicCatalogue(): Promise<PublicProduct[]> {
  return (await readProducts()).map(toPublic).filter((p): p is PublicProduct => p !== null);
}

export async function publicProduct(id: string): Promise<PublicProduct | null> {
  const p = (await readProducts()).find((x) => x.id === id);
  return p ? toPublic(p) : null;
}

export async function saveDesign(d: SavedDesign): Promise<void> {
  await atomicWrite(safeJoin(PATHS.designs, `${d.id}.json`), JSON.stringify(d, null, 2));
}

export async function loadDesign(id: string): Promise<SavedDesign | null> {
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(id)) return null;
  try {
    return JSON.parse(await fs.readFile(safeJoin(PATHS.designs, `${id}.json`), 'utf8')) as SavedDesign;
  } catch {
    return null;
  }
}
