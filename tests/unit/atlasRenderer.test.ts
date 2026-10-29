import { describe, expect, it } from 'vitest';
import { renderAtlas, referencedImages, type Ctx2D } from '@/lib/atlasRenderer';
import { zoneToAtlasRect } from '@/lib/printZones';
import { TEMPLATE_ZONES } from '@/lib/template';
import type { ImageLayer, TextLayer } from '@/lib/types';

/** Minimal Canvas2D stand-in that records calls and tracks the current transform (translate/rotate/scale). */
function recorder() {
  const calls: { op: string; args: unknown[]; m: number[] }[] = [];
  let m = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  const mul = (a: number[], b: number[]) => [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ];
  const rec = (op: string) => (...args: unknown[]) => void calls.push({ op, args, m: m.slice() });
  const ctx = {
    font: '', fillStyle: '', globalAlpha: 1, textAlign: 'start', textBaseline: 'alphabetic', letterSpacing: '0px',
    save: () => void stack.push(m.slice()),
    restore: () => void (m = stack.pop()!),
    translate: (x: number, y: number) => void (m = mul(m, [1, 0, 0, 1, x, y])),
    rotate: (a: number) => void (m = mul(m, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0])),
    scale: (x: number, y: number) => void (m = mul(m, [x, 0, 0, y, 0, 0])),
    clearRect: rec('clearRect'), beginPath: rec('beginPath'), rect: rec('rect'), clip: rec('clip'),
    drawImage: rec('drawImage'), fillText: rec('fillText'),
    measureText: (t: string) => ({ width: t.length * 10 }) as TextMetrics,
  };
  return { ctx: ctx as unknown as Ctx2D, calls };
}

const cfg = { printZones: TEMPLATE_ZONES };
const W = 2048;
const H = 1024;
const text = (p: Partial<TextLayer>): TextLayer => ({ id: 't', type: 'text', text: 'FRONT LEFT', font: 'sans', fontSize: 0.1, fill: '#ff0000', weight: 700, letterSpacing: 0, x: 0.25, y: 0.2, rotation: 0, scale: 1, opacity: 1, ...p });

describe('renderAtlas', () => {
  it('clears the atlas and clips every zone to its printable rect', () => {
    const { ctx, calls } = recorder();
    renderAtlas(ctx, W, H, { config: cfg, zones: {}, images: new Map() });
    expect(calls[0]).toMatchObject({ op: 'clearRect', args: [0, 0, W, H] });
    const rects = calls.filter((c) => c.op === 'rect').map((c) => c.args);
    for (const z of TEMPLATE_ZONES) {
      const r = zoneToAtlasRect(z.uvRect, W, H);
      expect(rects).toContainEqual([r.left, r.top, r.width, r.height]);
    }
  });

  it('places front text at the editor position inside the FRONT half and back text in the BACK half', () => {
    const { ctx, calls } = recorder();
    renderAtlas(ctx, W, H, { config: cfg, zones: { front: [text({})], back: [text({ text: 'BACK CENTER', x: 0.5 })] }, images: new Map() });
    const texts = calls.filter((c) => c.op === 'fillText');
    expect(texts).toHaveLength(2);
    const fr = zoneToAtlasRect(TEMPLATE_ZONES[0].uvRect, W, H);
    const bk = zoneToAtlasRect(TEMPLATE_ZONES[1].uvRect, W, H);
    const [f, b] = texts;
    // transform translation = where the text centre lands on the atlas
    expect(f.m[4]).toBeCloseTo(fr.left + 0.25 * fr.width);
    expect(f.m[5]).toBeCloseTo(fr.top + 0.2 * fr.height);
    expect(f.m[4]).toBeLessThan(W / 2);
    expect(b.m[4]).toBeCloseTo(bk.left + 0.5 * bk.width);
    expect(b.m[4]).toBeGreaterThan(W / 2);
    // no mirroring: x axis of the text transform points +x
    expect(f.m[0]).toBeGreaterThan(0);
    expect(b.m[0]).toBeGreaterThan(0);
  });

  it('applies rotation and uniform scale', () => {
    const { ctx, calls } = recorder();
    renderAtlas(ctx, W, H, { config: cfg, zones: { front: [text({ rotation: 90, scale: 2 })] }, images: new Map() });
    const t = calls.find((c) => c.op === 'fillText')!;
    expect(t.m[0]).toBeCloseTo(0);
    expect(t.m[1]).toBeCloseTo(2);
  });

  it('draws images at the size implied by width/aspect and reports missing ones', () => {
    const img: ImageLayer = { id: 'i', type: 'image', src: '/api/uploads/abcdefgh', width: 0.5, aspect: 0.5, name: 'x', x: 0.5, y: 0.5, rotation: 0, scale: 1, opacity: 1 };
    const { ctx, calls } = recorder();
    const fake = { width: 100, height: 50 } as unknown as CanvasImageSource;
    renderAtlas(ctx, W, H, { config: cfg, zones: { front: [img] }, images: new Map([[img.src, fake]]) });
    const d = calls.find((c) => c.op === 'drawImage')!;
    const fr = zoneToAtlasRect(TEMPLATE_ZONES[0].uvRect, W, H);
    expect(d.args[3]).toBeCloseTo(0.5 * fr.width); // pixel width
    expect(d.args[4]).toBeCloseTo(0.5 * fr.width * 0.5); // pixel height = width * aspect (isotropic)
    const missing: string[] = [];
    renderAtlas(recorder().ctx, W, H, { config: cfg, zones: { front: [img] }, images: new Map(), onMissing: (s) => missing.push(s) });
    expect(missing).toEqual([img.src]);
  });

  it('collects referenced images once', () => {
    const img: ImageLayer = { id: 'i', type: 'image', src: '/api/uploads/abcdefgh', width: 0.5, aspect: 1, name: 'x', x: 0.5, y: 0.5, rotation: 0, scale: 1, opacity: 1 };
    expect(referencedImages({ front: [img, { ...img, id: 'j' }], back: [text({})] })).toEqual(['/api/uploads/abcdefgh']);
  });
});
