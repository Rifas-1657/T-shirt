// Turns an admin-uploaded *product photo* (a garment on a plain studio background) into print-ready
// artwork: the background is separated by a flood fill from the image border, the fabric colour is
// measured, the printed graphic is isolated (pixels that differ from the fabric, clustered so stray
// labels/seams are ignored), cut out with a soft alpha matte, and its position/size on the garment
// body is measured so it can be placed on the 3D template at the same spot.
// Images that already have transparency, or that are not a garment on a plain background, are
// treated as ready-made artwork and returned unchanged.
import sharp from 'sharp';

export interface DesignCrop {
  png: Buffer;
  width: number;
  height: number;
  /** Horizontal centre relative to the body centre, as a fraction of the body width (-0.5..0.5). */
  centerX: number;
  /** Design width as a fraction of the body width. */
  widthOfBody: number;
  /** Top / height of the design as fractions of the garment height (top of collar → hem). */
  topOfGarment: number;
  heightOfGarment: number;
}

export interface PhotoAnalysis {
  kind: 'garment-photo' | 'artwork';
  /** Fabric colour measured from the photo (#rrggbb), garment photos only. */
  garmentColor?: string;
  /** null = garment photo with no print on it (e.g. a plain back). */
  design?: DesignCrop | null;
  notes: string[];
}

const MAX_SIDE = 1400;
type RGB = [number, number, number];
const dist = (r: number, g: number, b: number, c: RGB) => Math.sqrt((r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2);
const hex = (c: RGB) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = values.slice().sort((a, b) => a - b);
  return s[s.length >> 1];
}

/** Summed-area table of a 0/1 mask, for O(1) box queries (erosion/dilation). */
function integral(mask: Uint8Array, w: number, h: number) {
  const I = new Uint32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += mask[y * w + x];
      I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row;
    }
  }
  return (x0: number, y0: number, x1: number, y1: number) => {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(w - 1, x1); y1 = Math.min(h - 1, y1);
    return I[(y1 + 1) * (w + 1) + x1 + 1] - I[y0 * (w + 1) + x1 + 1] - I[(y1 + 1) * (w + 1) + x0] + I[y0 * (w + 1) + x0];
  };
}

