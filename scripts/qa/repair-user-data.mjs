// One-off repair of the dev catalogue through the public admin API (same calls the admin UI makes).
import { readFileSync } from 'node:fs';
const BASE = 'http://localhost:3000';
const pw = readFileSync('.env.local', 'utf8').match(/^ADMIN_PASSWORD=(.*)$/m)[1].trim();
const H = { origin: BASE };
const login = await fetch(`${BASE}/api/admin/login`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) });
const cookie = login.headers.get('set-cookie').split(';')[0];
const call = async (path, init = {}) => {
  const r = await fetch(BASE + path, { ...init, headers: { ...H, cookie, ...(init.headers ?? {}) } });
  const b = await r.json();
  if (!r.ok) throw new Error(`${path}: ${JSON.stringify(b.errors ?? b)}`);
  return b;
};
const json = (method, body) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const { products } = await call('/api/admin/products');
const onyx = products.find((p) => p.sku === 'ATL-CRW-ONX');
const rif = products.find((p) => p.sku === 'ARASAD');
// 1) Onyx: roll back to its original template version
const original = onyx.versions.find((v) => v.pathway === 'glb' && v.modelConfig.source === 'template');
await call(`/api/admin/products/${onyx.id}/publish`, json('POST', { versionId: original.id }));
console.log('Onyx rolled back to', original.id);
// 2) Rif: re-run the user's own photos through the new pipeline, approve and publish
const imgV = rif.versions.find((v) => v.pathway === 'template-images');
const src = (url) => readFileSync(`data/uploads/${url.split('/').pop()}.bin`);
const fd = new FormData();
fd.append('front', new Blob([src(imgV.baseLayers.front[0].src)], { type: 'image/png' }), 'front.png');
fd.append('back', new Blob([src(imgV.baseLayers.back[0].src)], { type: 'image/png' }), 'back.png');
const { version } = await call(`/api/admin/products/${rif.id}/images`, { method: 'POST', body: fd });
console.log('Rif new version', version.id, version.issues.map((i) => `${i.level}:${i.code}`).join(', '));
console.log('layers', JSON.stringify(version.baseLayers));
await call(`/api/admin/products/${rif.id}/versions/${version.id}`, json('PATCH', { artworkApproved: true }));
await call(`/api/admin/products/${rif.id}/publish`, json('POST', { versionId: version.id }));
const pub = (await (await fetch(`${BASE}/api/products`)).json()).products.find((p) => p.sku === 'ARASAD');
console.log('Rif public:', pub.garment, pub.colors[0], pub.version.modelConfig.modelUrl);
