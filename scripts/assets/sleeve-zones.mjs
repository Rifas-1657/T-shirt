// Adds left/right sleeve print zones to the garment templates. A sleeve is a slanted strip of the flat
// front pattern, so its zone is a box centred on the sleeve's centre line (armhole → cuff), rotated to
// that line. The same rule is used by scripts/blender/build_garment.py when the templates are rebuilt.
// Usage: node scripts/assets/sleeve-zones.mjs [--plot out.svg outlines.json]
import { readFileSync, writeFileSync } from 'node:fs';

// from scripts/blender/build_garment.py (right half of the pattern, metres)
const PATTERN = {
  'half-sleeve': { armhole: [[0.215, 0.682], [0.262, 0.5]], cuff: [[0.338, 0.56], [0.276, 0.49]], at: 0.5, span: 0.8, z0: -0.04 },
  // long sleeves are narrow strips (about 5 cm flat): a tall zone running down the upper arm, centred
  // between the sleeve's outer and inner edge at that height (`c`)
  'full-sleeve': { armhole: [[0.215, 0.682], [0.268, 0.488]], cuff: [[0.374, 0.092], [0.298, 0.078]], at: 0.32, c: [0.303, 0.42], w: 0.04, h: 0.09, span: 0.8, z0: -0.04 },
  oversized: { armhole: [[0.3, 0.724], [0.306, 0.47]], cuff: [[0.44, 0.6], [0.322, 0.476]], at: 0.5, span: 0.92, z0: -0.04 },
  hoodie: { armhole: [[0.24, 0.69], [0.29, 0.48]], cuff: [[0.374, 0.075], [0.306, 0.066]], at: 0.32, c: [0.32, 0.42], w: 0.042, h: 0.09, span: 0.82, z0: -0.04 },
};

const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const r3 = (v) => Math.round(v * 1e5) / 1e5;

export function sleeveZones(p) {
  const m0 = mid(...p.armhole);
  const m1 = mid(...p.cuff);
  const d = [m1[0] - m0[0], m1[1] - m0[1]];
  const len = Math.hypot(...d);
  const c = p.c ?? [m0[0] + d[0] * p.at, m0[1] + d[1] * p.at];
  // sleeve width at the zone, measured across the sleeve
  const across = dist(...p.armhole) * (1 - p.at) + dist(...p.cuff) * p.at;
  const w = p.w ?? Math.min(0.09, across * 0.55);
  const h = p.h ?? Math.min(0.1, len * 0.42, w * 1.15);
  // canvas rotation (clockwise degrees) that turns the zone's "down" toward the cuff; atlas y points down
  const angle = (Math.atan2(-d[0], -d[1]) * 180) / Math.PI;
  const zone = (id, label, x, a) => {
    const u = 0.5 * (x / p.span + 0.5);
    const v = (c[1] - p.z0) / p.span;
    const hu = (0.5 * w) / p.span / 2;
    const hv = h / p.span / 2;
    return { id, label, widthCm: Math.round(w * 1000) / 10, heightCm: Math.round(h * 1000) / 10, angle: Math.round(a * 10) / 10, uvRect: { u0: r3(u - hu), v0: r3(v - hv), u1: r3(u + hu), v1: r3(v + hv) } };
  };
  // the wearer's left sleeve is on the viewer's right (x > 0) of the front pattern
  return [zone('sleeveL', 'Left sleeve', c[0], angle), zone('sleeveR', 'Right sleeve', -c[0], -angle)];
}

// --plot <out.svg> <outlines.json>: draws the zones over the pattern outlines to check they sit on the sleeves
const at = process.argv.indexOf('--plot');
const plot = at > 0 ? process.argv[at + 1] : null;
const outlines = at > 0 ? JSON.parse(readFileSync(process.argv[at + 2], 'utf8')) : null;
const svg = [];
for (const [cat, p] of Object.entries(PATTERN)) {
  const zones = sleeveZones(p);
  for (const file of [`src/lib/garment-templates/${cat}.json`, `assets/processed/garments/${cat}.json`]) {
    const t = JSON.parse(readFileSync(file, 'utf8'));
    t.printZones = [...t.printZones.filter((z) => !z.id.startsWith('sleeve')), ...zones];
    writeFileSync(file, JSON.stringify(t, null, 2) + '\n');
  }
  console.log(cat, zones.map((z) => `${z.id} ${z.widthCm}x${z.heightCm}cm @${z.angle}°`).join('  '));
  if (plot) {
    // flat pattern (front, right half + mirror) with the zones drawn back in pattern space
    const outline = outlines[cat];
    const full = [...outline, ...outline.slice(1, -1).reverse().map(([x, z]) => [-x, z])];
    const S = 500;
    const pt = ([x, z]) => `${(x + 0.5) * S},${(0.85 - z) * S}`;
    const off = Object.keys(PATTERN).indexOf(cat) * S;
    svg.push(`<g transform="translate(${off} 0)"><polygon points="${full.map(pt).join(' ')}" fill="#eee" stroke="#333"/>`);
    for (const z of zones) {
      const cx = (((z.uvRect.u0 + z.uvRect.u1) / 2) / 0.5 - 0.5) * p.span;
      const cz = ((z.uvRect.v0 + z.uvRect.v1) / 2) * p.span + p.z0;
      const w = z.widthCm / 100;
      const h = z.heightCm / 100;
      svg.push(`<g transform="translate(${pt([cx, cz])}) rotate(${z.angle})"><rect x="${(-w / 2) * S}" y="${(-h / 2) * S}" width="${w * S}" height="${h * S}" fill="rgba(200,0,0,.4)"/><line x1="0" y1="0" x2="0" y2="${(-h / 2) * S}" stroke="blue"/></g>`);
    }
    svg.push(`<text x="10" y="20">${cat}</text></g>`);
  }
}
if (plot) writeFileSync(plot, `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="500" style="background:#fff">${svg.join('')}</svg>`);
