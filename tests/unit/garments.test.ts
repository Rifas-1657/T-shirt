import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyGarment, RACK_ORDER, TEMPLATES, templateModelConfig, templateUrl } from '@/lib/garments';
import { isValidUvRect, zoneDistortion } from '@/lib/printZones';
import type { Product } from '@/lib/types';
import { artworkDpiIssues, defaultArtworkLayer } from '@/server/catalogAdmin';
import { checkPrintProfile, inspectGlb, zoneCoverage } from '@/server/glbValidate';
import { normalizeProduct, toPublic } from '@/server/storage';

describe('garment templates (Blender v2)', () => {
  for (const cat of RACK_ORDER) {
    it(`${cat}: shipped GLB validates and both print zones cover real UV islands of the printable mesh`, async () => {
      const t = TEMPLATES[cat];
      const bytes = new Uint8Array(readFileSync(`public${templateUrl(cat)}`));
      const r = await inspectGlb(bytes);
      expect(r.ok, JSON.stringify(r.issues)).toBe(true);
      expect(r.report!.meshes.find((m) => m.name === 'Shirt')?.hasUv).toBe(true);
      for (const m of t.colorableMaterials) expect(r.report!.materials).toContain(m);
      for (const z of t.printZones) {
        expect(isValidUvRect(z.uvRect)).toBe(true);
        expect(zoneDistortion(z, 2048, 1024)).toBeLessThan(0.01);
      }
      const front = t.printZones.find((z) => z.id === 'front')!;
      const back = t.printZones.find((z) => z.id === 'back')!;
      expect(front.uvRect.u1).toBeLessThanOrEqual(0.5);
      expect(back.uvRect.u0).toBeGreaterThanOrEqual(0.5);
      const cov = zoneCoverage(r.doc!, t.printableMeshes, t.printZones);
      expect(cov.front).toBeGreaterThan(0.02);
      expect(cov.back).toBeGreaterThan(0.02);
      expect(checkPrintProfile(r.doc!, r.report!, t.printableMeshes, t.printZones).filter((i) => i.level === 'error')).toEqual([]);
    });
  }

  it('templates are drape-simulated and have sensible framing', () => {
    for (const cat of RACK_ORDER) {
      expect(TEMPLATES[cat].simulated).toBe(true);
      expect(TEMPLATES[cat].centerDrop).toBeGreaterThan(0.3);
      expect(TEMPLATES[cat].size[1]).toBeGreaterThan(0.6);
    }
    expect(templateModelConfig('hoodie').modelUrl).toBe('/models/garments/hoodie-v3.glb');
  });
});

describe('garment classification', () => {
  it.each([
    ['Oversized Graphic Tee', 'oversized'],
    ['Boxy Heavyweight Tee', 'oversized'], // within one text the fit words (boxy) outrank the generic "tee"
    ['Long Sleeve Tee', 'full-sleeve'],
    ['Full-sleeve crew', 'full-sleeve'],
    ['Zip-up Hoodie', 'hoodie'],
    ['Oversized Hoodie', 'hoodie'],
    ['Essential T-Shirt', 'half-sleeve'],
    ['Short sleeve tee', 'half-sleeve'],
  ])('%s → %s', (title, expected) => {
    expect(classifyGarment(title)).toBe(expected);
  });

  it('the title wins over vague description words; description is a fallback', () => {
    expect(classifyGarment('Rosewood Crew Tee', 'cut for a relaxed drop shoulder')).toBe('half-sleeve');
    expect(classifyGarment('The Atlas', 'a heavyweight hoodie in brushed fleece')).toBe('hoodie');
    expect(classifyGarment('The Atlas', 'a thing of beauty')).toBeNull();
  });
});

describe('legacy product normalisation', () => {
  const legacy = {
    id: 'p1', sku: 'S1', title: 'Old Hoodie', description: '', category: 'T-Shirts', price: 1, currency: 'USD', active: true, sizes: ['M'],
    colors: [{ name: 'a', hex: '#000000' }], liveVersionId: 'v1', createdAt: '', updatedAt: '',
    versions: [{ id: 'v1', createdAt: '', status: 'published', pathway: 'glb', issues: [], modelConfig: { ...templateModelConfig('half-sleeve'), modelUrl: '/models/tshirt-template-v1.glb' } }],
  } as unknown as Product;

  it('infers the rack and resolves template versions to the current template of that rack', () => {
    const n = normalizeProduct(legacy);
    expect(n.garment).toBe('hoodie');
    expect(n.versions[0].modelConfig.modelUrl).toBe(templateUrl('hoodie'));
    expect(toPublic(n)!.garment).toBe('hoodie');
  });

  it('an admin override wins over the inferred category; uploaded GLB versions are untouched', () => {
    const n = normalizeProduct({ ...legacy, garment: 'oversized' });
    expect(n.versions[0].modelConfig.modelUrl).toBe(templateUrl('oversized'));
    const upload = { ...legacy, versions: [{ ...legacy.versions[0], modelConfig: { ...legacy.versions[0].modelConfig, source: 'upload', modelUrl: '/api/models/p1/v1' } }] } as Product;
    expect(normalizeProduct(upload).versions[0].modelConfig.modelUrl).toBe('/api/models/p1/v1');
  });
});

describe('template artwork placement', () => {
  const zone = TEMPLATES.hoodie.printZones.find((z) => z.id === 'front')!;
  it('contain-fits wide and tall artwork inside the zone, preserving the image aspect', () => {
    const wide = defaultArtworkLayer(zone, { url: '/api/uploads/abcdefgh', width: 2000, height: 500 }, 'front');
    expect(wide.aspect).toBeCloseTo(0.25);
    expect(wide.width).toBeLessThanOrEqual(0.8);
    const tall = defaultArtworkLayer(zone, { url: '/api/uploads/abcdefgh', width: 500, height: 2000 }, 'front');
    const tallHeightFraction = (tall.width * tall.aspect) / (zone.heightCm / zone.widthCm);
    expect(tallHeightFraction).toBeLessThanOrEqual(0.8 + 1e-9);
  });
  it('warns when the artwork resolution is too low for print', () => {
    const l = defaultArtworkLayer(zone, { url: '/api/uploads/abcdefgh', width: 300, height: 300 }, 'front');
    expect(artworkDpiIssues(zone, l, 300, 'front')[0].code).toBe('low_resolution');
    expect(artworkDpiIssues(zone, l, 3000, 'front')[0].code).toBe('resolution');
  });
});
