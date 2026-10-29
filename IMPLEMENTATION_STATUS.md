# Implementation status

Last updated 2026-10-29 (round 2: four garment racks, realistic templates, Customise bug fix, admin rack assignment).
Evidence: `docs/TEST_REPORT.md` (T), unit tests (U), e2e tests (E), screenshots (S).

## Round 3 — admin logic fixes (from your screenshots)

| Problem you saw | Cause | Fix (verified) |
|---|---|---|
| Uploaded design appeared on the half-sleeve rack, not oversized | The images were added to the existing **Onyx Crew Tee** (a half-sleeve product). Its garment type had been clicked but never saved, because type changes needed "Save details". | Clicking a garment type on an existing product now saves and moves it immediately. Onyx was rolled back to its original design. E2E: "category saves at once". |
| "Rif" (oversized) never appeared in the store | It needed 4 separate steps (save placement → approve → publish → activate); it stopped half-way. | One **Publish to the … rack** button does all of it; publishing makes the product visible. Rif was reprocessed and is live on the Oversized rack. |
| Front/back photos showed the whole photo as a rectangle | Photos were treated as stickers. | New garment-photo analyser (`src/server/garmentPhoto.ts`): background separation, fabric colour → base colour, print cut out with a transparent background and placed where it sat; plain back stays plain. Unit + E2E tests. |
| Preview didn't follow the sliders | The preview used the saved placement only. | Live preview from the sliders. |
| No way back to the store | — | "← Back to the store" in the admin header, plus a "View in store ↗" link after publishing. |
| Hoodie looked crumpled; tee edges ragged; velvet shine | Soft cloth settings, light smoothing, white sheen. | Stiffer fabric, stronger smoothing, less pressure, sheen tinted by the fabric colour. Templates rebuilt. |
| (found while testing) Clicking a garment sometimes opened its neighbour | Click areas rotated with the garments and overlapped. | Click areas are slot-sized and rack-aligned; full width only when the garment faces front. |
| (found while testing) Couldn't roll back to an earlier version | Archived versions were refused; built-in template versions failed a missing-file check. | Rollback allowed; the file check only applies to uploaded GLBs. |
| (found while testing) "Visible in store" box was wrong after publishing | It kept its value from page load. | It follows the server state. |

Gates after round 3: typecheck ✓, lint ✓, unit **55/55**, build ✓, E2E **13/13**. Admin how-to: `docs/ADMIN_GUIDE.md`.

## Round 2 — what changed and why

| Item | Finding | Change |
|---|---|---|
| **Customise button bug** | Clicking a shirt in the 3D scene called the view-only `open(id)` and never loaded that product's design state; the details panel only renders with a design, so it stayed hidden. The bottom chips — labelled with colour names (Chalk, Onyx…) — went through `openProduct`, which *did* load it. That is why "clicking a colour" made Customise appear. | Every path (3D click, chips, keyboard, deep links) now goes through one action, `src/store/actions.ts → openProduct`. The panel only ever shows the design that belongs to the open product, and a safety effect creates one if any path forgets to. Regression test: E "clicking a garment on any rack…" clicks the real 3D garment on all four racks and asserts the panel **and an enabled Customise button within 1 s**. |
| **Unsuitable garment models** | v1 tees were static inflated silhouettes: puffy, with lumpy sides edge-on (no gravity, stitching or AO). The scanned coat rack was not part of the intended store. | New Blender generator `scripts/blender/build_garment.py`: four category templates, **cloth-simulated drape** (pinned to the hanger, gravity + light pressure, self-collision), trims built on the simulated surface (rib collar, hood, kangaroo pocket, drawcords with metal aglets), generated detail normal map (jersey/fleece grain, twin-needle hem stitching, shoulder/armhole seams, rib bands, pocket topstitch), heathered base colour, **Cycles-baked ambient occlusion**. The coat-rack scan is no longer shown (the source file is untouched). |
| **One rail** | — | Four freestanding racks (half-sleeve, full-sleeve, oversized, hoodie), each with a plinth, an engraved wall sign, a wall-wash spotlight and its own garments; camera glides between racks; "All racks" overview. |
| **Admin → rack** | Category was free text; image uploads always used the one tee template. | `garment` category on every product: auto-suggested from the title (description as fallback), shown live in the form, overridable. Template versions always resolve to the template of the product's category, so a re-categorisation moves the product to another rack *and* template. Image-only pathway: front/back artwork → that category's template, with DPI check, placement editor, 3D preview and **mandatory approval before publishing**. |

