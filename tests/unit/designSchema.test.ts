import { describe, expect, it } from 'vitest';
import { emptyDesign, LIMITS, validateDesign } from '@/lib/designSchema';
import { templateModelConfig } from '@/lib/template';
import type { PublicProduct } from '@/lib/types';

const product: PublicProduct = {
  id: 'p_test', sku: 'TST-1', title: 'Test Tee', description: '', category: 'T-Shirts', kind: 'apparel', garment: 'half-sleeve', price: 50, currency: 'USD',
  sizes: ['S', 'M', 'L'], colors: [{ name: 'Chalk', hex: '#ece8df' }, { name: 'Onyx', hex: '#1d1d1f' }],
  version: { id: 'v_1', pathway: 'glb', modelConfig: templateModelConfig() },
};

const textLayer = { id: 'l1', type: 'text', text: 'FRONT LEFT', font: 'serif', fontSize: 0.07, fill: '#112233', weight: 600, letterSpacing: 0.05, x: 0.3, y: 0.3, rotation: 12, scale: 1.1, opacity: 1 };
const imageLayer = { id: 'l2', type: 'image', src: '/api/uploads/abcdefgh1234', width: 0.5, aspect: 0.5, name: 'logo.png', x: 0.5, y: 0.5, rotation: 0, scale: 1, opacity: 0.9 };

describe('design JSON validation', () => {
  it('accepts a valid versioned design and round-trips through JSON', () => {
    const d = { ...emptyDesign(product), size: 'L', color: { name: 'Onyx', hex: '#1D1D1F' }, zones: { front: [textLayer], back: [imageLayer] } };
    const r = validateDesign(JSON.parse(JSON.stringify(d)), product);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.color).toEqual({ name: 'Onyx', hex: '#1d1d1f' });
    expect(r.value.zones.front[0]).toMatchObject({ text: 'FRONT LEFT', rotation: 12 });
    expect(r.value.zones.back[0]).toMatchObject({ src: '/api/uploads/abcdefgh1234' });
    expect(r.value.productVersionId).toBe('v_1');
    expect(r.value.modelUrl).toBe(product.version.modelConfig.modelUrl);
  });

  it('rejects designs for another model version, unknown colours or sizes', () => {
    const base = emptyDesign(product);
    const errs = (d: unknown) => {
      const r = validateDesign(d, product);
      return r.ok ? [] : r.errors;
    };
    expect(errs({ ...base, productVersionId: 'v_old' }).join()).toMatch(/different model version/);
    expect(errs({ ...base, color: { name: 'Lime', hex: '#00ff00' } }).join()).toMatch(/color/);
    expect(errs({ ...base, size: 'XXXL' }).join()).toMatch(/size/);
    expect(validateDesign(base, null).ok).toBe(false);
  });

  it('rejects external image URLs, scripts-as-text are kept as plain text, control chars stripped', () => {
    const bad = { ...emptyDesign(product), zones: { front: [{ ...imageLayer, src: 'https://evil.example/x.png' }], back: [] } };
    expect(validateDesign(bad, product).ok).toBe(false);
    const t = { ...emptyDesign(product), zones: { front: [{ ...textLayer, text: '<b>hi</b>\u0007' }], back: [] } };
    const r = validateDesign(t, product);
    expect(r.ok && r.value.zones.front[0].type === 'text' && r.value.zones.front[0].text).toBe('<b>hi</b>');
  });

  it('enforces text length, numeric ranges and layer limits', () => {
    const long = { ...emptyDesign(product), zones: { front: [{ ...textLayer, text: 'x'.repeat(LIMITS.maxTextLength + 1) }], back: [] } };
    expect(validateDesign(long, product).ok).toBe(false);
    const nan = { ...emptyDesign(product), zones: { front: [{ ...textLayer, scale: 'big' }], back: [] } };
    expect(validateDesign(nan, product).ok).toBe(false);
    const many = { ...emptyDesign(product), zones: { front: Array.from({ length: LIMITS.maxLayersPerZone + 1 }, (_, i) => ({ ...textLayer, id: `l${i}` })), back: [] } };
    expect(validateDesign(many, product).ok).toBe(false);
  });

  it('rejects artwork on a zone the product does not have', () => {
    const p2 = { ...product, version: { ...product.version, modelConfig: { ...product.version.modelConfig, printZones: product.version.modelConfig.printZones.filter((z) => z.id === 'front') } } };
    const d = { ...emptyDesign(p2), zones: { front: [], back: [textLayer] } };
    const r = validateDesign(d, p2);
    expect(r.ok).toBe(false);
  });
});
