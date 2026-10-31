// Seeds the local catalogue with one collection per rack (idempotent: skips existing SKUs).
// Run: npm run seed   (Node 24 strips TypeScript types natively)
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

type Cat = 'half-sleeve' | 'full-sleeve' | 'oversized' | 'hoodie';
const DATA = path.resolve(process.env.ATELIER_DATA_DIR ?? 'data');
const FILE = path.join(DATA, 'db', 'products.json');
const id = (p: string) => p + crypto.randomBytes(12).toString('base64url');

async function templateConfig(cat: Cat) {
  const t = JSON.parse(await fs.readFile(`src/lib/garment-templates/${cat}.json`, 'utf8'));
  return {
    modelUrl: `/models/garments/${cat}-v${t.version}.glb`, source: 'template', printableMeshes: t.printableMeshes,
    colorableMaterials: t.colorableMaterials, printZones: t.printZones, scale: 1, hangOffset: [0, 0, 0], rotationY: 0,
    centerDrop: t.centerDrop, mappingVerified: true, atlasSize: [2048, 1024],
  };
}

const PALETTE: Record<Cat, [string, string][]> = {
  'half-sleeve': [['Chalk', '#ece8df'], ['Onyx', '#1d1d1f'], ['Sage', '#8e9b84'], ['Clay', '#b8735a'], ['Ink', '#26324a'], ['Butter', '#efdca6'], ['Rosewood', '#c98f93']],
  'full-sleeve': [['Ecru', '#e8e1d2'], ['Charcoal', '#3a3a3c'], ['Olive', '#6d6b4b'], ['Stone Blue', '#7d8fa3'], ['Chalk', '#ece8df']],
  oversized: [['Bone', '#e6dfd1'], ['Washed Black', '#2e2d2b'], ['Sand', '#c9b48f'], ['Moss', '#5f6b4e'], ['Dusty Lilac', '#b7a5b8']],
  hoodie: [['Oat', '#d8ccb6'], ['Forest', '#2f4a39'], ['Heather Grey', '#a5a29d'], ['Midnight', '#1f2533'], ['Brick', '#8c4a3a']],
};

const COLLECTION: { cat: Cat; sku: string; title: string; color: string; price: number; desc: string }[] = [
  { cat: 'half-sleeve', sku: 'ATL-CRW-CHK', title: 'Chalk Crew Tee', color: 'Chalk', price: 68, desc: 'Heavyweight 240 gsm combed cotton, relaxed crew neck, garment-washed for a soft hand.' },
  { cat: 'half-sleeve', sku: 'ATL-CRW-ONX', title: 'Onyx Crew Tee', color: 'Onyx', price: 68, desc: 'Deep black jersey with a dense, matte knit that holds print edges crisply.' },
  { cat: 'half-sleeve', sku: 'ATL-CRW-SGE', title: 'Sage Crew Tee', color: 'Sage', price: 72, desc: 'Muted botanical green, dyed in small batches. Slightly boxy through the body.' },
  { cat: 'half-sleeve', sku: 'ATL-CRW-CLY', title: 'Clay Crew Tee', color: 'Clay', price: 72, desc: 'Warm terracotta tone with a twin-needle hem and taped shoulders.' },
  { cat: 'half-sleeve', sku: 'ATL-CRW-INK', title: 'Ink Navy Crew Tee', color: 'Ink', price: 68, desc: 'A navy so dark it reads as ink; a quiet base for metallic or white artwork.' },
  { cat: 'half-sleeve', sku: 'ATL-CRW-BTR', title: 'Butter Crew Tee', color: 'Butter', price: 64, desc: 'Soft pastel yellow with a vintage wash.' },
  { cat: 'half-sleeve', sku: 'ATL-CRW-RSW', title: 'Rosewood Crew Tee', color: 'Rosewood', price: 64, desc: 'Dusty rose, cut for a relaxed drop shoulder.' },
  { cat: 'full-sleeve', sku: 'ATL-LS-ECR', title: 'Ecru Long Sleeve Tee', color: 'Ecru', price: 82, desc: 'Long-sleeve 220 gsm jersey with 1x1 rib cuffs that keep their shape.' },
  { cat: 'full-sleeve', sku: 'ATL-LS-CHR', title: 'Charcoal Long Sleeve Tee', color: 'Charcoal', price: 82, desc: 'Charcoal marl long sleeve, set-in sleeves and a clean neck rib.' },
  { cat: 'full-sleeve', sku: 'ATL-LS-OLV', title: 'Olive Long Sleeve Tee', color: 'Olive', price: 84, desc: 'Garment-dyed olive with a soft, lived-in hand.' },
  { cat: 'full-sleeve', sku: 'ATL-LS-STB', title: 'Stone Blue Long Sleeve Tee', color: 'Stone Blue', price: 84, desc: 'Washed blue-grey, regular fit, rib cuffs.' },
  { cat: 'oversized', sku: 'ATL-OV-BNE', title: 'Bone Oversized Tee', color: 'Bone', price: 78, desc: '280 gsm boxy tee with dropped shoulders and a wide, elbow-length sleeve.' },
  { cat: 'oversized', sku: 'ATL-OV-WBK', title: 'Washed Black Oversized Tee', color: 'Washed Black', price: 78, desc: 'Faded black, heavy rib collar, cropped boxy body.' },
  { cat: 'oversized', sku: 'ATL-OV-SND', title: 'Sand Oversized Tee', color: 'Sand', price: 80, desc: 'Warm sand tone in dense heavyweight cotton.' },
  { cat: 'oversized', sku: 'ATL-OV-MOS', title: 'Moss Oversized Tee', color: 'Moss', price: 80, desc: 'Deep moss green with a dry, matte surface.' },
  { cat: 'hoodie', sku: 'ATL-HD-OAT', title: 'Oat Fleece Hoodie', color: 'Oat', price: 128, desc: '420 gsm brushed-back fleece, double-layer hood, kangaroo pocket, flat drawcords.' },
  { cat: 'hoodie', sku: 'ATL-HD-FOR', title: 'Forest Hoodie', color: 'Forest', price: 128, desc: 'Forest green fleece with rib cuffs and waistband.' },
  { cat: 'hoodie', sku: 'ATL-HD-HGR', title: 'Heather Grey Hoodie', color: 'Heather Grey', price: 118, desc: 'Classic heather grey, metal-tipped drawcords.' },
  { cat: 'hoodie', sku: 'ATL-HD-MID', title: 'Midnight Hoodie', color: 'Midnight', price: 128, desc: 'Midnight navy fleece, generous hood, relaxed body.' },
];