## Verified working

| Feature | Evidence |
|---|---|
| Four racks, each product on the rack of its category | E customer (API grouping == scene grouping, ≥4 per rack), S `e2e/all-racks.png`, `docs/screenshots/v2-01…04` |
| Realistic templates: half-sleeve, full-sleeve, oversized, hoodie (drape-simulated, stitched, AO) | S `docs/garments/all-garments.jpg`, U garments (each shipped GLB validates; `simulated: true`) |
| **Clicking any garment immediately shows details + enabled Customise (no colour click)** | E customer, all four racks, real 3D clicks |
| Hover swing + neighbours spread + caption; idle sway; reduced motion | E customer, S `v2-03-oversized-hover.png` |
| Rotate/zoom (limited orbit), Front/Back (garment turns on its hanger), Reset view | E customer (buttons), screenshots |
| Colour and size selection | E customer |
| Text + image customisation, move (keyboard), resize/rotate (panel/handles), reorder, duplicate, delete, undo/redo, live 3D update | E customer |
| Asymmetric FRONT LEFT / BACK CENTER orientation on **all four templates** | S `docs/screenshots/v2-map-*-front/back.png` (front text on the viewer's left, back text readable, nothing mirrored) |
| Every template print zone covers real UV islands of the printable mesh; no aspect distortion | U garments (4 templates) |
| Save design → link → restore | E customer |
| Admin: auto category suggestion (live) + override; invalid category → clear 422 error | E admin image pathway |
| Admin: front/back image upload → validated (type/size/pixels), mapped to the category template, DPI warnings | E admin, U garments |
| Admin: placement adjustment, 3D preview front/back, approval required before publish | E admin, S `e2e/admin-artwork-front/back.png` |
| Published image product appears **on the correct rack** with its artwork, no code change | E admin (scene rack lookup), S `e2e/uploaded-hoodie-front.png` / `-back.png` |
| Category override moves the product to another rack and template | E admin (hoodie → oversized) |
| Unpublish removes it from the storefront | E admin |
| Invalid placement (external image URL) → clear 422 error | E admin |
| GLB pathway (validation, profile, mapping test, publish), security (401/403, private drafts), design validation | E admin + customer (unchanged from round 1, still passing) |
| No GPU leak on repeated product switching | E performance |
| 60 fps desktop and 390 px viewport; one rack ≈ 0.70 M triangles / 84–88 draw calls; overview ≈ 1.0–1.3 M | T |
| Mobile layout (scrolling rack tabs, no horizontal overflow) | E performance, S `v2-mobile.png` |
| Legacy data migration (old v1 products get a category and the v2 template) | U garments |

## Implemented but not fully verified

- **Mouse dragging in the Konva editor and orbit dragging**: implemented; automated tests use the keyboard, sliders and buttons.
- **Performance on real phones**: the mobile numbers come from a 390 × 844 emulated viewport on this PC's GPU, not from a phone.
- **WebGL-unavailable fallback / context-loss message**: implemented, not triggered in tests.
- **Hoodie front zone vs drawcords**: the cords physically hang across part of the chest print zone (realistic); artwork is visible but partly covered there.
- **Sheen appearance**: tuned by screenshot in Chromium/ANGLE only.

## Blocked / not available

| Item | Detail |
|---|---|
| Third-party realistic garment assets | Not used. Reputable CC0 sources checked earlier (Poly Haven) have no T-shirts/hoodies; Sketchfab downloads need a login (not bypassed). Templates are generated reproducibly in Blender instead. |
| Automatic image-to-3D (e.g. TRELLIS, Hunyuan3D, Meshy) | Evaluated as optional and **not adopted**: they need a large local GPU model or a paid/cloud service that would receive the artwork, and they produce re-meshed geometry with unusable print UVs. The template workflow is deterministic and keeps print accuracy. |
| Plugins frontend-design / context7 / playwright (MCP) | Enabled on the account but still not loaded into this session (checked again: no tools). The `@playwright/test` runner covers browser testing. |
| `blender-mcp.exe` | Processes from another tool were seen running on this machine; not used (headless scripts need no LLM code execution in Blender). |

## Not implemented

- Background removal for uploads (not faked).
- Cart / checkout.
- Sleeve and hood print zones (templates have front/back zones only).
- Per-size garment grading (one template size per category).
- Hosted database/object storage (file-based store, see README).
- Git repository (folder is still not a git repo; nothing committed).
