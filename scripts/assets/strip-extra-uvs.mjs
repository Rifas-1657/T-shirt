// Remove TEXCOORD_1+ from every primitive (they duplicate TEXCOORD_0 in the rack scan).
import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';
const [src, out] = process.argv.slice(2);
const io = new NodeIO();
const doc = await io.read(src);
for (const mesh of doc.getRoot().listMeshes())
  for (const prim of mesh.listPrimitives())
    for (const sem of prim.listSemantics())
      if (/^TEXCOORD_[1-9]/.test(sem)) prim.setAttribute(sem, null);
await doc.transform(prune());
await io.write(out, doc);
console.log('wrote', out);
