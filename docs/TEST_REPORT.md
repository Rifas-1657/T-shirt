# Test report

Final run (round 2): 2026-10-29, Windows 11, Node 24.14.0, Chromium 1248 via Playwright 1.64.1, GPU: AMD Radeon (ANGLE/D3D11).

## Gates

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | **pass** |
| Lint | `npm run lint` | **pass** (0 problems) |
| Unit | `npm test` | **51 / 51 pass** (6 files) |
| Production build | `npm run build` | **pass**, no warnings |
| End-to-end | `npm run test:e2e` (isolated server :3100, fresh data, random admin password) | **12 / 12 pass** (2.3 min) |
| Source asset integrity | `sha256sum assets/source/cloth_rack.glb` | unchanged `0eded0d0…ab803da` |

## Unit tests

| File | Tests | Covers |
|---|---|---|
| `garments.test.ts` (new) | 18 | each of the 4 shipped template GLBs validates, has a UV'd `Shirt` mesh and the colourable materials; both print zones are valid, undistorted, in their atlas halves and **cover real UV islands**; templates are drape-simulated; classifier cases (title wins over vague description words); legacy normalisation (category inference, template resolution, override, uploads untouched); artwork contain-fit and DPI warnings |
| `printZones.test.ts` | 9 | zone↔atlas↔UV transforms, bounds/clipping |
| `designSchema.test.ts` | 5 | versioned design validation |
| `atlasRenderer.test.ts` | 5 | atlas placement, no mirroring |
| `glbValidate.test.ts` | 6 | GLB inspection and rejection cases |
| `server.test.ts` | 8 | upload sniffing/SVG sanitising, public projection, session tokens |

## End-to-end tests

| Test | Verified |
|---|---|
| admin security | anonymous → 401, cross-origin → 403 |
| GLB workflow | invalid/no-UV/external/oversize GLBs fail safely; valid GLB → profile → mapping → publish → in the shop; unpublish |
| **image pathway → rack** (new) | title "Arrow Print Hoodie" auto-classified as Hoodie; invalid image refused; front+back PNGs → hoodie template, DPI warnings; publish blocked until approval; placement saved; preview front/back; approve → publish → activate; API: `garment: hoodie`, hoodie template, placed layers; **storefront scene: product on the hoodie rack**; override to oversized → moves rack and template; invalid category → 422; external-URL placement → 422; unpublish → gone from the rack |
| browse (updated) | API grouping == scene grouping for every product; ≥4 garments per rack; hover caption; keyboard index; colour; front/back/reset; Escape; no console errors |
| **3D click → Customise immediately** (new) | on each of the 4 racks, a real mouse click on the 3D garment shows the details panel and an **enabled** Customise button within 1 s; editor opens |
| rack navigation (new) | tabs, ←/→ keys, overview |
| customise + save/restore | text, upload, undo/redo, back zone, save → restore in a fresh page |
| tampered design | 422 |
| GPU memory | no growth over 12 extra product cycles |
| desktop perf | scene ready ≈ 1–1.2 s locally, ≥ 20 fps asserted (60 measured) |
| mobile 390×844 | collection/detail/editor usable, no horizontal overflow |
| reduced motion | honoured |

## Rendering performance (measured with `window.__atelier.info()` + rAF count over 3 s)

| Viewport | View | fps | Draw calls | Triangles | Textures | Geometries |
|---|---|---|---|---|---|---|
| 1440×900 | one rack | 60 | 88 | 698,480 | 24 | 73 |
| 1440×900 | all racks | 60 | 205 | 1,337,881 | — | — |
| 390×844 (emulated) | one rack | 60 | 84 | 697,296 | 19 | 54 |
| 390×844 (emulated) | all racks | 60 | 133 | 961,663 | — | — |

60 fps is the display cap. Measured on a desktop GPU; real phones were not tested.

## Asset sizes

| Template | Web GLB | Raw (Blender) | Build time |
|---|---|---|---|
| half-sleeve-v2 | 0.28 MB | 3.10 MB | 55 s |
| full-sleeve-v2 | 0.35 MB | 3.38 MB | 47 s |
| oversized-v2 | 0.33 MB | 3.36 MB | 48 s |
| hoodie-v2 | 0.47 MB | 3.79 MB | 53 s |

Web versions: meshopt-quantised geometry; WebP textures (2048×1024 detail normal, 1024×512 heather base colour and AO, 256² rib normal).

## Visual evidence

- Garment templates: `docs/garments/all-garments.jpg` (front, ¾, back of each); simulation before/after: `docs/garments/half-nosim.jpg` vs `half-sim.jpg`.
- Racks: `docs/screenshots/v2-01-rack.png`, `v2-02-hoodie-rack.png`, `v2-03-oversized-hover.png`, `v2-04-all-racks.png`, `v2-mobile.png`, `e2e/all-racks.png`, `e2e/hoodie-rack.png`.
- Detail on each rack: `docs/screenshots/e2e/detail-{half-sleeve,full-sleeve,oversized,hoodie}.png`.
- Mapping on each template: `docs/screenshots/v2-map-{ATL-CRW-CHK,ATL-LS-ECR,ATL-OV-BNE,ATL-HD-OAT}-{front,back}.png`.
- Admin image pathway: `e2e/admin-artwork-front.png`, `-back.png`; storefront result `e2e/uploaded-hoodie-front.png`, `-back.png`.

## Limits of this verification

Chromium only; one Windows PC; emulated mobile; pointer drags in the editor and orbit were not automated; no screen-reader/axe audit.
