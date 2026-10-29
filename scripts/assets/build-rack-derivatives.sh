#!/usr/bin/env bash
# Reproducible web derivatives of the original rack scan. Never writes to assets/source/.
set -euo pipefail
SRC="assets/source/cloth_rack.glb"
OUT="public/models"
TMP="assets/processed"
mkdir -p "$OUT" "$TMP"
sha256sum "$SRC"
# 1) drop the duplicate TEXCOORD_1/TEXCOORD_2 sets (identical to TEXCOORD_0, verified in Blender)
node scripts/assets/strip-extra-uvs.mjs "$SRC" "$TMP/rack-uv0.glb"
# 2) high (2048 WebP) and low (1024 WebP) variants, meshopt-compressed geometry
gltf-transform optimize "$TMP/rack-uv0.glb" "$OUT/rack-2k.glb" --texture-compress webp --texture-size 2048 --compress meshopt --simplify false --weld false
gltf-transform optimize "$TMP/rack-uv0.glb" "$OUT/rack-1k.glb" --texture-compress webp --texture-size 1024 --compress meshopt --simplify true --simplify-ratio 0.5 --simplify-error 0.0005 --weld false
sha256sum "$SRC"
ls -la "$OUT"
