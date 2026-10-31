// Cuts a product (e.g. a perfume bottle) out of a studio photo shot on a plain, light background.
// Background = everything reachable from the image border through smoothly varying light pixels
// (so soft studio shadows go too); light areas *inside* the product — glass showing the backdrop —
// are not reachable and stay. Edges get a soft alpha. Photos that are not on a plain light
// background are returned as "not cut out" and are shown as normal framed photos instead.
import sharp from 'sharp';

type RGB = [number, number, number];
const dist = (r: number, g: number, b: number, c: RGB) => Math.sqrt((r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2);
const median = (v: number[]) => (v.length ? v.slice().sort((a, b) => a - b)[v.length >> 1] : 0);
const hex = (c: RGB) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

export interface CutoutResult {
  ok: boolean;
  reason?: string;
  png?: Buffer;
  width?: number;
  height?: number;
  /** Most saturated large colour of the product (e.g. the perfume juice), #rrggbb. */
  accentColor?: string;
}

export async function cutoutProduct(input: Buffer): Promise<CutoutResult> {
  const meta = await sharp(input).metadata();
  const scale = Math.min(1, 1600 / Math.max(meta.width ?? 1, meta.height ?? 1));
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .resize(Math.round((meta.width ?? 1) * scale), Math.round((meta.height ?? 1) * scale))
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const N = w * h;
  const px = (i: number) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]] as RGB;

  // already transparent: trust it
  let transparent = 0;
  for (let i = 0; i < N; i++) if (data[i * 4 + 3] < 250) transparent++;
  if (transparent / N > 0.05) {
    const png = await sharp(input).png().trim().toBuffer();
    const m = await sharp(png).metadata();
    return { ok: true, png, width: m.width, height: m.height };
  }

  const border: number[][] = [[], [], []];
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) px(y * w + x).forEach((v, c) => border[c].push(v));
  for (let y = 0; y < h; y++) for (const x of [0, w - 1]) px(y * w + x).forEach((v, c) => border[c].push(v));
  const bg: RGB = [median(border[0]), median(border[1]), median(border[2])];
  if ((bg[0] + bg[1] + bg[2]) / 3 < 150 || Math.max(...bg) - Math.min(...bg) > 40)
    return { ok: false, reason: 'The background is not plain and light, so the photo is shown as it is (framed).' };

  // how much neighbouring background pixels differ (sensor/JPEG noise): clean studio renders allow a
  // very tight fill, which stops at the faint outline of clear glass instead of flowing into the bottle
  const steps: number[] = [];
  for (let x = 1; x < w; x++) for (const y of [0, h - 1]) steps.push(dist(...px(y * w + x), px(y * w + x - 1)));
  for (let y = 1; y < h; y++) for (const x of [0, w - 1]) steps.push(dist(...px(y * w + x), px((y - 1) * w + x)));
  steps.sort((a, b) => a - b);
  const noise = steps[Math.floor(steps.length * 0.9)] ?? 0;
  const tol = Math.min(10, Math.max(2.5, noise * 2 + 1.5));
  // photos have soft shadows and uneven light, so "background" is anything fairly close to it; a clean,
  // noise-free studio sweep allows a tight limit, so pale juice and frosted glass are not mistaken for it
  const bgTol = noise < 2 ? 14 : 95;
  const isBg = new Uint8Array(N);
  const queue = new Int32Array(N);
  let qh = 0;
  let qt = 0;
  const seed = (i: number) => {
    const [r, g, b] = px(i);
    if (!isBg[i] && dist(r, g, b, bg) < Math.min(70, bgTol)) {
      isBg[i] = 1;
      queue[qt++] = i;
    }
  };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (qh < qt) {
    const i = queue[qh++];
    const x = i % w;
    const y = (i / w) | 0;
    const [r, g, b] = px(i);
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
      if (j < 0 || isBg[j]) continue;
      const [r2, g2, b2] = px(j);
      if (dist(r2, g2, b2, [r, g, b]) < tol && dist(r2, g2, b2, bg) < bgTol) {
        isBg[j] = 1;
        queue[qt++] = j;
      }
    }
  }

  // keep the subject: the largest blob plus any sizeable separate part (a cap seen through clear glass);
  // dust and stray specks are dropped
  const label = new Int32Array(N);
  let best = 0;
  let bestSize = 0;
  let id = 0;
  const sizes: number[] = [];
  for (let s = 0; s < N; s++) {
    if (isBg[s] || label[s]) continue;
    id++;
    let size = 0;
    qh = 0;
    qt = 0;
    queue[qt++] = s;
    label[s] = id;
    while (qh < qt) {
      const i = queue[qh++];
      size++;
      const x = i % w;
      const y = (i / w) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1])
        if (j >= 0 && !isBg[j] && !label[j]) {
          label[j] = id;
          queue[qt++] = j;
        }
    }
    sizes.push(size);
    if (size > bestSize) {
      bestSize = size;
      best = id;
    }
  }
  const keep = new Uint8Array(id + 1);
  sizes.forEach((sz, k) => (keep[k + 1] = sz >= bestSize * 0.02 ? 1 : 0));
  const inSubject = (i: number) => label[i] > 0 && keep[label[i]] === 1;
  if (bestSize / N < 0.03) return { ok: false, reason: 'No product found on the plain background.' };
  if (bestSize / N > 0.9) return { ok: false, reason: 'The product fills the whole photo; it is shown as it is.' };

  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  const sat: { s: number; c: RGB }[] = [];
  for (let i = 0; i < N; i++) {
    if (!inSubject(i)) continue;
    const x = i % w;
    const y = (i / w) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    if ((x + y) % 4 === 0) {
      const c = px(i);
      sat.push({ s: Math.max(...c) - Math.min(...c), c });
    }
  }
  // accent colour: median of the most saturated quarter (juice / dyed glass rather than cap or highlights)
  sat.sort((a, b) => b.s - a.s);
  const top = sat.slice(0, Math.max(1, Math.floor(sat.length / 4)));
  const accent: RGB = [median(top.map((t) => t.c[0])), median(top.map((t) => t.c[1])), median(top.map((t) => t.c[2]))];

  // distance (in pixels, 1 or 2) of subject pixels from the background; 0 = deeper inside
  const ring = new Uint8Array(N);
  const near = (i: number, test: (j: number) => boolean) => [i - 1, i + 1, i - w, i + w].some((j) => j >= 0 && j < N && test(j));
  for (let i = 0; i < N; i++) if (inSubject(i) && near(i, (j) => !inSubject(j))) ring[i] = 1;
  for (let i = 0; i < N; i++) if (inSubject(i) && !ring[i] && near(i, (j) => ring[j] === 1)) ring[i] = 2;

  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const out = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const i = (y0 + y) * w + (x0 + x);
      const o = (y * cw + x) * 4;
      const [r, g, b] = px(i);
      out[o] = r; out[o + 1] = g; out[o + 2] = b;
      if (!inSubject(i)) continue;
      // soft edge: pixels within two pixels of the background fade with their colour distance to it,
      // so backdrop-coloured fringes (reflections on polished caps, the sweep under the glass) disappear
      const d = ring[i];
      out[o + 3] = d ? Math.round(255 * Math.min(1, dist(r, g, b, bg) / 45 + (d === 1 ? 0.15 : 0.45))) : 255;
    }
  const png = await sharp(out, { raw: { width: cw, height: ch, channels: 4 } }).png().toBuffer();
  return { ok: true, png, width: cw, height: ch, accentColor: hex(accent) };
}
