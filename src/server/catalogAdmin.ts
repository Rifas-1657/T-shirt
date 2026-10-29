// Admin-side catalogue operations. Uploads never touch a product's live version: they create a
// new version that must validate and then be explicitly published (an atomic pointer swap).
import { promises as fs } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { isValidUvRect } from '@/lib/printZones';
import { validateLayer } from '@/lib/designSchema';
import { BODY_GEOMETRY, CATEGORY_INFO, classifyGarment, isGarmentCategory, TEMPLATES, templateModelConfig } from '@/lib/garments';
import { colorName } from './garmentPhoto';
import { zoneAspect } from '@/lib/printZones';
import type { GarmentCategory, ImageLayer, Layer, ModelConfig, PrintZone, Product, ProductColor, ProductVersion, ValidationIssue, ZoneId } from '@/lib/types';
import { buildDerivative, checkPrintProfile, inspectGlb, suggestTransform } from './glbValidate';
import { atomicWrite, mutateProducts, newId, PATHS, safeJoin } from './storage';

export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

export class AdminError extends Error {
  constructor(
    public status: number,
    public errors: string[],
  ) {
    super(errors.join('; '));
  }
}

export interface ProductInput {
  title?: unknown;
  sku?: unknown;
  description?: unknown;
  category?: unknown;
  price?: unknown;
  currency?: unknown;
  active?: unknown;
  sizes?: unknown;
  colors?: unknown;
  stock?: unknown;
  garment?: unknown;
}