let products: { sku: string }[] = [];
try { products = JSON.parse(await fs.readFile(FILE, 'utf8')); } catch { /* first run */ }
const now = new Date().toISOString();
let added = 0;
for (const item of COLLECTION) {
  if (products.some((p) => p.sku === item.sku)) continue;
  const vid = id('v_');
  const pal = PALETTE[item.cat];
  const colors = [pal.find((c) => c[0] === item.color)!, ...pal.filter((c) => c[0] !== item.color)].map(([name, hex]) => ({ name, hex }));
  products.push({
    id: id('p_'), sku: item.sku, title: item.title, description: item.desc, category: item.cat === 'hoodie' ? 'Hoodies' : 'T-Shirts', garment: item.cat,
    price: item.price, currency: 'USD', active: true, sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], colors,
    stock: { XS: 4, S: 12, M: 20, L: 16, XL: 8, XXL: item.cat === 'hoodie' ? 3 : 0 }, liveVersionId: vid,
    versions: [{ id: vid, createdAt: now, status: 'published', pathway: 'glb', templateId: item.cat, modelConfig: await templateConfig(item.cat),
      issues: [{ level: 'info', code: 'template', message: `Uses the Blender-built ${item.cat} garment template.` }] }],
    createdAt: now, updatedAt: now,
  } as never);
  added++;
}

