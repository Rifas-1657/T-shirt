import { describe, expect, it } from 'vitest';
import { editorToAtlas, editorToUv, isCustomizable, isValidUvRect, layerBoundsStatus, layerCorners, uvToEditor, zoneDistortion, zoneToAtlasRect } from '@/lib/printZones';
import { TEMPLATE_ZONES, templateModelConfig } from '@/lib/template';
import type { TextLayer } from '@/lib/types';

const front = TEMPLATE_ZONES.find((z) => z.id === 'front')!;
const back = TEMPLATE_ZONES.find((z) => z.id === 'back')!;

describe('zone <-> atlas/UV transforms', () => {
  it('maps a zone UV rect to canvas pixels with v flipped (canvas row 0 = top of the garment)', () => {
    const r = zoneToAtlasRect({ u0: 0.25, v0: 0.2, u1: 0.5, v1: 0.6 }, 2048, 1024);
    expect(r.left).toBeCloseTo(512);
    expect(r.top).toBeCloseTo(0.4 * 1024);
    expect(r.width).toBeCloseTo(512);
    expect(r.height).toBeCloseTo(0.4 * 1024);
  });

  it('editor top-left maps to the zone rect top-left in the atlas', () => {
    const r = zoneToAtlasRect(front.uvRect, 2048, 1024);
    expect(editorToAtlas(0, 0, r)).toEqual([r.left, r.top]);
    expect(editorToAtlas(1, 1, r)).toEqual([r.left + r.width, r.top + r.height]);
  });

  it('editor <-> UV round-trips and the editor top is the higher v', () => {
    const [u, v] = editorToUv(0.2, 0.1, front.uvRect);
    const [x, y] = uvToEditor(u, v, front.uvRect);
    expect(x).toBeCloseTo(0.2);
    expect(y).toBeCloseTo(0.1);
    expect(editorToUv(0.5, 0, front.uvRect)[1]).toBeGreaterThan(editorToUv(0.5, 1, front.uvRect)[1]);
  });

  it('template zones are valid, sit in their own atlas halves and are not stretched', () => {
    for (const z of TEMPLATE_ZONES) expect(isValidUvRect(z.uvRect)).toBe(true);
    expect(front.uvRect.u1).toBeLessThanOrEqual(0.5);
    expect(back.uvRect.u0).toBeGreaterThanOrEqual(0.5);
    // the 2:1 atlas with isotropic UVs means physical aspect must match pixel aspect
    for (const z of TEMPLATE_ZONES) expect(zoneDistortion(z, 2048, 1024)).toBeLessThan(0.01);
  });

  it('rejects malformed UV rects', () => {
    expect(isValidUvRect({ u0: 0.5, v0: 0, u1: 0.4, v1: 1 })).toBe(false);
    expect(isValidUvRect({ u0: -0.1, v0: 0, u1: 0.4, v1: 1 })).toBe(false);
    expect(isValidUvRect({ u0: 0, v0: 0, u1: NaN, v1: 1 })).toBe(false);
  });

  it('template config is customisable; an unverified profile is not', () => {
    expect(isCustomizable(templateModelConfig())).toBe(true);
    expect(isCustomizable({ ...templateModelConfig(), mappingVerified: false })).toBe(false);
    expect(isCustomizable({ ...templateModelConfig(), printZones: [] })).toBe(false);
  });
});

describe('print-safe bounds', () => {
  const text = (p: Partial<TextLayer>): TextLayer => ({
    id: 't', type: 'text', text: 'HELLO', font: 'sans', fontSize: 0.05, fill: '#000000', weight: 400, letterSpacing: 0,
    x: 0.5, y: 0.5, rotation: 0, scale: 1, opacity: 1, ...p,
  });
  const measure = () => 0.3; // 30% of zone width

  it('centred small text is inside', () => {
    expect(layerBoundsStatus(text({}), front, measure)).toBe('inside');
  });
  it('text near the edge is flagged outside-safe, beyond the edge clipped', () => {
    expect(layerBoundsStatus(text({ x: 0.16 }), front, measure)).toBe('outside-safe');
    expect(layerBoundsStatus(text({ x: 0.1 }), front, measure)).toBe('clipped');
  });
  it('rotation is taken into account with the zone aspect', () => {
    const tall = text({ x: 0.5, y: 0.5, scale: 3.2 }); // 0.96 wide: inside the zone, outside the 3% safe margin
    expect(layerBoundsStatus(tall, front, measure)).toBe('outside-safe');
    // rotated 90deg the 0.96-wide text spans 0.96 * width = 0.72 of the 4:3 zone height -> fits
    expect(layerBoundsStatus({ ...tall, rotation: 90 }, front, measure)).toBe('inside');
    const c = layerCorners({ ...tall, rotation: 90 }, front, measure);
    const xs = c.map((p) => p[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.3);
  });
});
