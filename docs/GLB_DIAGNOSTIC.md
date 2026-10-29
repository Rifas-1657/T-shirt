# GLB diagnostic

## 1. Supplied model: `assets/source/cloth_rack.glb`

Inspected with `gltf-transform inspect` and the headless Blender script `scripts/blender/inspect_glb.py` (raw output: `docs/glb-inspection/glb_inspection.json`). Renders: `docs/glb-inspection/renders-grid.jpg` (front/back/side/top) and the base-colour atlas preview `docs/glb-inspection/atlas_basecolor_1k.jpg`.

| Property | Value |
|---|---|
| Title / author / licence (glTF `asset.extras`) | "Cloth Rack" by **vitor.nadu**, **CC BY 4.0**, https://sketchfab.com/3d-models/cloth-rack-14c8ceb3a9d24e95a1488f07526fabae |
| Generator | Sketchfab-17.22.0, glTF 2.0, no extensions |
| File size | 36.65 MB, SHA-256 `0eded0d0…ab803da` (unchanged) |
| Content | **A metal clothing rack holding six long, stand-collar, button-front coats** (2 white, 2 greige, 2 rust) on wooden hangers. **There is no T-shirt.** |
| Hierarchy | `Sketchfab_model › root › GLTF_SceneRootNode › mesh_uv.obj_0 › Object_4…Object_9` |
| Meshes | 6 primitives of ≤65,532 vertices each (the chunks are split by **vertex count**, not by garment) |
| Triangles / vertices | 499,976 triangles; 350,523 uploaded vertices |
| Connectivity | 15,081 loose parts as stored (vertices split along UV seams). After merge-by-distance (0.5 mm): **1 connected component**. Coats, hangers and rail are fused into one surface, and the coats overlap like shingles. |
| Bounding box | 1.80 × 1.15 × 0.40 m (centred on the origin) |
| Materials | one: `defaultMat` (baseColor + metallicRoughness textures; no normal map) |
| Textures | 4096×4096 PNG base colour (9.8 MB) and 4096×4096 PNG metallic/roughness (4.0 MB) |
| UV sets | TEXCOORD_0/1/2, all identical. An **auto-unwrapped atlas** with hundreds of fragmented islands and **baked lighting**. |
| Animations | none |
| What "4K" means | **Texture resolution only** (4096² maps). The mesh is a mid-density scan, not "4K geometry". |

### Suitability for customisation: **not suitable**

- There is no T-shirt, and no single garment can be isolated: connectivity fuses everything, and spatial cropping cuts through overlapping neighbours.
- The UV layout is an automatic atlas shared by six coats, with shading baked in. A front/back print zone would cover many disconnected islands, and printed artwork would inherit baked shadows.
- Following spec §4/§8 ("do not fake accurate mapping … disable customisation and explain why"), the rack is used **only as a non-interactive showroom set piece** and is never offered for customisation.

**Decision (confirmed by the user in-session):** keep the rack as the real centrepiece and build a clearly labelled **T-shirt template** in Blender with a controlled print UV layout.

### Web derivatives (source untouched)

`scripts/assets/build-rack-derivatives.sh` (run with `npm run assets:rack`):
1. strip the duplicate TEXCOORD_1/2 sets (`scripts/assets/strip-extra-uvs.mjs`)
2. `gltf-transform optimize` → meshopt geometry + WebP textures

| Output | Size | Textures | Geometry |
|---|---|---|---|
| `public/models/rack-2k.glb` (desktop) | 3.72 MB | 2048² WebP | full, meshopt |
| `public/models/rack-1k.glb` (mobile ≤767 px) | 2.25 MB | 1024² WebP | simplified 50 %, meshopt |

Both were visually verified in the browser (`docs/screenshots/e2e/collection.png`): textures, buttons, stitching and hangers are intact, and the UVs are not corrupted. The shop does **not** claim 4K detail: it serves 2K and 1K textures.

## 2. T-shirt template: `public/models/tshirt-template-v1.glb`

Built reproducibly by `scripts/blender/build_tshirt_template.py` (`npm run assets:template`; the editable `.blend` is saved to `assets/processed/`).

| Property | Value |
|---|---|
| Construction | T-shirt outline (S/M proportions, short sleeves) → constrained Delaunay triangulation of the front and back panels with interior points every 5.5 mm → panels inflated with a rounded seam profile, tapered from shoulder (2.1 cm half-thickness) to hem → welded along the side/shoulder/sleeve seams. Front crew-neck scoop opening, back neckline higher. Rib collar tube, wooden hanger arms, chrome hook. Gentle folds are added **only outside the print zones**, so no fake folds distort logos. |
| Meshes | `Shirt` (≈50k tris, printable), `Collar` (1.5k), `HangerWood` (0.8k), `HangerHook` (2.4k) — 52,632 faces total |
| Materials | `Fabric` (colourable, 512² tiled knit normal map, roughness 0.93, sheen), `HangerWood`, `HangerChrome` |
| Origin | centre of the hook curl (the point that rests on the rail) |
| Size | 0.68 m across the sleeves × 0.82 m including the hook |
| File | 1.24 MB |
| **Print UV (UV0)** | 2:1 atlas. Front panel → u ∈ [0, 0.5] by planar projection, **u grows to the viewer's right**. Back panel → u ∈ [0.5, 1], **mirrored so u grows to the viewer's right when seen from behind**. v = (z + 0.04)/0.80, isotropic, so no stretching. |
| Print zones (`src/lib/template.ts`) | Front 30 × 40 cm: UV (0.156, 0.263)–(0.344, 0.763). Back 30 × 45 cm: UV (0.656, 0.250)–(0.844, 0.813). |