export function validateProductInput(input: ProductInput, existing: Product[], selfId?: string, partial = false) {
  const errors: string[] = [];
  const out: Partial<Product> = {};
  const has = (k: keyof ProductInput) => input[k] !== undefined || !partial;
  if (has('title')) {
    if (typeof input.title !== 'string' || input.title.trim().length < 2 || input.title.length > 80) errors.push('Title must be 2-80 characters.');
    else out.title = input.title.trim();
  }
  if (has('sku')) {
    if (typeof input.sku !== 'string' || !/^[A-Za-z0-9-]{3,32}$/.test(input.sku)) errors.push('SKU must be 3-32 letters, digits or dashes.');
    else if (existing.some((p) => p.sku.toLowerCase() === (input.sku as string).toLowerCase() && p.id !== selfId)) errors.push('SKU is already used by another product.');
    else out.sku = input.sku.toUpperCase();
  }
  if (has('description')) {
    if (typeof input.description !== 'string' || input.description.length > 600) errors.push('Description must be at most 600 characters.');
    else out.description = input.description.trim();
  }
  if (has('category')) {
    if (typeof input.category !== 'string' || input.category.length < 2 || input.category.length > 40) errors.push('Category must be 2-40 characters.');
    else out.category = input.category.trim();
  }
  if (has('price')) {
    const n = Number(input.price);
    if (!Number.isFinite(n) || n < 0 || n > 100000) errors.push('Price must be a number between 0 and 100000.');
    else out.price = Math.round(n * 100) / 100;
  }
  if (input.currency !== undefined) {
    if (typeof input.currency !== 'string' || !/^[A-Z]{3}$/.test(input.currency)) errors.push('Currency must be a 3-letter ISO code.');
    else out.currency = input.currency;
  } else if (!partial) out.currency = 'USD';
  if (input.active !== undefined) out.active = Boolean(input.active);
  else if (!partial) out.active = false;
  if (has('sizes')) {
    if (!Array.isArray(input.sizes) || !input.sizes.length || input.sizes.some((s) => !SIZES.includes(s as string))) errors.push(`Sizes must be a non-empty subset of ${SIZES.join(', ')}.`);
    else out.sizes = SIZES.filter((s) => (input.sizes as string[]).includes(s));
  }
  if (has('colors')) {
    const cs = input.colors as ProductColor[];
    if (!Array.isArray(cs) || !cs.length || cs.length > 12 || cs.some((c) => !c || typeof c.name !== 'string' || !c.name.trim() || c.name.length > 30 || !/^#[0-9a-fA-F]{6}$/.test(c.hex)))
      errors.push('Colours: 1-12 entries, each with a name (max 30 chars) and #rrggbb hex.');
    else out.colors = cs.map((c) => ({ name: c.name.trim(), hex: c.hex.toLowerCase() }));
  }
  if (input.stock !== undefined && input.stock !== null) {
    const st = input.stock as Record<string, unknown>;
    if (typeof st !== 'object' || Object.entries(st).some(([k, v]) => !SIZES.includes(k) || !Number.isInteger(v) || (v as number) < 0)) errors.push('Stock must map sizes to non-negative integers.');
    else out.stock = st as Record<string, number>;
  }
  if (input.garment !== undefined && input.garment !== null && input.garment !== '') {
    if (!isGarmentCategory(input.garment)) errors.push('Garment category must be half-sleeve, full-sleeve, oversized or hoodie.');
    else out.garment = input.garment;
  } else if (!partial) {
    // automatic classification from the product text; the admin can override it at any time
    const guess = classifyGarment(out.title, out.description, out.category);
    if (guess) out.garment = guess;
    else errors.push('Choose a garment category (the title/description did not identify one).');
  }
  if (errors.length) throw new AdminError(422, errors);
  return out;
}

export async function createProduct(input: ProductInput): Promise<Product> {
  return mutateProducts((products) => {
    const fields = validateProductInput(input, products);
    const now = new Date().toISOString();
    const p: Product = {
      id: newId('p_'),
      sku: fields.sku!,
      title: fields.title!,
      description: fields.description ?? '',
      category: fields.category!,
      garment: fields.garment!,
      price: fields.price!,
      currency: fields.currency ?? 'USD',
      active: fields.active ?? false,
      sizes: fields.sizes!,
      colors: fields.colors!,
      stock: fields.stock,
      liveVersionId: null,
      versions: [],
      createdAt: now,
      updatedAt: now,
    };
    products.push(p);
    return p;
  });
}

function find(products: Product[], id: string): Product {
  const p = products.find((x) => x.id === id);
  if (!p) throw new AdminError(404, ['Product not found.']);
  return p;
}

export async function updateProduct(id: string, input: ProductInput): Promise<Product> {
  return mutateProducts((products) => {
    const p = find(products, id);
    Object.assign(p, validateProductInput(input, products, id, true), { updatedAt: new Date().toISOString() });
    return p;
  });
}

export interface ProfileInput {
  printableMeshes?: unknown;
  colorableMaterials?: unknown;
  printZones?: unknown;
  scale?: unknown;
  hangOffset?: unknown;
  rotationY?: unknown;
  mappingVerified?: unknown;
}

function parseZones(raw: unknown): PrintZone[] {
  if (!Array.isArray(raw)) return [];
  const zones: PrintZone[] = [];
  for (const z of raw as Record<string, unknown>[]) {
    if (!z || (z.id !== 'front' && z.id !== 'back')) throw new AdminError(422, ['Print zone id must be "front" or "back".']);
    const r = z.uvRect as Record<string, unknown>;
    const uvRect = { u0: Number(r?.u0), v0: Number(r?.v0), u1: Number(r?.u1), v1: Number(r?.v1) };
    if (!isValidUvRect(uvRect)) throw new AdminError(422, [`Print zone ${z.id}: UV rectangle must satisfy 0 <= u0 < u1 <= 1 and 0 <= v0 < v1 <= 1.`]);
    const widthCm = Number(z.widthCm);
    const heightCm = Number(z.heightCm);
    if (!(widthCm > 0 && widthCm < 200 && heightCm > 0 && heightCm < 200)) throw new AdminError(422, [`Print zone ${z.id}: physical size must be 1-200 cm.`]);
    if (zones.some((x) => x.id === z.id)) throw new AdminError(422, [`Duplicate print zone ${z.id}.`]);
    zones.push({ id: z.id as ZoneId, label: z.id === 'front' ? 'Front' : 'Back', uvRect, widthCm, heightCm });
  }
  return zones;
}

function applyProfile(cfg: ModelConfig, input: ProfileInput): ModelConfig {
  const next = { ...cfg };
  const strList = (v: unknown, what: string) => {
    if (!Array.isArray(v) || v.some((s) => typeof s !== 'string' || s.length > 120)) throw new AdminError(422, [`${what} must be a list of names.`]);
    return v as string[];
  };
  if (input.printableMeshes !== undefined) next.printableMeshes = strList(input.printableMeshes, 'Printable meshes');
  if (input.colorableMaterials !== undefined) next.colorableMaterials = strList(input.colorableMaterials, 'Colourable materials');
  if (input.printZones !== undefined) next.printZones = parseZones(input.printZones);
  if (input.scale !== undefined) {
    const s = Number(input.scale);
    if (!(s > 0 && s < 1000)) throw new AdminError(422, ['Scale must be a positive number.']);
    next.scale = s;
  }
  if (input.rotationY !== undefined) {
    const r = Number(input.rotationY);
    if (!Number.isFinite(r)) throw new AdminError(422, ['Rotation must be a number (radians).']);
    next.rotationY = r;
  }
  if (input.hangOffset !== undefined) {
    const h = input.hangOffset as unknown[];
    if (!Array.isArray(h) || h.length !== 3 || h.some((n) => !Number.isFinite(Number(n)))) throw new AdminError(422, ['Hang offset must be [x, y, z].']);
    next.hangOffset = h.map(Number) as [number, number, number];
  }
  // any profile change invalidates a previous mapping confirmation unless re-confirmed in the same request
  const changed = ['printableMeshes', 'printZones'].some((k) => input[k as keyof ProfileInput] !== undefined);
  if (input.mappingVerified !== undefined) next.mappingVerified = Boolean(input.mappingVerified);
  else if (changed) next.mappingVerified = false;
  return next;
}

const io = async () => {
  await MeshoptDecoder.ready;
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
};

/** GLB pathway: validate, store original privately, build derivative, record a new version. */
export async function addGlbVersion(productId: string, bytes: Uint8Array, profile: ProfileInput): Promise<ProductVersion> {
  // existence check up front so we don't store files for unknown products
  await mutateProducts((products) => find(products, productId));
  const versionId = newId('v_');
  const check = await inspectGlb(bytes);
  const version: ProductVersion = {
    id: versionId,
    createdAt: new Date().toISOString(),
    status: 'validating',
    pathway: 'glb',
    issues: [...check.issues],
    report: check.report,
    modelConfig: {
      modelUrl: `/api/models/${productId}/${versionId}`,
      source: 'upload',
      printableMeshes: [],
      colorableMaterials: [],
      printZones: [],
      scale: 1,
      hangOffset: [0, 0, 0],
      rotationY: 0,
      centerDrop: 0.4,
      mappingVerified: false,
      atlasSize: [2048, 1024],
    },
  };
  if (check.ok && check.report && check.doc) {
    const originalKey = `${productId}/${versionId}.glb`;
    await atomicWrite(safeJoin(PATHS.originals, originalKey), Buffer.from(bytes));
    version.originalKey = originalKey;
    Object.assign(version.modelConfig, suggestTransform(check.report));
    // default: colour every material, print nothing until the admin defines a verified profile
    version.modelConfig.colorableMaterials = check.report.materials;
    try {
      version.modelConfig = applyProfile(version.modelConfig, { ...profile, mappingVerified: false });
      version.issues.push(...checkPrintProfile(check.doc, check.report, version.modelConfig.printableMeshes, version.modelConfig.printZones));
    } catch (e) {
      if (!(e instanceof AdminError)) throw e;
      version.issues.push(...e.errors.map((m): ValidationIssue => ({ level: 'error', code: 'profile_invalid', message: m })));
    }
    try {
      const derivative = await buildDerivative(check.doc);
      await atomicWrite(safeJoin(PATHS.models, productId, `${versionId}.glb`), Buffer.from(derivative));
      version.derivativeBytes = derivative.byteLength;
    } catch (e) {
      version.issues.push({ level: 'error', code: 'derivative_failed', message: `Could not create the web derivative: ${(e as Error).message}` });
    }
  }
  version.status = version.issues.some((i) => i.level === 'error') ? 'failed' : 'validated';
  await mutateProducts((products) => {
    const p = find(products, productId);
    p.versions.push(version);
    p.updatedAt = new Date().toISOString();
  });
  return version;
}

export interface UploadedArtwork {
  url: string;
  width: number;
  height: number;
  /** Set when the artwork was cut out of a garment photo: where the print sat on that garment. */
  placement?: { centerX: number; widthOfBody: number; topOfGarment: number; heightOfGarment: number };
}

export interface SideInput {
  /** Print artwork for this side (absent = the side is plain). */
  artwork?: UploadedArtwork;
  /** The original upload, kept for reference in the admin. */
  sourceUrl: string;
  kind: 'garment-photo' | 'artwork';
  garmentColor?: string;
  notes: string[];
}

/** Default placement: centred horizontally in the upper part of the zone, contain-fitted to 80 % of it. */
export function defaultArtworkLayer(zone: PrintZone, art: UploadedArtwork, zoneId: ZoneId): ImageLayer {
  const aspect = art.height / art.width;
  const width = Math.min(0.8, (0.8 * zoneAspect(zone)) / aspect);
  const h = (width * aspect) / zoneAspect(zone);
  return { id: `base-${zoneId}`, type: 'image', src: art.url, width, aspect, name: `${zoneId} artwork`, x: 0.5, y: Math.min(0.5, Math.max(h / 2 + 0.06, 0.4)), rotation: 0, scale: 1, opacity: 1 };
}

/**
 * Places artwork cut out of a garment photo at the same physical spot on the template: the photo
 * measurement (fractions of body width / garment height) is converted to metres with the template's
 * body geometry, then into the zone's normalised editor space. Prints that would leave the printable
 * area are scaled/moved to fit, with a warning.
 */
export function photoArtworkLayer(cat: GarmentCategory, zone: PrintZone, art: UploadedArtwork, zoneId: ZoneId): { layer: ImageLayer; issues: ValidationIssue[] } {
  const p = art.placement!;
  const t = TEMPLATES[cat];
  const g = BODY_GEOMETRY[cat];
  const issues: ValidationIssue[] = [];
  const zoneW = (zone.uvRect.u1 - zone.uvRect.u0) * 2 * t.span;
  const zTop = zone.uvRect.v1 * t.span + t.z0;
  const zBot = zone.uvRect.v0 * t.span + t.z0;
  const zoneH = zTop - zBot;
  const aspect = art.height / art.width;
  const designW = p.widthOfBody * g.bodyWidth;
  const centerZ = g.topZ - (p.topOfGarment + p.heightOfGarment / 2) * g.topZ;
  let width = designW / zoneW;
  let x = 0.5 + (p.centerX * g.bodyWidth) / zoneW;
  let y = (zTop - centerZ) / zoneH;
  const hFrac = () => (width * aspect) / zoneAspect(zone);
  const fit = Math.min(1, 0.96 / width, 0.96 / hFrac());
  if (fit < 1) {
    width *= fit;
    issues.push({ level: 'warning', code: 'print_scaled', message: `The ${zoneId} print is larger than the ${CATEGORY_INFO[cat].label.toLowerCase()} print area; it was scaled to ${Math.round(fit * 100)}% to fit. Adjust it in the placement controls if needed.` });
  }
  const half = { w: width / 2, h: hFrac() / 2 };
  const cx = Math.min(1 - half.w, Math.max(half.w, x));
  const cy = Math.min(1 - half.h, Math.max(half.h, y));
  if (Math.abs(cx - x) > 0.02 || Math.abs(cy - y) > 0.02)
    issues.push({ level: 'warning', code: 'print_moved', message: `The ${zoneId} print sat partly outside the print area on the photo; it was moved inside.` });
  x = cx;
  y = cy;
  issues.push({ level: 'info', code: 'print_from_photo', message: `${zoneId}: print cut out of the garment photo and placed ${Math.round(designW * 100)} cm wide, where it sat on the photographed garment.` });
  return { layer: { id: `base-${zoneId}`, type: 'image', src: art.url, width, aspect, name: `${zoneId} print`, x, y, rotation: 0, scale: 1, opacity: 1 }, issues };
}

/** Print-resolution check: below ~120 dpi at the placed size the print will look soft. */
export function artworkDpiIssues(zone: PrintZone, layer: ImageLayer, pixelWidth: number, zoneId: ZoneId): ValidationIssue[] {
  const inches = (zone.widthCm * layer.width * layer.scale) / 2.54;
  const dpi = pixelWidth / inches;
  if (dpi < 120)
    return [{ level: 'warning', code: 'low_resolution', message: `${zoneId} print is about ${Math.round(dpi)} dpi at its size (150+ recommended). It will look fine on screen; upload a larger image for production printing.` }];
  return [{ level: 'info', code: 'resolution', message: `${zoneId} print is about ${Math.round(dpi)} dpi at its size.` }];
}

const UNAPPROVED: ValidationIssue = {
  level: 'warning',
  code: 'artwork_unapproved',
  message: 'Check the front and back in the 3D preview, then tick the check box and press “Publish”.',
};

/**
 * Image-only pathway: front/back photos or artwork mapped onto the product category's garment template.
 * Garment photos are analysed (fabric colour + print cut-out); plain sides stay plain.
 */
export async function addTemplateImageVersion(productId: string, sides: Partial<Record<ZoneId, SideInput>>): Promise<ProductVersion> {
  if (!sides.front && !sides.back) throw new AdminError(422, ['Upload at least a front or a back image.']);
  return mutateProducts((products) => {
    const p = find(products, productId);
    const cfg = templateModelConfig(p.garment);
    const baseLayers: Partial<Record<ZoneId, Layer[]>> = { front: [], back: [] };
    const issues: ValidationIssue[] = [
      {
        level: 'info',
        code: 'template_approximation',
        message: `Shown on the ${CATEGORY_INFO[p.garment].label.toLowerCase()} 3D template (this product’s rack). Photos cannot reconstruct the garment’s exact 3D shape.`,
      },
    ];
    for (const zoneId of ['front', 'back'] as const) {
      const side = sides[zoneId];
      if (!side) continue;
      for (const n of side.notes) issues.push({ level: 'info', code: 'photo_analysis', message: `${zoneId}: ${n}` });
      const art = side.artwork;
      if (!art) continue;
      const zone = cfg.printZones.find((z) => z.id === zoneId);
      if (!zone) {
        issues.push({ level: 'error', code: 'zone_missing', message: `The ${p.garment} template has no ${zoneId} print area.` });
        continue;
      }
      let layer: ImageLayer;
      if (art.placement) {
        const placed = photoArtworkLayer(p.garment, zone, art, zoneId);
        layer = placed.layer;
        issues.push(...placed.issues);
      } else layer = defaultArtworkLayer(zone, art, zoneId);
      baseLayers[zoneId] = [layer];
      issues.push(...artworkDpiIssues(zone, layer, art.width, zoneId));
    }
    // base colour from the photo: becomes the product's first (default) colour
    const measured = sides.front?.garmentColor ?? sides.back?.garmentColor;
    if (measured) {
      const near = p.colors.find((c) => colorDistance(c.hex, measured) < 28);
      const color = near ?? { name: colorName(measured), hex: measured };
      p.colors = [color, ...p.colors.filter((c) => c !== near && c.hex !== color.hex)].slice(0, 12);
      issues.push({ level: 'info', code: 'base_color', message: `Base colour set to ${color.name} (${color.hex}), measured from the photo. Other colours stay available.` });
    }
    issues.push(UNAPPROVED);
    const version: ProductVersion = {
      id: newId('v_'),
      createdAt: new Date().toISOString(),
      status: issues.some((i) => i.level === 'error') ? 'failed' : 'validated',
      pathway: 'template-images',
      templateId: p.garment,
      modelConfig: cfg,
      baseLayers,
      sourceImages: { front: sides.front?.sourceUrl, back: sides.back?.sourceUrl },
      artworkApproved: false,
      issues,
    };
    p.versions.push(version);
    p.updatedAt = new Date().toISOString();
    return version;
  });
}

function colorDistance(a: string, b: string) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  return Math.hypot(((pa >> 16) & 255) - ((pb >> 16) & 255), ((pa >> 8) & 255) - ((pb >> 8) & 255), (pa & 255) - (pb & 255));
}

/**
 * Admin adjusts the artwork placement (re-validated like customer layers) and/or approves the mapping.
 * Re-categorising the product resets approval (the artwork now sits on a different template).
 */
export async function updateTemplateArtwork(productId: string, versionId: string, input: { baseLayers?: unknown; artworkApproved?: unknown }): Promise<ProductVersion> {
  return mutateProducts((products) => {
    const p = find(products, productId);
    const v = p.versions.find((x) => x.id === versionId);
    if (!v) throw new AdminError(404, ['Version not found.']);
    if (v.pathway !== 'template-images') throw new AdminError(409, ['Only image-based versions have adjustable artwork.']);
    if (input.baseLayers !== undefined) {
      const raw = (input.baseLayers ?? {}) as Record<string, unknown>;
      const errors: string[] = [];
      const next: Partial<Record<ZoneId, Layer[]>> = {};
      for (const zoneId of ['front', 'back'] as const) {
        const list = raw[zoneId];
        if (list === undefined) continue;
        if (!Array.isArray(list) || list.length > 4) {
          errors.push(`${zoneId}: expected up to 4 layers.`);
          continue;
        }
        next[zoneId] = list.map((l, i) => validateLayer(l, `${zoneId}[${i}]`, errors)).filter((l): l is Layer => !!l);
      }
      if (errors.length) throw new AdminError(422, errors);
      v.baseLayers = { ...v.baseLayers, ...next };
      v.artworkApproved = false; // any placement change needs a fresh approval
    }
    if (input.artworkApproved !== undefined) v.artworkApproved = Boolean(input.artworkApproved);
    v.issues = v.issues.filter((i) => i.code !== 'artwork_unapproved');
    if (!v.artworkApproved) v.issues.push(UNAPPROVED);
    p.updatedAt = new Date().toISOString();
    return v;
  });
}

/** Update a version's print/display profile and re-run the profile checks against the model. */
export async function updateVersionProfile(productId: string, versionId: string, input: ProfileInput): Promise<ProductVersion> {
  let snapshot: ProductVersion | undefined;
  await mutateProducts((products) => {
    snapshot = find(products, productId).versions.find((v) => v.id === versionId);
  });
  if (!snapshot) throw new AdminError(404, ['Version not found.']);
  if (snapshot.status === 'failed' && snapshot.issues.some((i) => i.level === 'error' && i.code !== 'profile_invalid' && !i.code.startsWith('zone_') && !i.code.startsWith('mesh_')))
    throw new AdminError(409, ['This upload failed validation; upload a corrected GLB instead.']);
  const cfg = applyProfile(snapshot.modelConfig, input);
  let issues = snapshot.issues;
  if (snapshot.pathway === 'glb' && snapshot.report) {
    const doc = await (await io()).read(safeJoin(PATHS.models, productId, `${versionId}.glb`));
    const base = snapshot.issues.filter((i) => !['profile_invalid', 'zone_empty', 'zone_invalid', 'zone_coverage', 'mesh_missing', 'mesh_no_uv', 'no_zones', 'no_print_profile', 'mapping_unverified'].includes(i.code));
    issues = [...base, ...checkPrintProfile(doc, snapshot.report, cfg.printableMeshes, cfg.printZones)];
    if (cfg.mappingVerified) issues = issues.filter((i) => i.code !== 'mapping_unverified');
  }
  if (cfg.mappingVerified && (!cfg.printZones.length || issues.some((i) => i.level === 'error')))
    throw new AdminError(422, ['Fix the print profile errors before confirming the mapping test.']);
  return mutateProducts((products) => {
    const v = find(products, productId).versions.find((x) => x.id === versionId)!;
    v.modelConfig = cfg;
    v.issues = issues;
    if (v.status !== 'published') v.status = issues.some((i) => i.level === 'error') ? 'failed' : 'validated';
    return v;
  });
}

export async function setVersionPreview(productId: string, versionId: string, previewUrl: string) {
  return mutateProducts((products) => {
    const v = find(products, productId).versions.find((x) => x.id === versionId);
    if (!v) throw new AdminError(404, ['Version not found.']);
    v.previewUrl = previewUrl;
    return v;
  });
}

/** Atomic publish: the live pointer moves only to a validated version whose files exist. */
export async function publishVersion(productId: string, versionId: string | null): Promise<Product> {
  if (versionId) {
    const products = await mutateProducts((ps) => ps); // read under the lock
    const v = find(products, productId).versions.find((x) => x.id === versionId);
    if (!v) throw new AdminError(404, ['Version not found.']);
    // only uploaded models have a derivative file; built-in templates are served from /models
    if (v.pathway === 'glb' && v.modelConfig.source === 'upload') {
      try {
        await fs.access(safeJoin(PATHS.models, productId, `${versionId}.glb`));
      } catch {
        throw new AdminError(409, ['The model derivative is missing; re-upload the GLB.']);
      }
    }
  }
  return mutateProducts((products) => {
    const p = find(products, productId);
    if (versionId === null) {
      const live = p.versions.find((v) => v.id === p.liveVersionId);
      if (live) live.status = 'validated';
      p.liveVersionId = null;
    } else {
      const v = p.versions.find((x) => x.id === versionId)!;
      // 'archived' = a previously live version: re-publishing it is a rollback
      if (v.status !== 'validated' && v.status !== 'published' && v.status !== 'archived') throw new AdminError(409, [`Version is "${v.status}" and cannot be published. Fix the validation errors first.`]);
      if (v.pathway === 'template-images' && !v.artworkApproved) throw new AdminError(409, ['Approve the front/back artwork mapping in the preview before publishing.']);
      const prev = p.versions.find((x) => x.id === p.liveVersionId);
      if (prev && prev.id !== v.id) prev.status = 'archived';
      v.status = 'published';
      p.liveVersionId = v.id;
      p.active = true; // publishing means "put it in the store"; hiding is a separate, explicit toggle
    }
    p.updatedAt = new Date().toISOString();
    return p;
  });
}

