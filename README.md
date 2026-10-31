# Atelier Écru — 3D T-shirt boutique, customiser and perfume salon

A Next.js storefront with a real-time 3D atelier: four freestanding racks — **half-sleeve tees, full-sleeve tees, oversized tees and hoodies** — whose garments hang edge-on and swing round when hovered (as in the reference video). Clicking a garment opens a rotatable 3D detail view with an immediately available Customise button; the print editor (front, back, left and right sleeve) maps text and artwork live onto the garment in a dark studio. A **perfume salon** (`/perfumes`) shows each perfume in its own lit, arched stone niche, from the admin's product photos (cut out automatically, with AI for busy backgrounds). An admin area publishes T-shirts and perfumes — photos first — onto the right rack or niche without code changes.

Status, evidence and gaps: [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) · [docs/TEST_REPORT.md](docs/TEST_REPORT.md) · [docs/GLB_DIAGNOSTIC.md](docs/GLB_DIAGNOSTIC.md) · [docs/VIDEO_REFERENCE_ANALYSIS.md](docs/VIDEO_REFERENCE_ANALYSIS.md) · [docs/ENVIRONMENT_AUDIT.md](docs/ENVIRONMENT_AUDIT.md) · [docs/ASSET_CREDITS.md](docs/ASSET_CREDITS.md)

> **About the garment models:** the four garment templates are generated reproducibly in Blender (`scripts/blender/build_garment.py`): pattern-based panels, cloth-simulated drape on a hanger, rib collar/cuffs, hood, pocket and drawcords, stitching normal maps and baked ambient occlusion. The originally supplied `assets/source/cloth_rack.glb` (a CC BY 4.0 coat-rack scan) is preserved but no longer shown.

## Download and run

### 1. Install the tools (once)

- **Node.js 24 or newer** — https://nodejs.org (the LTS installer is fine). Check with `node -v`.
- **Git** — https://git-scm.com (or download the code as a ZIP, see below).
- A browser with WebGL (Chrome, Edge, Firefox, Safari).
- Optional: **Blender 5.x**, only to rebuild the 3D garments, bottles or product renders.

### 2. Get the code

With Git:

```bash
git clone https://github.com/Rifas-1657/T-shirt.git
```

```bash
cd T-shirt
```

Without Git: on the GitHub page press **Code → Download ZIP**, unzip it, and open a terminal in the unzipped folder.

### 3. Install the packages

```bash
npm install
```

### 4. Create your settings file

Copy the example settings to `.env.local` (this file is private and never committed).

Windows (PowerShell):

```powershell
Copy-Item .env.example .env.local
```

macOS / Linux:

```bash
cp .env.example .env.local
```

Open `.env.local` in a text editor and set:

- `ADMIN_PASSWORD` — the password for the admin area (use a long passphrase).
- `ADMIN_SESSION_SECRET` — 64 random hex characters. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 5. Add the sample products

```bash
npm run seed
```

This adds the sample T-shirts, hoodies and perfumes (with their studio photos) to `data/`. It is safe to run again.

### 6. Optional: the AI photo cut-out

Lets the admin upload perfume photos on any background (a table, flowers…) and have the bottle cut out automatically. It downloads the BiRefNet-lite model (MIT licence, about 115 MB) into `models/`; it runs on your computer and photos are never sent anywhere. Without it, everything works and photos on a plain light background are still cut out instantly.

```bash
npm run models
```

### 7. Start the store

```bash
npm run dev
```

Open:

- http://localhost:3000 — the boutique (four racks; click a garment, then **Customise this piece**)
- http://localhost:3000/perfumes — the perfume salon
- http://localhost:3000/admin — the admin area (password from `.env.local`); see [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md)

Stop the server with `Ctrl + C`.

### Run it like a real website (production mode)

```bash
npm run build
```

```bash
npm start
```

Then open http://localhost:3000. Shop data (products, uploads, designs) is stored in `data/`; back up that folder to keep it.

### Run the tests (optional)

Install the test browser once:

```bash
npx playwright install chromium
```

Then:

```bash
npm test
```

```bash
npm run test:e2e
```

`npm test` runs the unit tests; `npm run test:e2e` builds the site and drives it in a real browser on port 3100 with its own temporary data (your `data/` is not touched).

### If something goes wrong