### Mapping verification

- **Unit test** `tests/unit/glbValidate.test.ts`: both template zones overlap real UV islands of the `Shirt` mesh (front 15.7 %, back 17.8 % of printable triangles).
- **Unit test** `tests/unit/printZones.test.ts`: the zones sit in their own atlas halves, and aspect distortion is under 1 %.
- **Unit test** `tests/unit/atlasRenderer.test.ts`: front artwork lands in the left half and back artwork in the right half, at the editor coordinates, with no mirrored transform.
- **Browser test (asymmetric text):** `docs/screenshots/04-mapping-front.png` shows "FRONT LEFT" placed left in the editor appearing on the viewer's left of the chest, readable. `docs/screenshots/05-mapping-back.png` shows "BACK CENTER" centred on the back and readable (not mirrored). The admin mapping pattern (`docs/screenshots/e2e/admin-mapping-front.png`, `admin-mapping-back.png`) shows red FRONT LEFT, blue ↑TOP pointing up, green BACK CENTER and an R→ marker on the viewer's right of the back. All are correct.
- **Clipping:** artwork extending past a zone is cut at the same edge in both the editor and on the shirt, with a warning (`04-mapping-front.png`, first pass).

### Known limits of the template

- It is a **template**, not a scan: there is no fabric weave detail beyond a tiled knit normal map, and it has one fit (no size grading).
- The print surface is curved by the inflation, but artwork is applied by planar projection. Distortion is negligible in the chest/back zones and grows toward the side seams, where the zones do not reach.
- Seams have no stitch geometry; the hem and cuff hems are implied only by silhouette.

## 3. Uploaded GLBs (admin)

Every upload is inspected server-side (`src/server/glbValidate.ts`): GLB header and version, JSON chunk, required extensions (Draco is refused with a re-export hint), external URIs, size ≤ 60 MB, triangles ≤ 2 M, textures ≤ 8192², mesh/material/UV report, and bounding box. Customisation needs an explicit per-product profile (printable meshes + UV zones). The server checks that profile against the model's real UVs (zone coverage > 0), and the admin must confirm the asymmetric FRONT LEFT / BACK CENTER test in the preview before customisation is enabled.

## 4. Round 2: garment templates v2 (`public/models/garments/*-v2.glb`)

**Why v1 was unsuitable:** it was a static inflated silhouette, with no gravity drape, stitching, AO or category variants. Edge-on on the rail it looked like a puffy pillow with lumpy sides. The coat-rack scan did not match the intended store, so it is no longer displayed.

**Generator:** `scripts/blender/build_garment.py <category>`, driven by `npm run assets:garments`.

| Step | Detail |
|---|---|
| Pattern | Category outline (right half, mirrored) → front panel with crew-neck scoop and back panel, constrained Delaunay at 6.8 mm → inflated with a rounded seam profile, tapered toward the hem → seams welded (exactly one boundary loop: the neck) |
| Print UVs | Assigned on the flat pattern before simulation, so prints follow the fabric through the drape (front u ∈ [0,.5], back mirrored into [.5,1], isotropic) |
| Drape | Blender cloth: shoulders pinned along the hanger line, gravity, light pressure, self-collision, 48 frames, then corrective smooth |
| Trims (built on the simulated surface) | Rib collar tube along the real neck loop; hoodie: rolled hood edge, hood shell down the back, kangaroo pocket (offset + solidified copy of the body patch), drawcords with metal aglets; wooden hanger + chrome hook |
| Textures | 2048×1024 detail normal (jersey/fleece grain, twin-needle hems, shoulder and armhole seams with dashed topstitch, rib bands at cuffs/waistband, pocket topstitch); heathered base colour; 1024×512 **Cycles-baked AO** exported as glTF occlusion; tiled rib normal for trims |
| Materials | `Fabric` (body/hood/pocket; colourable; sheen tuned per fabric) and `Rib` (colourable); hanger, chrome and aglet materials fixed |
| Sidecar | `src/lib/garment-templates/<cat>.json`: print zones (UV rects + cm), printable meshes, colourable materials, body size, centre drop, triangle count |

| Category | Silhouette | Print zones (W×H cm) | Triangles |
|---|---|---|---|
| half-sleeve | regular crew, short set-in sleeves | front 30×40, back 30×45 | ≈39k |
| full-sleeve | regular body, long sleeves hanging beside the body, rib cuffs | front 30×40, back 30×45 | ≈41k |
| oversized | boxy 60 cm body, dropped shoulders, wide elbow sleeves, heavier rib collar | front 34×44, back 34×50 | ≈42k |
| hoodie | fleece body, long sleeves, rib cuffs and waistband, hood, kangaroo pocket, drawcords | front 26×24 (above the pocket), back 32×32 (below the hood) | ≈46k |

**Verification:** zone coverage of real UV islands for every template (unit tests); FRONT LEFT / BACK CENTER screenshots on every template (`docs/screenshots/v2-map-*.png`); studio renders `docs/garments/all-garments.jpg`.

**Known limits:** one size per category (no grading). Hoodie drawcords hang across part of the chest zone. Sleeves, hood and pocket are not printable. Fabric detail is generated, not scanned.
