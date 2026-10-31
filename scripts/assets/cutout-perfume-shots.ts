// Cuts the studio renders of the seeded perfumes out of their light backdrop with the same cut-out the
// admin uses, and writes web-sized transparent WebPs that the seed attaches as product photos.
// Run: node scripts/assets/cutout-perfume-shots.ts   (then npm run seed)
import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { cutoutProduct } from '../../src/server/productCutout.ts';

const SRC = 'assets/processed/perfume-shots';
const OUT = 'public/perfume-shots';
const VIEWS = ['front', 'three-quarter', 'side', 'back'];

for (const sku of await fs.readdir(SRC)) {
  if (!(await fs.stat(path.join(SRC, sku))).isDirectory()) continue;
  for (const view of VIEWS) {
    const file = path.join(SRC, sku, `${view}.png`);
    const buf = await fs.readFile(file).catch(() => null);
    if (!buf) continue;
    const cut = await cutoutProduct(buf);
    if (!cut.ok || !cut.png) {
      console.warn(`${sku}/${view}: ${cut.reason}`);
      continue;
    }
    await fs.mkdir(path.join(OUT, sku), { recursive: true });
    // a touch more colour and contrast: studio renders read a little milky against the dark salon
    const webp = await sharp(cut.png).resize({ height: 1200, withoutEnlargement: true }).modulate({ saturation: 1.22 }).linear(1.08, -10).webp({ quality: 88, alphaQuality: 95, effort: 6 }).toBuffer();
    await fs.writeFile(path.join(OUT, sku, `${view}.webp`), webp);
    console.log(`${sku}/${view}: ${cut.width}×${cut.height}, juice ${cut.accentColor}, ${(webp.length / 1024).toFixed(0)} KB`);
  }
}
