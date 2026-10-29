import { readFileSync, writeFileSync } from 'node:fs';
import { analyzeGarmentPhoto, colorName } from '../../src/server/garmentPhoto.ts';
for (const [id, out] of [['KTm8yUwkYlB6Nhvg', 'front'], ['tU73UkmQskhpDbFH', 'back']]) {
  const r = await analyzeGarmentPhoto(readFileSync(`data/uploads/${id}.bin`));
  const { design, ...rest } = r;
  console.log(out, JSON.stringify(rest), r.garmentColor && colorName(r.garmentColor), design && { ...design, png: design.png.length });
  if (design) writeFileSync(process.argv[2] + `/extracted-${out}.png`, design.png);
}
