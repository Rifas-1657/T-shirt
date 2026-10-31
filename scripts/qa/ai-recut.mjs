// QA/maintenance: removes the given photo ids, then queues "Cut out with AI" for every framed photo of the
// given SKUs and waits until done. Usage: node scripts/qa/ai-recut.mjs <sku,sku> [photoIdToDelete...]
import { readFileSync } from 'node:fs';
const [skus, ...drop] = process.argv.slice(2);
const base = 'http://localhost:3000';
const pw = readFileSync('.env.local', 'utf8').match(/^ADMIN_PASSWORD=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
const login = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', origin: base }, body: JSON.stringify({ password: pw }) });
const h = { cookie: login.headers.get('set-cookie')?.split(';')[0], origin: base };
const list = async () => (await (await fetch(`${base}/api/admin/products`, { headers: h })).json()).products.filter((p) => skus.split(',').includes(p.sku));
for (const p of await list()) for (const ph of p.photos) if (drop.includes(ph.id)) await fetch(`${base}/api/admin/products/${p.id}/photos/${ph.id}`, { method: 'DELETE', headers: h });
for (const p of await list())
  for (const ph of p.photos)
    if (!ph.cutoutUrl) await fetch(`${base}/api/admin/products/${p.id}/photos/${ph.id}`, { method: 'PATCH', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ aiCutout: true }) });
const t = Date.now();
for (;;) {
  await new Promise((r) => setTimeout(r, 3000));
  const ps = await list();
  const left = ps.flatMap((p) => p.photos).filter((ph) => ph.cutout === 'working').length;
  if (!left) {
    for (const p of ps) console.log(p.sku, p.photos.map((ph) => `${ph.view}:${ph.cutoutUrl ? 'cut' : ph.cutout ?? 'framed'}`).join(' '), 'liquid', p.perfume?.liquid);
    console.log(`done in ${Math.round((Date.now() - t) / 1000)} s`);
    break;
  }
}
