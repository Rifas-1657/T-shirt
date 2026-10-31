// Downloads CC0 assets from Poly Haven (https://polyhaven.com, licence: CC0 — no attribution required,
// credited anyway in docs/ASSET_CREDITS.md) at 1K resolution and optimises them for the web.
// Usage: node scripts/assets/fetch-polyhaven.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const MODELS = ['mid_century_lounge_chair', 'potted_plant_01', 'potted_plant_02', 'modern_coffee_table_01', 'ornate_mirror_01', 'ceramic_vase_02'];
const TEXTURES = { herringbone_parquet: ['Diffuse', 'nor_gl', 'Rough'], grey_plaster_03: ['Diffuse', 'nor_gl', 'Rough'], rock_wall_02: ['Diffuse', 'nor_gl', 'Rough'] };
const HDRIS = ['brown_photostudio_02'];
const API = 'https://api.polyhaven.com';
const credits = [];

async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}
async function download(url, file) {
  if (existsSync(file)) return;
  mkdirSync(path.dirname(file), { recursive: true });
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}
async function info(id) {
  const i = await json(`${API}/info/${id}`);
  credits.push({ id, name: i.name, authors: Object.keys(i.authors ?? {}), url: `https://polyhaven.com/a/${id}`, licence: 'CC0' });
}

for (const id of MODELS) {
  const f = await json(`${API}/files/${id}`);
  const g = f.gltf['1k'].gltf;
  const dir = `assets/processed/polyhaven/${id}`;
  await download(g.url, `${dir}/${id}.gltf`);
  for (const [rel, inc] of Object.entries(g.include ?? {})) await download(inc.url, `${dir}/${rel}`);
  mkdirSync('public/models/props', { recursive: true });
  execFileSync('gltf-transform', ['optimize', `${dir}/${id}.gltf`, `public/models/props/${id}.glb`, '--texture-compress', 'webp', '--texture-size', '1024', '--compress', 'meshopt'], { stdio: 'inherit', shell: true });
  await info(id);
  console.log('model', id);
}
for (const [id, maps] of Object.entries(TEXTURES)) {
  const f = await json(`${API}/files/${id}`);
  for (const m of maps) await download(f[m]['1k'].jpg.url, `public/textures/${id}_${m}.jpg`);
  await info(id);
  console.log('texture', id);
}
for (const id of HDRIS) {
  const f = await json(`${API}/files/${id}`);
  await download(f.hdri['1k'].hdr.url, `public/hdri/${id}_1k.hdr`);
  await info(id);
  console.log('hdri', id);
}
writeFileSync('public/models/props/CREDITS.json', JSON.stringify(credits, null, 2));
console.log('done');
