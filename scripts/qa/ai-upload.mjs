// QA: signs in (password from .env.local, never printed), uploads a busy-background photo to a perfume and
// waits for the AI cut-out to finish. Usage: node scripts/qa/ai-upload.mjs <productSku> <photo>
import { readFileSync } from 'node:fs';
const [sku, file] = process.argv.slice(2);
const base = 'http://localhost:3000';
const pw = readFileSync('.env.local', 'utf8').match(/^ADMIN_PASSWORD=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
const login = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', origin: base }, body: JSON.stringify({ password: pw }) });
const cookie = login.headers.get('set-cookie')?.split(';')[0];
const h = { cookie, origin: base };
const list = async () => (await (await fetch(`${base}/api/admin/products`, { headers: h })).json()).products;
const p = (await list()).find((x) => x.sku === sku);
const fd = new FormData();
fd.append('photo', new Blob([readFileSync(file)], { type: 'image/png' }), 'busy.png');
const up = await (await fetch(`${base}/api/admin/products/${p.id}/photos`, { method: 'POST', headers: h, body: fd })).json();
console.log('upload notes:', up.notes, 'errors:', up.errors);
const id = up.photos.at(-1).id;
const t = Date.now();
for (;;) {
  await new Promise((r) => setTimeout(r, 2000));
  const ph = (await list()).find((x) => x.id === p.id).photos.find((x) => x.id === id);
  if (ph.cutout !== 'working') {
    console.log(`after ${Math.round((Date.now() - t) / 1000)} s:`, JSON.stringify(ph));
    break;
  }
}
