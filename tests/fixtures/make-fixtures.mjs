// Generates admin-upload fixtures from the template GLB. Run: node tests/fixtures/make-fixtures.mjs
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { promises as fs } from 'node:fs';
const dir = new URL('./', import.meta.url);
const src = 'public/models/tshirt-template-v1.glb';
await fs.copyFile(src, new URL('valid-shirt.glb', dir));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) p.setAttribute('TEXCOORD_0', null);
for (const t of doc.getRoot().listTextures()) t.dispose(); // textures without UVs would be meaningless
await io.write(new URL('no-uv-shirt.glb', dir).pathname.replace(/^\/([A-Za-z]:)/, '$1'), doc);
await fs.writeFile(new URL('not-a-model.glb', dir), 'this is plainly not a binary glTF file, just text with a .glb extension');
// GLB whose JSON references an external buffer
const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, buffers: [{ uri: 'external.bin', byteLength: 4 }] }).padEnd(80, ' '));
const header = Buffer.alloc(20);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + json.length, 8);
header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
await fs.writeFile(new URL('external-uri.glb', dir), Buffer.concat([header, json]));
// small artwork fixtures: an asymmetric arrow logo (orientation errors are obvious)
const sharp = (await import('sharp')).default;
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" rx="18" fill="#9c4a2e"/><path d="M40 80 H230 M200 40 L260 80 L200 120" stroke="#f4efe6" stroke-width="22" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="40" cy="40" r="14" fill="#f4efe6"/></svg>`;
await fs.writeFile(new URL('logo-arrow.png', dir), await sharp(Buffer.from(logoSvg)).png().toBuffer());
const backSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#1f4e79"/><path d="M200 60 L320 200 H240 V340 H160 V200 H80 Z" fill="#f4efe6"/><circle cx="60" cy="60" r="26" fill="#efdca6"/></svg>`;
await fs.writeFile(new URL('back-print.png', dir), await sharp(Buffer.from(backSvg)).png().toBuffer());
// product photos like a shop's catalogue shots: black tee on a light studio backdrop
const tee = `M150 70 L215 55 Q250 80 285 55 L350 70 L440 130 L400 205 L360 185 L360 470 L140 470 L140 185 L100 205 L60 130 Z`;
const backdrop = `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f4f2"/><stop offset="1" stop-color="#e2e2df"/></linearGradient></defs><rect width="500" height="520" fill="url(#bg)"/><ellipse cx="250" cy="485" rx="150" ry="10" fill="#cfcfcb"/>`;
const photoFront = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="520">${backdrop}<path d="${tee}" fill="#1c1c1c"/><rect x="250" y="62" width="10" height="10" fill="#eee"/><g fill="#e9e6df"><rect x="185" y="160" width="130" height="22"/><rect x="200" y="190" width="100" height="22"/><circle cx="300" cy="140" r="14"/><rect x="190" y="222" width="40" height="5"/><rect x="250" y="222" width="60" height="5"/></g></svg>`;
const photoBack = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="520">${backdrop}<path d="${tee}" fill="#1c1c1c"/></svg>`;
await fs.writeFile(new URL('product-photo-front.png', dir), await sharp(Buffer.from(photoFront)).png().toBuffer());
await fs.writeFile(new URL('product-photo-back.png', dir), await sharp(Buffer.from(photoBack)).png().toBuffer());
await fs.writeFile(new URL('huge-dimensions.png', dir), await sharp({ create: { width: 7000, height: 40, channels: 3, background: '#fff' } }).png().toBuffer());
await fs.writeFile(new URL('evil.svg', dir), '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" onload="alert(1)"><script>alert(2)</script><circle cx="50" cy="50" r="40" fill="#9c4a2e"/><foreignObject><iframe src="https://example.com"/></foreignObject></svg>');
console.log('fixtures written');