export async function analyzeGarmentPhoto(input: Buffer): Promise<PhotoAnalysis> {
  const notes: string[] = [];
  const img = sharp(input, { limitInputPixels: 6000 * 6000 }).ensureAlpha();
  const meta = await img.metadata();
  const scale = Math.min(1, MAX_SIDE / Math.max(meta.width ?? 1, meta.height ?? 1));
  const { data, info } = await img
    .resize(Math.round((meta.width ?? 1) * scale), Math.round((meta.height ?? 1) * scale), { kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const N = w * h;
  const px = (i: number) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2], data[i * 4 + 3]] as const;

  // 1) already-transparent artwork is used as-is
  let transparent = 0;
  for (let i = 0; i < N; i++) if (data[i * 4 + 3] < 250) transparent++;
  if (transparent / N > 0.05) return { kind: 'artwork', notes: ['Image has transparency: used as ready-made artwork.'] };

  // 2) background colour from the image border
  const border: number[][] = [[], [], []];
  for (let x = 0; x < w; x++) for (const y of [0, 1, h - 2, h - 1]) for (let c = 0; c < 3; c++) border[c].push(data[(y * w + x) * 4 + c]);
  for (let y = 0; y < h; y++) for (const x of [0, 1, w - 2, w - 1]) for (let c = 0; c < 3; c++) border[c].push(data[(y * w + x) * 4 + c]);
  const bg: RGB = [median(border[0]), median(border[1]), median(border[2])];
  // product photos are shot on a light, neutral backdrop; a coloured/dark backdrop means designed artwork
  const bgLum = (bg[0] + bg[1] + bg[2]) / 3;
  const bgSat = Math.max(...bg) - Math.min(...bg);
  if (bgLum < 150 || bgSat > 40) return { kind: 'artwork', notes: ['Coloured or dark background: used as ready-made artwork.'] };

  // 3) flood fill the background from the border (tolerant to soft studio gradients and shadows)
  const isBg = new Uint8Array(N);
  const queue = new Int32Array(N);
  let qh = 0;
  let qt = 0;
  const seed = (i: number) => {
    const [r, g, b] = px(i);
    if (!isBg[i] && dist(r, g, b, bg) < 60) {
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
      // neighbour continuity + loose closeness to the backdrop
      if (dist(r2, g2, b2, [r, g, b]) < 14 && dist(r2, g2, b2, bg) < 75) {
        isBg[j] = 1;
        queue[qt++] = j;
      }
    }
  }
  const garment = new Uint8Array(N);
  let area = 0;
  let top = h, bottom = 0, left = w, right = 0;
  for (let i = 0; i < N; i++) {
    if (isBg[i]) continue;
    garment[i] = 1;
    area++;
    const x = i % w;
    const y = (i / w) | 0;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
    if (x < left) left = x;
    if (x > right) right = x;
  }
  const frac = area / N;
  if (frac < 0.2 || frac > 0.97) return { kind: 'artwork', notes: ['No garment on a plain background detected: used as ready-made artwork.'] };

  // 4) body width at mid-height (sleeves are above this row on tees) and fabric colour from the eroded interior
  const midY = Math.round(top + 0.6 * (bottom - top));
  const cx = Math.round((left + right) / 2);
  let bl = cx, br = cx;
  while (bl > 0 && garment[midY * w + bl - 1]) bl--;
  while (br < w - 1 && garment[midY * w + br + 1]) br++;
  const bodyW = Math.max(1, br - bl);
  const bodyCx = (bl + br) / 2;
  const box = integral(garment, w, h);
  const er = Math.max(2, Math.round(bodyW * 0.03));
  const interior = new Uint8Array(N);
  const cols: number[][] = [[], [], []];
  for (let y = top; y <= bottom; y++)
    for (let x = left; x <= right; x++) {
      const i = y * w + x;
      if (!garment[i]) continue;
      if (box(x - er, y - er, x + er, y + er) === (2 * er + 1) ** 2) {
        interior[i] = 1;
        if ((x + y) % 3 === 0) for (let c = 0; c < 3; c++) cols[c].push(data[i * 4 + c]);
      }
    }
  const fabric: RGB = [median(cols[0]), median(cols[1]), median(cols[2])];

  // 5) print candidates: interior pixels clearly different from the fabric
  const cand = new Uint8Array(N);
  let candCount = 0;
  for (let i = 0; i < N; i++) {
    if (!interior[i]) continue;
    const [r, g, b] = px(i);
    if (dist(r, g, b, fabric) > 52) {
      cand[i] = 1;
      candCount++;
    }
  }
  const base = { kind: 'garment-photo' as const, garmentColor: hex(fabric) };
  if (candCount < area * 0.002) return { ...base, design: null, notes: ['No print found on this side: it stays plain.'] };

  // 6) cluster candidates (dilate, connected components) and keep the main graphic
  const cbox = integral(cand, w, h);
  const dr = Math.max(3, Math.round(bodyW * 0.035));
  const dil = new Uint8Array(N);
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) if (cbox(x - dr, y - dr, x + dr, y + dr) > 0) dil[y * w + x] = 1;
  const label = new Int32Array(N);
  const comps: { count: number; x0: number; y0: number; x1: number; y1: number }[] = [];
  for (let s = 0; s < N; s++) {
    if (!dil[s] || label[s]) continue;
    const id = comps.length + 1;
    const c = { count: 0, x0: w, y0: h, x1: 0, y1: 0 };
    qh = 0; qt = 0;
    queue[qt++] = s;
    label[s] = id;
    while (qh < qt) {
      const i = queue[qh++];
      const x = i % w;
      const y = (i / w) | 0;
      if (cand[i]) {
        c.count++;
        if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      }
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1])
        if (j >= 0 && dil[j] && !label[j]) {
          label[j] = id;
          queue[qt++] = j;
        }
    }
    comps.push(c);
  }
  const edgeThin = (c: (typeof comps)[number]) => {
    const bw = c.x1 - c.x0 + 1;
    const bh = c.y1 - c.y0 + 1;
    const e = Math.max(4, Math.round(bodyW * 0.08));
    return (c.x0 - left < e || right - c.x1 < e || bottom - c.y1 < e) && (c.count / (bw * bh) < 0.12 || Math.max(bw, bh) / Math.min(bw, bh) > 4);
  };
  const biggest = Math.max(0, ...comps.filter((c) => !edgeThin(c)).map((c) => c.count));
  const keep = new Set<number>();
  comps.forEach((c, k) => {
    // shadows and fold highlights hug the garment outline and are thin or elongated; prints are compact
    if (edgeThin(c)) return;
    // drop small specks such as the neck label or seam highlights
    if (c.count >= Math.max(biggest * 0.15, area * 0.0015)) keep.add(k + 1);
  });
  if (!keep.size) return { ...base, design: null, notes: ['No print found on this side: it stays plain.'] };
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (const k of keep) {
    const c = comps[k - 1];
    x0 = Math.min(x0, c.x0); y0 = Math.min(y0, c.y0); x1 = Math.max(x1, c.x1); y1 = Math.max(y1, c.y1);
  }
  const pad = Math.round(bodyW * 0.01);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);

  // 7) cut out the graphic: soft alpha from the colour difference, then un-blend the fabric colour
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const out = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const i = (y0 + y) * w + (x0 + x);
      const o = (y * cw + x) * 4;
      if (!keep.has(label[i]) || !garment[i]) continue;
      const [r, g, b] = px(i);
      const a = Math.min(1, Math.max(0, (dist(r, g, b, fabric) - 16) / 50));
      if (a <= 0) continue;
      const k = Math.max(a, 0.25);
      out[o] = Math.min(255, Math.max(0, fabric[0] + (r - fabric[0]) / k));
      out[o + 1] = Math.min(255, Math.max(0, fabric[1] + (g - fabric[1]) / k));
      out[o + 2] = Math.min(255, Math.max(0, fabric[2] + (b - fabric[2]) / k));
      out[o + 3] = Math.round(a * 255);
    }
  const png = await sharp(out, { raw: { width: cw, height: ch, channels: 4 } }).png().toBuffer();
  const gH = Math.max(1, bottom - top);
  notes.push(`Garment photo: fabric colour ${hex(fabric)}, print extracted (${cw}×${ch}px) and placed where it sits on the garment.`);
  return {
    ...base,
    design: {
      png,
      width: cw,
      height: ch,
      centerX: ((x0 + x1) / 2 - bodyCx) / bodyW,
      widthOfBody: cw / bodyW,
      topOfGarment: (y0 - top) / gH,
      heightOfGarment: ch / gH,
    },
    notes,
  };
}

