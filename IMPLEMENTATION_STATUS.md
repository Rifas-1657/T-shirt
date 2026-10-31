# Implementation status

Last updated 2026-10-31 (round 8: sleeve printing; perfume salon matched to the reference video).
Evidence: `docs/TEST_REPORT.md` (T), unit tests (U), e2e tests (E), screenshots (S).

## Round 8 — sleeve printing, and the salon brought up to the reference video

| Request | What was done | Evidence |
|---|---|---|
| Add sleeves | Every garment template now has **Left sleeve** and **Right sleeve** print zones. A sleeve is a slanted strip of the flat pattern, so its zone sits on the sleeve's centre line and is **rotated to follow the sleeve** (print zones gained an optional angle; the editor still shows the zone upright). Half-sleeve and oversized: 7.7–9 × 4 cm across the sleeve; full-sleeve and hoodie: 4 × 9 cm running down the upper arm. Choosing a sleeve tab turns the garment on its hanger and moves the camera in on that sleeve. Saved designs keep sleeve prints. `scripts/assets/sleeve-zones.mjs` computes the zones (and plots them over the patterns to check they sit on the sleeves); the garment build runs it automatically. | Unit `atlasRenderer.test.ts` (sleeve tests), e2e "sleeves", `docs/screenshots/e2e/customize-sleeve.png` |
| The salon still lacked the video's premium feel | Compared frame by frame with the video. Fixed: niches were small with lots of empty wall (now tall, deep niches that fill the screen, narrow stone piers); bottles were a quarter of the niche (now hero size, about half); light was dim (brighter carved interior, stronger cone and coloured side light, glowing lamp halos); a big title competed with the products (now a slim caption bar under the niches); added a slow low mist along the foot of the wall; bottle photos follow their niche's light, so in a close-up the neighbours dim; the sample bottles' colour was lifted slightly. | `scripts/qa/out/p3-*.png`, `p4-*.png` |

Still not done from the T-shirt video: printing on the inside-neck label (the garment is one layer of fabric, so a label inside would also show outside) and all-over prints across seams.

## Round 7 — premium quality from three reference videos

The three videos you shared were studied frame by frame (frames stay in the ignored `references/` folder; nothing from them is shipped). Each one set the bar for one part of the store:

