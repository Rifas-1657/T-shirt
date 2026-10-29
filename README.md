# Atelier Écru — 3D T-shirt showroom and customiser

A Next.js storefront with a real-time 3D atelier: four freestanding racks — **half-sleeve tees, full-sleeve tees, oversized tees and hoodies** — whose garments hang edge-on and swing round when hovered (as in the reference video). Clicking a garment opens a rotatable 3D detail view with an immediately available Customise button; the front/back print editor maps text and artwork live onto the garment's UVs. An admin area publishes new products — from front/back artwork or a GLB — onto the correct rack without code changes.

Status, evidence and gaps: [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) · [docs/TEST_REPORT.md](docs/TEST_REPORT.md) · [docs/GLB_DIAGNOSTIC.md](docs/GLB_DIAGNOSTIC.md) · [docs/VIDEO_REFERENCE_ANALYSIS.md](docs/VIDEO_REFERENCE_ANALYSIS.md) · [docs/ENVIRONMENT_AUDIT.md](docs/ENVIRONMENT_AUDIT.md) · [docs/ASSET_CREDITS.md](docs/ASSET_CREDITS.md)

> **About the garment models:** the four garment templates are generated reproducibly in Blender (`scripts/blender/build_garment.py`): pattern-based panels, cloth-simulated drape on a hanger, rib collar/cuffs, hood, pocket and drawcords, stitching normal maps and baked ambient occlusion. The originally supplied `assets/source/cloth_rack.glb` (a CC BY 4.0 coat-rack scan) is preserved but no longer shown.

## Setup

Requirements: Node.js 24+ (22.6+ works with `--experimental-strip-types` for the seed script), npm. Blender 5.x only if you want to rebuild the template.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Edit `.env.local`: set `ADMIN_PASSWORD` (a long passphrase) and `ADMIN_SESSION_SECRET` (64 random hex characters). This checkout already has a generated `.env.local`; open it to see the admin password.

```bash
npm run seed
```

```bash
npm run dev
```

Open http://localhost:3000 (showroom) and http://localhost:3000/admin (admin).

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server / production build / production server (port 3000) |
| `npm run typecheck` / `lint` | TypeScript and ESLint |
| `npm test` | Vitest unit tests (`tests/unit`) |
| `npm run test:e2e` | builds, then runs Playwright against an **isolated** server on :3100 with a fresh `data-e2e/` and a random admin password. Screenshots go to `docs/screenshots/e2e/`. Run `npx playwright install chromium` once if needed. |
| `npm run seed` | adds the 7-shirt template collection to `data/` (idempotent) |
| `npm run assets:rack` | rebuilds `public/models/rack-{2k,1k}.glb` from the untouched source (needs the global `@gltf-transform/cli`) |
| `npm run assets:garments` | rebuilds the four v2 garment templates with Blender (cloth sim + AO bake, ~1 min each), optimises them to `public/models/garments/` and writes the print-zone sidecars to `src/lib/garment-templates/` (set `BLENDER_PATH` if needed; needs the global `@gltf-transform/cli`) |
| `npm run assets:template` | rebuilds the round-1 `tshirt-template-v1.glb` (kept for the GLB-upload test fixture) |

## How it works

```
src/
  app/                 Next.js routes: showroom (/), admin (/admin), API under /api
  components/three/    R3F scene (room, rail, camera rig) + Garment (per-instance materials, print overlay)
  components/editor/   React Konva front/back editor (edits design JSON only)
  components/showroom/ page shell: collection caption/index, detail panel, customise layout
  components/admin/    admin dashboard + model preview with mapping test pattern
  lib/                 shared pure logic: types, print-zone/UV transforms, atlas renderer, design schema
  server/              storage (atomic JSON files), auth, GLB + image validation, catalogue admin
scripts/blender/       reproducible Blender inspection + template build
```

**Print pipeline.** The design is versioned JSON: per-zone layers in normalised zone coordinates. `lib/atlasRenderer.ts` draws it into a 2:1 canvas atlas at the zone's UV rectangle. That canvas is a `THREE.CanvasTexture` (`flipY = false`, sRGB) on a transparent overlay mesh that shares the printable mesh's geometry and UV0. The base fabric material is tinted separately, so colour changes never touch the artwork. Zones are defined per product (`ModelConfig.printZones`); there is no universal UV rectangle.

**Racks and categories.** Every product has a `garment` category (`half-sleeve`, `full-sleeve`, `oversized`, `hoodie`) that decides its rack and, for template products, its 3D template (`src/lib/garments.ts`). The admin form suggests the category live from the title (falling back to the description) and lets the admin override it. Changing it later moves the product to the other rack and template.

**Front/back artwork → rack (admin).** Create the product (choose or accept the category) → upload a front and/or back image → the server validates the files (real type, size, pixel limits, SVG sanitising), maps them onto the category template's print zones (contain-fit) and reports print DPI → adjust size/position/rotation and check the 3D preview → approve the mapping → publish and activate. The product then appears on its rack. Two photos cannot reconstruct a new garment's real geometry; this pathway is labelled as a template-based approximation. A garment that needs a different model goes through the GLB pathway (upload → validation → print profile → mapping test).

**Admin publishing.** An upload creates a new *version* and never touches the live one. The GLB is inspected, the original is stored privately (`data/private/originals`, no route serves it) and a WebP derivative is written. Customisation requires printable meshes plus UV zones that actually cover UV islands, and an explicit confirmation of the FRONT LEFT / BACK CENTER mapping test. Publishing atomically moves `liveVersionId`. The public API only ever exposes live versions of active products.

## Production notes

- **Storage:** `src/server/storage.ts` + `files.ts` are the only persistence modules. For a multi-instance deployment, replace them with a database (products/designs) and private object storage (originals, uploads, derivatives), e.g. Supabase Postgres + Storage with service keys kept server-side. The in-process mutation lock and rate limiters are single-node only.
- **Security:** set strong `ADMIN_PASSWORD`/`ADMIN_SESSION_SECRET`, serve over HTTPS (the cookie becomes `Secure` in production), and keep `data/` outside the web root (it already is; only API routes read it).
- **Textures:** derivatives use WebP + meshopt. KTX2/Basis would cut GPU memory further but needs the `toktx` binary; add `--texture-compress ktx2` to `scripts/assets/build-rack-derivatives.sh` once it is installed.
- **Attribution:** keep the on-screen CC BY 4.0 credit for the rack model (see ASSET_CREDITS.md).