// ---------------------------------------------------------------- perfumes (perfume salon, not customisable)
const bottles = JSON.parse(await fs.readFile('src/lib/perfume/bottles.json', 'utf8'));
const PERFUMES = [
  { sku: 'MDP-QASR-OUD', title: 'Qasr Oud', price: 1450, desc: 'A palace of smoke and gold: Cambodian oud wrapped in saffron and aged amber.', perfume: { bottle: 'qasr', liquid: '#8a4a12', cap: 'gold', volumeMl: 100, concentration: 'Extrait de Parfum', family: 'Oriental · Woody', notes: { top: ['Saffron', 'Pink pepper'], heart: ['Oud', 'Damask rose'], base: ['Amber', 'Leather', 'Sandalwood'] } } },
  { sku: 'MDP-WARD-TAIF', title: 'Ward Taifi', price: 980, desc: 'Taif roses picked at dawn, softened with lychee and white musk.', perfume: { bottle: 'ward', liquid: '#e39aa8', cap: 'rose-gold', volumeMl: 75, concentration: 'Eau de Parfum', family: 'Floral · Rose', notes: { top: ['Lychee', 'Bergamot'], heart: ['Taif rose', 'Peony'], base: ['White musk', 'Cashmere wood'] } } },
  { sku: 'MDP-MAJLIS-NOIR', title: 'Majlis Noir', price: 1250, desc: 'The evening majlis: frankincense, black tea and smoked woods.', perfume: { bottle: 'majlis', liquid: '#7a0f24', cap: 'onyx', volumeMl: 50, concentration: 'Parfum', family: 'Amber · Incense', notes: { top: ['Black tea', 'Cardamom'], heart: ['Frankincense', 'Rose absolute'], base: ['Oud', 'Vanilla', 'Labdanum'] } } },
  { sku: 'MDP-DOHA-PEARL', title: 'Doha Pearl', price: 860, desc: 'Sea air over the Corniche: mineral salt, orange blossom and pearl musk.', perfume: { bottle: 'ward', liquid: '#f1e8da', cap: 'silver', volumeMl: 100, concentration: 'Eau de Parfum', family: 'Fresh · Musky', notes: { top: ['Sea salt', 'Neroli'], heart: ['Orange blossom', 'Jasmine'], base: ['Pearl musk', 'Ambrette'] } } },
  { sku: 'MDP-SADU-SAFFRON', title: 'Sadu Saffron', price: 1100, desc: 'Woven like Sadu textile: saffron threads over honeyed tobacco.', perfume: { bottle: 'majlis', liquid: '#d68a1c', cap: 'gold', volumeMl: 50, concentration: 'Extrait de Parfum', family: 'Spicy · Gourmand', notes: { top: ['Saffron', 'Mandarin'], heart: ['Tobacco', 'Honey'], base: ['Tonka', 'Benzoin', 'Oud'] } } },
];
const liquidNames: Record<string, string> = { '#8a4a12': 'Amber oud', '#e39aa8': 'Taif rose', '#7a0f24': 'Ruby', '#f1e8da': 'Pearl', '#d68a1c': 'Saffron' };
for (const item of PERFUMES) {
  if (products.some((p) => p.sku === item.sku)) continue;
  const vid = id('v_');
  const b = bottles[item.perfume.bottle];
  products.push({
    id: id('p_'), sku: item.sku, title: item.title, description: item.desc, category: 'Perfumes', kind: 'perfume', perfume: item.perfume, garment: 'half-sleeve',
    price: item.price, currency: 'QAR', active: true, sizes: [], colors: [{ name: liquidNames[item.perfume.liquid] ?? 'Signature', hex: item.perfume.liquid }],
    liveVersionId: vid,
    versions: [{ id: vid, createdAt: now, status: 'published', pathway: 'perfume', issues: [{ level: 'info', code: 'perfume', message: 'Seeded perfume (no customisation).' }],
      modelConfig: { modelUrl: `/models/perfume/${item.perfume.bottle}.glb`, source: 'template', printableMeshes: [], colorableMaterials: [], printZones: [], scale: 1, hangOffset: [0, 0, 0], rotationY: 0, centerDrop: b.height / 2, mappingVerified: false, atlasSize: [1024, 512] } }],
    createdAt: now, updatedAt: now,
  } as never);
  added++;
}
// studio photos of the seeded bottles (scripts/blender/render_perfume_shots.py → public/perfume-shots/<SKU>/)
const SHOT_VIEWS = [['front', 'front'], ['three-quarter', 'angle'], ['side', 'side'], ['back', 'back']] as const;
const sharp = (await import('sharp')).default;
let photographed = 0;
for (const item of PERFUMES) {
  const p = products.find((x) => x.sku === item.sku) as { photos?: { url: string }[] } | undefined;
  // never replace photos an admin uploaded; refresh the seeded studio shots
  if (!p || p.photos?.some((ph) => !ph.url.startsWith('/perfume-shots/'))) continue;
  const photos = [];
  for (const [file, view] of SHOT_VIEWS) {
    const rel = `/perfume-shots/${item.sku}/${file}.webp`;
    const meta = await sharp(`public${rel}`).metadata().catch(() => null);
    if (meta) photos.push({ id: id('ph_'), view, url: rel, cutoutUrl: rel, useCutout: true, width: meta.width, height: meta.height });
  }
  if (photos.length) {
    p.photos = photos;
    photographed++;
  }
}
if (photographed) console.log(`attached studio photos to ${photographed} perfume(s)`);
await fs.mkdir(path.dirname(FILE), { recursive: true });
await fs.writeFile(FILE, JSON.stringify(products, null, 2));
console.log(`seeded ${added} product(s); catalogue now has ${products.length}`);