| Reference | What it showed | What the store does now |
|---|---|---|
| Perfume brand site | Bottles in lit niches of dark stone, a polished floor, a close-up with the details beside it | `/perfumes` is a **wall of pointed-arch niches carved into dark basalt** (Islamic arches rather than the video's rectangles). Each niche has its own downlight, a glow in the colour of its perfume, and a pool of light on the polished black floor. The opening is now the lamps striking one after another. **Discover** zooms into the niche: niche on the right, name, notes, price and ‹ › paging on the left. Drag the bottle to turn it; drag/swipe the wall to browse; Back works. |
| Clothing rail | Garments hanging side-on; hover swings one round; click brings it forward | The racks already worked this way (since round 2). The caption under the rack now has a soft fade behind it, so it never gets lost against the floor. |
| T-shirt designer | A dark studio: one soft spot and blurred leaf shadows behind the shirt | While customising, a **studio sweep** fades in behind the garment: charcoal with a spotlight fall-off and dappled leaf shadows (a gobo). The header turns light over it. |

Skills used: frontend-design (design plan, type and colour choices, removing template tells such as all-caps labels), ui-ux-pro-max. Plugin cards offered for audit-suite (web-animation-design, make-interfaces-feel-better) and VectorLab UI/UX; they install from the card.

Assets: Poly Haven CC0 "Rock Wall 02" texture (colour converted to charcoal). The Unsplash hall photo from round 5 is no longer used and was removed.

Not done in this round (from video 3): printing on sleeves and the inside-neck label, all-over prints across panels, and a 2D sewing-pattern editor. The customiser still prints front and back.

## Round 6 — any photo works, turning bottles, real intro, working Back

| Request | What was done | Evidence |
|---|---|---|
| "I gave an image but it didn't become 3D" / "second upload didn't work automatically" | Your photos had busy backgrounds (rose, map, wood), and the old cut-out only handled plain backgrounds, so they were shown framed. Added an **AI background removal** (BiRefNet-lite, MIT licence, runs locally in a separate worker process, about 20 s per photo, never sent anywhere). Plain backgrounds are still cut out instantly; others are queued and the admin page updates by itself; **Cut out with AI** re-runs it. Your Rif and aadads photos were cut out this way. | E2E "busy background … AI model"; `scripts/qa/out/aadads*.png` |
| 4 photos given but they don't show as 4 sides | With front / ¾ / side / back photos the bottle now **turns on the counter** (cross-fading through the angles every few seconds) and can be **dragged to turn**. Discover keeps the full photo viewer. | `scripts/qa/out/turn.png` |
| Intro looked like an animation | The opening now walks into the real hall: the photograph starts dark and close, the lights come up, the name appears, and it dissolves into the live salon while the camera glides to the counter. The painted ceiling is cropped out. | — |
| Back button / previous did not work; wanted swipe instead of only the Next button | Every perfume and every Discover is a browser history entry (`?p=…&view=details`), so **Back/Forward** step through the salon instead of leaving it. Drag (mouse), swipe (touch) and two-finger trackpad scroll move between perfumes; arrows and keys still work. | E2E "salon navigation" |

Setup note: the AI model is not in git (115 MB). Run `npm run models` once on a new machine; without it, busy-background photos stay framed and everything else works.

## Round 5 — real perfume salon, photos-first admin

| Request | What was done | Evidence |
|---|---|---|
| Perfume page looked like a cartoon / animation; wanted perfumes "in a real place" | Rebuilt `/perfumes` as a real photographed baroque hall (chandelier, tall windows, parquet) behind a polished maroon stone display counter with marble-style risers and a warm display spot that follows the chosen perfume. Petals, sparkles and the painted arches are gone. Glass is lit by a real interior HDRI (CC0). Only the lower part of the hall photo is used, so its painted ceiling figures never appear. | `docs/screenshots/e2e/perfume-gallery.png`, `perfume-inspect.png`, `perfume-photo-inspect.png` |
| Separate agents: one finds free images, one analyses them, one creates | **Scout agent** downloaded 6 free candidates (3 Poly Haven CC0 HDRIs, 3 Unsplash photos) with licences in `assets/incoming/salon-backdrops/manifest.json`. **Analyst agent** scored them (realism, people/text, perspective, colour, licence) and picked the backdrop and lighting; it rejected one room because of a semi-nude tapestry in the centre. **Creator agent** wrote `scripts/blender/render_perfume_shots.py` and rendered photoreal studio shots of the 5 seeded perfumes (4 views each, Cycles on the GPU). | `public/perfume-salon/SOURCE.md`, `assets/processed/perfume-shots/manifest.json` |
| Perfumes shown with real photos | Perfumes with photos stand on the counter as their **photo, cut out of its background**; without photos the 3D bottle is the fallback. **Discover** opens a photo viewer (drag/arrows for other angles, thumbnails, zoom). The 5 seeded perfumes use the creator's renders (WebP, 904 KB for all 20). | E2E `perfume.spec.ts` (photo-first test) |
| Admin: no preview of where each category is displayed | The "Display category" text box is gone. **Category cards** show a real screenshot of each rack and of the salon (`public/admin-previews/`). The shop label (T-Shirts / Hoodies / Perfumes) is derived from the card. | `docs/screenshots/e2e/admin-perfume-photos.png` |
| Admin: how to add a perfume photo; photo upload only appeared after name/colour/details | New product form order: **1 · Category → 2 · Photos → 3 · Details**. Apparel: front/back slots. Perfume: up to 8 photos, view guessed from order. Create uploads the photos immediately. Perfume photos are cut out automatically on a plain light background (original → cut-out shown side by side), the juice colour is taken from the first photo, and each photo can be shown first, re-labelled, switched to the original, or deleted. A salon preview shows the first photo on its plinth before publishing. | E2E photo-first test; unit `productCutout.test.ts` |
| Admin logical / neat | Product editor reordered to Photos → Check & publish → Details for both departments; product list grouped by category with live dots and photo counts; SKU suggested from the name. | screenshots above |

Bugs found and fixed while testing: the cut-out flooded into pale juice and clear glass on clean studio backgrounds (now uses a noise-adaptive tolerance, keeps multi-part subjects such as a cap seen through glass, and softens a two-pixel edge); a dark stone counter looked khaki because the scene-wide HDRI reflection ignores per-material intensity (the stone now has its own dimmer environment map); the counter mirror reflected the painted ceiling (replaced with clear-coated stone); photo upload views were misaligned when one file in a batch was rejected.

Known limits: photo products are flat images, so in the salon they face the customer (other angles are in the photo viewer); clear-glass edges on very bright backgrounds can keep a faint white rim; the hall photo is under the Unsplash License (free commercial use, not CC0); a 3D bottle is still used for perfumes without photos.

## Round 4 — neat garments, real boutique, perfume salon

| Request | What was done | Evidence |
|---|---|---|
| T-shirts looked crumpled ("kasangi") | Cause: noisy AO bake + mottled heather texture (blotches), inflation pressure (lumps), sawtooth seam edges, strong grain. Generator now: 256-sample AO + blur, near-uniform colour, softer detail normal, short stiff drape with almost no pressure, Laplacian-smoothed seams. Templates bumped to **v3** so browsers do not keep the old cached files. | Before/after: `scripts/qa` screenshots; `docs/screenshots/e2e/detail-*.png` |
| Real store background for T-shirts | Herringbone parquet floor, ivory plaster wall with moulded panels, cornice/skirting, tall dressing mirror, plants between racks, lounge corners (chair, coffee table, vase) at both ends, real interior HDRI reflections — all **CC0 Poly Haven** assets (`npm run assets:props`). Camera stands back like a customer walking in. | `docs/screenshots/e2e/collection.png`, `all-racks.png` |
| Perfume category | `kind: 'perfume'` products with bottle style, liquid colour, cap finish, volume, concentration, family and notes. Never customisable (no print zones), never on the apparel racks. Admin: "Perfume" category (auto-detected from "Eau de Parfum", "Extrait", "Attar"…), price in QAR by default, live 3D preview, one-click **Publish to the perfume salon**. | E2E `perfume.spec.ts` (admin test), unit `perfume.test.ts` |
| Perfume page with opening motion, 3D rotate, maroon/rose Qatar theme | `/perfumes`: Motion (Framer Motion) opening in Qatar maroon with "عطور · MAISON DES PARFUMS"; the white nine-point serrated band sweeps away once the 3D scene has actually rendered (it doubles as the loading screen; Skip button; reduced-motion skips it). Then a carousel of Blender-built glass bottles (refraction, coloured juice, gold/rose-gold/silver/onyx caps, printed labels) on marble plinths, reflective floor, gold arches, Qatar serrated frieze, gold dust and rose petals. Discover = free rotate/zoom + notes pyramid. Arrows, ← → keys and swipe. | `docs/screenshots/e2e/perfume-intro.png`, `perfume-gallery.png`, `perfume-inspect.png`, `perfume-mobile.png` |
| Skills / plugins | Used the **ui-ux-pro-max** skill (design-system search: Cormorant + clean sans, motion and reduced-motion rules, Three.js stack rules such as an accessible canvas label) and the **frontend-design** plugin guidance. Playwright MCP is available; context7 needs authorising via `/mcp`. | — |

Bugs found while testing and fixed: intro animation was invisible because shader compilation froze the first seconds (now gated on scene readiness); perfume labels were upside down (texture orientation); auto-detected perfumes kept USD pricing; a regex written through a script contained invisible control characters (all source files scanned clean afterwards).

Known limits: one size per garment template; perfume bottles are three templates (no admin bottle upload yet); no cart/checkout; mobile performance measured in an emulated phone viewport on this PC's GPU, not on a real phone.

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
