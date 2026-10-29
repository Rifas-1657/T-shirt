// Builds every garment template with Blender, optimises it for the web and writes the sidecar JSON
// the app imports. Usage: node scripts/assets/build-garments.mjs [category ...]   (BLENDER_PATH overrides)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, writeFileSync, statSync } from 'node:fs';
const cats = process.argv.slice(2).length ? process.argv.slice(2) : ['half-sleeve', 'full-sleeve', 'oversized', 'hoodie'];
const blender = [process.env.BLENDER_PATH, 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe', '/Applications/Blender.app/Contents/MacOS/Blender', 'blender'].filter(Boolean).find((c) => c === 'blender' || existsSync(c));
mkdirSync('assets/processed/garments', { recursive: true });
mkdirSync('public/models/garments', { recursive: true });
mkdirSync('src/lib/garment-templates', { recursive: true });
for (const cat of cats) {
  const raw = `assets/processed/garments/${cat}-v2-raw.glb`;
  const meta = `assets/processed/garments/${cat}.json`;
  const t0 = Date.now();
  const r = spawnSync(blender, ['-b', '--factory-startup', '-P', 'scripts/blender/build_garment.py', '--', cat, raw, meta, `assets/processed/garments/${cat}-v2.blend`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  writeFileSync(`assets/processed/garments/log-${cat}.txt`, out);
  if (r.status !== 0 || !out.includes('GARMENT_DONE')) { console.error(out.slice(-3000)); process.exit(1); }
  const web = `public/models/garments/${cat}-v2.glb`;
  const o = spawnSync('gltf-transform', ['optimize', raw, web, '--texture-compress', 'webp', '--texture-size', '2048', '--compress', 'meshopt', '--simplify', 'false', '--weld', 'false', '--join', 'false', '--flatten', 'false', '--instance', 'false'], { encoding: 'utf8', shell: true });
  if (o.status !== 0) { console.error(o.stdout, o.stderr); process.exit(1); }
  copyFileSync(meta, `src/lib/garment-templates/${cat}.json`);
  console.log(`${cat}: ${((Date.now() - t0) / 1000).toFixed(0)} s, raw ${(statSync(raw).size / 1048576).toFixed(2)} MB -> web ${(statSync(web).size / 1048576).toFixed(2)} MB`);
}