- **"Port 3000 is already in use"** — another copy is running; stop it, or start on another port with `npx next dev -p 3001`.
- **The 3D view stays empty** — WebGL is off or blocked; enable hardware acceleration in the browser settings. The store falls back to a plain catalogue.
- **Admin login fails** — check `ADMIN_PASSWORD` in `.env.local` and restart `npm run dev` after editing it.
- **AI cut-out says "not installed"** — run `npm run models`. It needs about 1–2 GB of free memory while it works.
- **`npm run seed` complains about TypeScript** — use Node.js 24 or newer.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server / production build / production server (port 3000) |
| `npm run typecheck` / `lint` | TypeScript and ESLint |
| `npm test` | Vitest unit tests (`tests/unit`) |
| `npm run test:e2e` | builds, then runs Playwright against an **isolated** server on :3100 with a fresh `data-e2e/` and a random admin password. Screenshots go to `docs/screenshots/e2e/`. Run `npx playwright install chromium` once if needed. |
| `npm run models` | downloads the AI background-removal model used for perfume photos (local, MIT) |
| `npm run seed` | adds the sample garments and perfumes (with their studio photos) to `data/` (idempotent) |
| `npm run assets:rack` | rebuilds `public/models/rack-{2k,1k}.glb` from the untouched source (needs the global `@gltf-transform/cli`) |
| `npm run assets:bottles` | rebuilds the three perfume bottles (`public/models/perfume/`) with Blender and writes `src/lib/perfume/bottles.json` |
| `npm run assets:props` | downloads the CC0 Poly Haven boutique props, textures and HDRI (`scripts/assets/fetch-polyhaven.mjs`) |
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

**Perfume salon (`/perfumes`).** A cinematic opening in Qatar maroon (عطور · Maison des Parfums) whose white nine-point serrated band sweeps away once the 3D scene is ready, then a carousel of glass bottles on marble plinths (refraction, liquid, metal caps, labels with the product name, gold dust and rose petals). Discover opens a free-rotate inspection with the notes pyramid. Perfumes are admin products with category **Perfume**; they are never customisable and never appear on the apparel racks.

**Racks and categories.** Every product has a `garment` category (`half-sleeve`, `full-sleeve`, `oversized`, `hoodie`) that decides its rack and, for template products, its 3D template (`src/lib/garments.ts`). The admin form suggests the category live from the title (falling back to the description) and lets the admin override it. Changing it later moves the product to the other rack and template.

**Front/back artwork → rack (admin).** Create the product (choose or accept the category) → upload a front and/or back image → the server validates the files (real type, size, pixel limits, SVG sanitising), maps them onto the category template's print zones (contain-fit) and reports print DPI → adjust size/position/rotation and check the 3D preview → approve the mapping → publish and activate. The product then appears on its rack. Two photos cannot reconstruct a new garment's real geometry; this pathway is labelled as a template-based approximation. A garment that needs a different model goes through the GLB pathway (upload → validation → print profile → mapping test).

**Admin publishing.** An upload creates a new *version* and never touches the live one. The GLB is inspected, the original is stored privately (`data/private/originals`, no route serves it) and a WebP derivative is written. Customisation requires printable meshes plus UV zones that actually cover UV islands, and an explicit confirmation of the FRONT LEFT / BACK CENTER mapping test. Publishing atomically moves `liveVersionId`. The public API only ever exposes live versions of active products.

## Production notes

- **Storage:** `src/server/storage.ts` + `files.ts` are the only persistence modules. For a multi-instance deployment, replace them with a database (products/designs) and private object storage (originals, uploads, derivatives), e.g. Supabase Postgres + Storage with service keys kept server-side. The in-process mutation lock and rate limiters are single-node only.
- **Security:** set strong `ADMIN_PASSWORD`/`ADMIN_SESSION_SECRET`, serve over HTTPS (the cookie becomes `Secure` in production), and keep `data/` outside the web root (it already is; only API routes read it).
- **Textures:** derivatives use WebP + meshopt. KTX2/Basis would cut GPU memory further but needs the `toktx` binary; add `--texture-compress ktx2` to `scripts/assets/build-rack-derivatives.sh` once it is installed.
- **Attribution:** keep the on-screen CC BY 4.0 credit for the rack model (see ASSET_CREDITS.md).
