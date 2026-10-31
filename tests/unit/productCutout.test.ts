import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { cutoutProduct } from '@/server/productCutout';

/** A studio-style photo: a light backdrop with a soft gradient, and a maroon "bottle" with a gold cap. */
async function studioPhoto(bg = '#f2efea') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="#e4dfd8"/></linearGradient></defs>
    <rect width="600" height="800" fill="url(#g)"/>
    <rect x="220" y="160" width="160" height="60" fill="#c9a45c"/>
    <rect x="180" y="220" width="240" height="420" rx="24" fill="#8a1538"/>
    <rect x="230" y="300" width="140" height="80" fill="#f4e9d8"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
}

describe('product cut-out', () => {
  it('cuts a product out of a plain light background, trims it and finds the juice colour', async () => {
    const r = await cutoutProduct(await studioPhoto());
    expect(r.ok).toBe(true);
    // trimmed close to the 240 × 480 product (plus a little padding)
    expect(r.width!).toBeGreaterThan(240);
    expect(r.width!).toBeLessThan(300);
    expect(r.height!).toBeGreaterThan(480);
    expect(r.height!).toBeLessThan(540);
    const { data, info } = await sharp(r.png!).raw().toBuffer({ resolveWithObject: true });
    const alpha = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
    expect(alpha(1, 1)).toBe(0); // background removed
    expect(alpha(info.width >> 1, info.height >> 1)).toBe(255); // product kept
    // the light label inside the bottle is not reachable from the border, so it stays
    expect(alpha(info.width >> 1, Math.round(info.height * 0.32))).toBe(255);
    const [rr, gg, bb] = r.accentColor!.match(/\w\w/g)!.map((h) => parseInt(h, 16));
    expect(rr).toBeGreaterThan(100);
    expect(gg).toBeLessThan(60);
    expect(bb).toBeLessThan(90);
  });

  it('leaves photos on a dark or busy background as they are', async () => {
    const r = await cutoutProduct(await studioPhoto('#202020'));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/background/);
  });

  it('trusts images that already have transparency', async () => {
    const png = await sharp({ create: { width: 300, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await sharp({ create: { width: 100, height: 200, channels: 4, background: '#8a1538' } }).png().toBuffer(), left: 100, top: 100 }])
      .png()
      .toBuffer();
    const r = await cutoutProduct(png);
    expect(r.ok).toBe(true);
    expect([r.width, r.height]).toEqual([100, 200]);
  });
});
