// Rebuilds public/models/tshirt-template-v1.glb with Blender. Set BLENDER_PATH if Blender is elsewhere.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
const candidates = [process.env.BLENDER_PATH, 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe', '/Applications/Blender.app/Contents/MacOS/Blender', 'blender'].filter(Boolean);
const blender = candidates.find((c) => c === 'blender' || existsSync(c));
const r = spawnSync(blender, ['-b', '--factory-startup', '-P', 'scripts/blender/build_tshirt_template.py', '--', 'public/models/tshirt-template-v1.glb', 'assets/processed/tshirt-template-v1.blend'], { encoding: 'utf8' });
const out = (r.stdout ?? '') + (r.stderr ?? '');
const done = out.split('\n').find((l) => l.startsWith('TEMPLATE_DONE'));
if (r.status !== 0 || !done) { console.error(out.slice(-3000)); process.exit(1); }
console.log(done);