const NAMED: [string, RGB][] = [
  ['Black', [24, 24, 24]], ['Charcoal', [58, 58, 60]], ['Grey', [128, 128, 128]], ['Heather Grey', [165, 162, 157]],
  ['White', [245, 245, 242]], ['Off-white', [232, 226, 212]], ['Sand', [201, 180, 143]], ['Navy', [31, 37, 64]],
  ['Blue', [45, 85, 160]], ['Sky', [140, 180, 220]], ['Green', [47, 74, 57]], ['Olive', [109, 107, 75]],
  ['Sage', [142, 155, 132]], ['Red', [160, 40, 40]], ['Maroon', [100, 30, 40]], ['Pink', [210, 150, 160]],
  ['Lilac', [183, 165, 184]], ['Yellow', [230, 200, 80]], ['Butter', [239, 220, 166]], ['Orange', [220, 120, 50]],
  ['Brown', [110, 75, 50]], ['Clay', [184, 115, 90]],
];

/** Human-friendly name for a measured fabric colour. */
export function colorName(hexColor: string): string {
  const n = parseInt(hexColor.slice(1), 16);
  const c: RGB = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return NAMED.reduce((best, cur) => (dist(c[0], c[1], c[2], cur[1]) < dist(c[0], c[1], c[2], best[1]) ? cur : best))[0];
}
