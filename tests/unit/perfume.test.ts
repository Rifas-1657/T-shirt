import { describe, expect, it } from 'vitest';
import { classifyProduct } from '@/lib/garments';
import { BOTTLE_STYLES, BOTTLES, DEFAULT_PERFUME, perfumeModelConfig, validatePerfumeSpec } from '@/lib/perfume';
import { isCustomizable } from '@/lib/printZones';
import { normalizeProduct, toPublic } from '@/server/storage';
import type { Product } from '@/lib/types';

describe('perfume products', () => {
  it('recognises perfumes from the title or description, before garment words', () => {
    expect(classifyProduct('Rose Royale Eau de Parfum')).toBe('perfume');
    expect(classifyProduct('Oud Noir', 'an intense extrait for evenings')).toBe('perfume');
    expect(classifyProduct('Majlis Attar')).toBe('perfume');
    expect(classifyProduct('Oversized Tee')).toBe('oversized');
    expect(classifyProduct('The Atlas')).toBeNull();
  });

  it('validates a perfume spec and trims notes', () => {
    const { spec, errors } = validatePerfumeSpec({ ...DEFAULT_PERFUME, notes: { top: ' Saffron, , Bergamot ', heart: ['Rose'], base: [] } });
    expect(errors).toEqual([]);
    expect(spec.notes.top).toEqual(['Saffron', 'Bergamot']);
    const bad = validatePerfumeSpec({ bottle: 'cube', liquid: 'red', cap: 'plastic', volumeMl: 9000, concentration: 'x', notes: {} });
    expect(bad.errors.length).toBeGreaterThanOrEqual(5);
  });

  it('every bottle template exists with a label area, and perfume versions are never customisable', () => {
    for (const b of BOTTLE_STYLES) {
      expect(BOTTLES[b].height).toBeGreaterThan(0.1);
      expect(BOTTLES[b].labelSize[0]).toBeGreaterThan(0);
      const cfg = perfumeModelConfig(b);
      expect(cfg.modelUrl).toBe(`/models/perfume/${b}.glb`);
      expect(isCustomizable(cfg)).toBe(false);
    }
  });

  it('public projection exposes the perfume spec and the current bottle template', () => {
    const p = {
      id: 'p1', sku: 'P1', title: 'Qasr Oud', description: '', category: 'Perfumes', kind: 'perfume', perfume: { ...DEFAULT_PERFUME, bottle: 'majlis' }, garment: 'half-sleeve',
      price: 1450, currency: 'QAR', active: true, sizes: [], colors: [{ name: 'Amber oud', hex: '#8a4a12' }], liveVersionId: 'v1', createdAt: '', updatedAt: '',
      versions: [{ id: 'v1', createdAt: '', status: 'published', pathway: 'perfume', issues: [], modelConfig: perfumeModelConfig('qasr') }],
    } as unknown as Product;
    const pub = toPublic(normalizeProduct(p))!;
    expect(pub.kind).toBe('perfume');
    expect(pub.perfume!.bottle).toBe('majlis');
    expect(pub.version.modelConfig.modelUrl).toBe('/models/perfume/majlis.glb');
    expect(isCustomizable(pub.version.modelConfig)).toBe(false);
  });
});
