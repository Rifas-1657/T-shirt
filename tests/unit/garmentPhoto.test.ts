import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '@/lib/garments';
import { photoArtworkLayer } from '@/server/catalogAdmin';
import { analyzeGarmentPhoto, colorName } from '@/server/garmentPhoto';

const fx = (n: string) => readFileSync(`tests/fixtures/${n}`);

describe('garment photo analysis', () => {
  it('front product photo: detects the fabric colour and cuts out only the chest print', async () => {
    const r = await analyzeGarmentPhoto(fx('product-photo-front.png'));
    expect(r.kind).toBe('garment-photo');
    expect(colorName(r.garmentColor!)).toBe('Black');
    const d = r.design!;
    expect(d).toBeTruthy();
    // the print block is ~130 px wide on a 220 px body, centred, in the upper third (the neck label is ignored)
    expect(d.widthOfBody).toBeGreaterThan(0.5);
    expect(d.widthOfBody).toBeLessThan(0.75);
    expect(Math.abs(d.centerX)).toBeLessThan(0.06);
    expect(d.topOfGarment).toBeGreaterThan(0.15);
    expect(d.topOfGarment + d.heightOfGarment).toBeLessThan(0.45);
    // the cut-out has a transparent background (no photo rectangle)
    const { data, info } = await sharp(d.png).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);
    let clear = 0;
    let solid = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 40) clear++;
      else if (data[i] > 215) solid++;
    }
    const n = data.length / 4;
    expect(clear / n).toBeGreaterThan(0.2); // fabric between the print elements is removed
    expect(solid / n).toBeGreaterThan(0.2); // the print itself is kept opaque
  });

  it('plain back photo: no print, side stays plain, colour still detected', async () => {
    const r = await analyzeGarmentPhoto(fx('product-photo-back.png'));
    expect(r.kind).toBe('garment-photo');
    expect(r.design).toBeNull();
    expect(colorName(r.garmentColor!)).toBe('Black');
  });

  it('artwork on a coloured background or with transparency is used as-is', async () => {
    expect((await analyzeGarmentPhoto(fx('back-print.png'))).kind).toBe('artwork');
    expect((await analyzeGarmentPhoto(fx('logo-arrow.png'))).kind).toBe('artwork');
  });

  it('photo placement maps to the same physical spot on each template and stays inside the print area', () => {
    const art = { url: '/api/uploads/abcdefgh', width: 300, height: 120, placement: { centerX: 0, widthOfBody: 0.5, topOfGarment: 0.2, heightOfGarment: 0.12 } };
    for (const cat of ['half-sleeve', 'oversized', 'hoodie'] as const) {
      const zone = TEMPLATES[cat].printZones.find((z) => z.id === 'front')!;
      const { layer } = photoArtworkLayer(cat, zone, art, 'front');
      expect(layer.x).toBeCloseTo(0.5, 2);
      expect(layer.width).toBeGreaterThan(0.3);
      expect(layer.width).toBeLessThanOrEqual(0.96);
      expect(layer.y).toBeGreaterThan(0);
      expect(layer.y).toBeLessThan(1);
    }
    const huge = { ...art, placement: { ...art.placement, widthOfBody: 1.2 } };
    const zone = TEMPLATES.oversized.printZones[0];
    const r = photoArtworkLayer('oversized', zone, huge, 'front');
    expect(r.layer.width).toBeLessThanOrEqual(0.96);
    expect(r.issues.map((i) => i.code)).toContain('print_scaled');
  });
});
