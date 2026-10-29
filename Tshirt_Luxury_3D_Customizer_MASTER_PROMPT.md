# MASTER BUILD SPECIFICATION — Luxury Interactive 3D T-Shirt Store

**Target environment:** Windows + Claude Desktop (local Claude Code session)  
**Preferred model:** Claude Opus 5.5 when available in the model picker  
**Reference input:** user's supplied showroom/custom-clothing video  
**Primary 3D source:** user's original downloaded 4K `.glb` file (do not modify or overwrite it)  
**Goal:** premium online apparel showroom with real-time 3D shirt selection and product customization, not a video-only demo or static mockup.

---

## 0. Operating rules

1. Start by inspecting the repository and local environment. Do not assume the project is empty or overwrite existing work.
2. Locate the reference video and original 4K GLB. The user must copy both into this local project because a ChatGPT attachment is not automatically visible to a local Claude Desktop/Code session.
3. Preserve the original GLB byte-for-byte. Work on a copy in a separate optimized-assets directory.
4. Use actual tools and verify actions. Never claim a plugin, MCP, asset, feature, test, deployment, or 3D mapping works unless it was checked.
5. Prefer installing official or source-reviewable tools. Before running an unfamiliar remote install script, inspect its README, package source/repository, requested permissions and license. Ask the user before admin-level changes, credentials, paid services, destructive operations, or tools that can access unrelated files or send data externally.
6. For routine workspace-scoped, reversible installation and coding steps, proceed when the environment's permissions allow it. If Claude Desktop/Claude Code asks the user for approval, explain the exact action and wait for that approval rather than trying to bypass the prompt.
7. Build in small phases, run checks at each phase, and maintain `IMPLEMENTATION_STATUS.md` with completed, tested, blocked, and not-yet-built items.
8. Never substitute a static image, video, fake interaction, or hard-coded demo for a requested real feature. Clearly label any temporary prototype.
9. Do not assume that a front photograph and a back photograph can recreate the exact 3D geometry of a garment. If an upload is only 2D, map it onto a known, compatible 3D garment template and clearly document that limitation.
10. Follow licenses and attribution requirements for every external model, texture, font, image, code sample, skill, and plugin.

## 1. Files the user should place in this project

Create or use this structure, keeping the files unchanged:

```text
project-root/
├── Tshirt_Luxury_3D_Customizer_MASTER_PROMPT.md
├── references/
│   └── videos/
│       └── clothing-store-reference.mp4
├── assets/
│   └── source/
│       └── tshirt-original-4k.glb
└── docs/
```

The actual filenames can differ. Search the project for `.mp4`, `.mov`, `.webm`, `.glb`, `.gltf`, `.blend`, and image files. If the input files are not present, clearly report their expected location and ask the user to copy them in; do not pretend to have inspected them.

## 2. Phase A — Environment and repository audit

- Inspect the current repository, git status, package manager, framework/version, existing design, routes, APIs, tests, and run instructions.
- Do not replace a healthy existing stack just to follow this specification. If new project, prefer the stack in Section 5.
- Check Node.js, npm/pnpm, Python, Git, Blender installation/version and available disk space.
- Check the Claude Code version, installed plugins, skills and MCP servers. Use documented CLI/GUI installation paths for the installed version.
- Prefer **Claude Opus 5.5** if it exists in the user's model picker; if it is missing, select the strongest available coding model and report that truthfully.
- Produce `docs/ENVIRONMENT_AUDIT.md` containing detected versions, repository summary, missing prerequisites, assets found and proposed changes.
- Do not dump secrets or environment-variable values. Report only whether a required variable exists.

## 3. Phase B — Skills, plugins, and MCP setup

### Plugins to check/install first

Use Claude Code's supported plugin browser/marketplace or current documented CLI syntax. Check the exact identifier before installing; do not invent plugin IDs.

1. **frontend-design** — premium, distinctive frontend design and motion.
2. **context7** — current version-specific docs for Next.js, React Three Fiber, Three.js, React Konva and relevant libraries.
3. **playwright** — browser testing, screenshots, interaction and regression checks.
4. **Superpowers** or equivalent testing/debugging plugin — optional, only if it adds capabilities not already present.

After installation, verify that the plugin is active in this exact Claude Code environment. If installation is unavailable in the UI/CLI, give the user the precise fallback clicks/commands and continue with other tasks.

### Optional image-to-Three.js skill

`img2threejs` is optional, not a replacement for the actual shirt GLB. Check its current repository/README and safety before installing it. Its documented install flow is:

```bash
npx --yes img2threejs@latest install
npx --yes img2threejs@latest doctor
```

Use this skill only if it helps create procedural Three.js scene props or rebuild a reference object as editable code. Do not use it to replace the user's realistic T-shirt model merely because the skill name includes “image to Three.js.” The skill rebuilds from a still image using procedural code; it does not recover the exact original garment mesh from a photograph.

### Blender

- If Blender is installed, record the version and use it to inspect a COPY of the GLB.
- Prefer a reproducible local Blender Python script for inspecting mesh names, materials, UV layers, image textures, dimensions, transforms, poly counts and exportability.
- Blender MCP is optional. Before enabling it, review the actual source and security model. An MCP server capable of executing LLM-generated Python inside Blender can be powerful and risky. Do not expose it to unrelated files, credentials or sensitive documents. Ask for explicit approval before enabling code execution via MCP; use a disposable project copy or restricted environment where practical.
- If Blender is absent, ask before installing software if elevated permissions are required. Otherwise provide the official download URL and continue with GLB/browser inspection tools.

### Optional asset-discovery MCP

You may assess 3DAssets.dev MCP (or another reputable asset search integration) for finding CC0 showroom props. Verify the current official endpoint, capabilities, license terms and security first. Do not rely on an asset search result's title alone to establish its license. Do not auto-download restricted assets or bypass login.

### MCP acceptance checks

- List active MCP servers using the supported Claude Code command/UI.
- Test one harmless, read-only call for each connected MCP.
- Record what works and what needs user action in `docs/ENVIRONMENT_AUDIT.md`.
- Do not install every available skill. Choose the smallest verified set that directly helps this project.

## 4. Phase C — Analyze the reference video and original GLB

### Reference video analysis

- Inspect the supplied video in the local project. If direct video understanding is unavailable, extract a small contact sheet of representative frames with timestamps using an installed local tool such as FFmpeg, then inspect the frames.
- Analyze the video for: showroom composition, rack/garment arrangement, camera path, zoom/rotation, selection transitions, scroll behavior, lighting, background, typography, product-panel layout, motion timing and overall luxury visual language.
- Treat it as visual reference only. Do not copy its brand assets or claim its non-interactive shots are working product interactions.
- Create `docs/VIDEO_REFERENCE_ANALYSIS.md` with timestamps, observations, and a scene/interaction checklist. Include screenshots/contact sheet paths where possible.

### GLB inspection

- Keep `assets/source/tshirt-original-4k.glb` unchanged.
- Inspect file size, model hierarchy, all mesh and material names, UV maps, texture images and resolutions, texture formats, normals, transforms, bounding box, triangle/vertex count, animation clips, and whether front/back or parts are separate mesh/material regions.
- Open/preview in Blender or a trusted local GLB viewer. Compare the model's appearance in Blender and browser.
- Create a diagnostic report and, if possible, a GLB preview image in `docs/`.
- Check whether the model has an editable front/back UV area suitable for print artwork. If the UV map is missing, overlapped, unusual, or unsuitable, do not fake accurate mapping. Use a controlled UV/template prep workflow or report that a different model is needed.
- Determine what “4K” means for this asset: texture resolution, export variant, or marketing label. Do not assume that the mesh itself is 4K.
- Make a derivative copy for web optimization only after a baseline render has been captured.

## 5. Preferred technical stack

Use this for a new app; preserve a sound existing stack when one is already present.

- **App:** Next.js + React + TypeScript.
- **UI:** Tailwind CSS and accessible components, with an editorial luxury fashion design system.
- **3D:** Three.js + React Three Fiber + Drei, loading GLB/glTF through a supported loader.
- **Artwork editor:** React Konva or an equivalent canvas/editor library for drag, resize, rotate, text and image placement; connect its output to texture generation.
- **State:** existing state manager if healthy; otherwise Zustand or a small typed store.
- **Product/admin data:** existing backend if present. For a new product, evaluate Supabase or a similarly suitable database + object storage. Keep service secrets server-side.
- **Testing:** Playwright for browser flows plus unit tests for texture generation, product configuration, transform serialization and validation.
- **3D editing:** Blender for mesh/UV inspection and preparation, not for every live customer interaction.
- **No unnecessary 3D framework switching:** use one renderer for the core garment experience. Avoid stacking duplicate render engines or libraries without a clear, measured need.

Before installing dependencies, check peer dependencies and current version docs. Lock dependency versions and use the repository's existing package manager.

## 6. Visual quality brief — premium/luxury, close to physical retail

Build a refined and realistic showroom, not a generic dashboard. Establish a consistent art direction inspired by luxury fashion retail, while avoiding copied branding.

### Showroom

- A premium gallery/studio environment with realistic racks/hangers and a curated collection.
- Soft warm key lighting, controlled fill, grounded contact shadows, tasteful highlights, subtle environmental reflection, correct color management, appropriate exposure, and a neutral/stone/wood/metal material palette.
- Use an HDR environment where suitable, but avoid overbright plastic-looking fabric and excessive bloom.
- Include a camera movement/transition that makes a selected garment feel deliberate and tactile. Motion must respect reduced-motion settings and not block product interaction.
- Use appropriate 3D controls for orbit, zoom, reset-view and front/back view. Prevent the camera from clipping through the garment.
- Use high-detail source assets but deliver responsive optimized assets for the web. Do not load large uncompressed 4K textures for every rack item simultaneously.
- Add loading states, progressive loading where practical, error states, WebGL failure fallback and mobile-friendly performance settings.

### T-shirt realism

- Preserve the original model's useful geometry and textures.
- Use believable roughness/normal maps and cloth response only if the source supports them or they can be generated without damaging the design.
- Keep stitching, collars, sleeves, hems, folds and silhouette intact. Do not create fake folds that distort uploaded logos.
- Test studio light and environment settings across white, black and colored shirts.
- Tune the scene from real screenshot feedback, not from code inspection alone.
- Aim for realistic product presentation within browser/WebGL constraints. Do not promise perfect offline-render quality on all hardware.

## 7. Core product features

### Customer showroom

- Browse/select individual shirts on a rack or in a product collection.
- Clicking a shirt selects the actual 3D product and loads its product-specific configuration.
- Show product name, available colors, sizes, price/availability (when provided), and customization CTA.
- Allow rotate, zoom, front, back, reset view and a clear return-to-collection action.
- If a product uses a different model, reload its validated GLB/configuration cleanly and dispose old GPU resources correctly.

### Live customization editor

- Add editable text, uploaded PNG/JPEG/SVG where safely supported, and logos/designs.
- Select, drag, resize, rotate, reorder, duplicate and delete artwork layers.
- Undo/redo; remove background only if a genuine supported feature exists; otherwise do not fake it.
- Change shirt base color only when the model's material setup supports it without destroying printed artwork. Keep base color and artwork as separate layers where possible.
- Switch between front and back editing. Persist independent artwork layouts per print zone.
- Map design changes to the 3D shirt texture immediately and keep canvas/model state synchronized.
- Use the actual UV coordinates and garment mapping. Do not hard-code a universal UV rectangle for arbitrary shirts.
- Save design state as versioned JSON (product/model version, color, size, print-zone transforms, text, uploaded asset references, texture/config version).
- Reopen a saved design and reconstruct the same result. Provide a preview image only if generated successfully.
- Show print-safe boundaries and warnings for artwork outside the supported print area.
- Validate image dimensions, file size, MIME/type, SVG sanitization, text bounds, and access permissions. Use server-side validation too.

### Admin product management

Admin can add/update/deactivate products without a code change by uploading a validated supported GLB (preferred) and product metadata. Support optional front/back product photos and optional printable artwork images.

Admin form should include:
- title, description, category, product/SKU ID, price and active state;
- sizes, base colors and optional stock/availability;
- GLB upload and optional preview images;
- model version and texture quality variants;
- print-zone definitions for front/back/sleeves only when supported;
- preview scale, camera target and orientation if needed;
- validation status, error details and publish/unpublish action.

On upload, validate type/size, store the original privately, create a derivative only after validation, and generate a preview. Do not immediately replace a live product if validation fails. Publish transactionally so the catalogue updates only after assets and configuration are ready.

Support two clearly distinct pathways:
1. **GLB upload:** inspect model structure and require a compatible UV/print-zone profile before enabling customization.
2. **Front/back image upload only:** apply photos/artwork to an existing compatible garment template. Label this as a template-based approximation; don't claim the photos reconstruct new 3D fabric geometry.

Add authentication and authorization for admin actions. Public customers must never access admin upload endpoints or private files.

## 8. Model/texture mapping strategy

- First test the original GLB on its own, before adding customer artwork.
- Identify the right mesh/material/UV set for the shirt body. Ignore rack/background meshes for customization.
- Prefer an explicit, per-product print-zone/UV configuration over assuming every model uses the same UV layout.
- For each print zone, define a normalized 2D editor space and a documented transformation to UV texture space, including scale, rotation, offset and orientation.
- Render artwork into a texture canvas/canvas-texture (or another justified texture pipeline), update the appropriate Three.js material with correct color-space settings, and mark the texture for update.
- Preserve original material properties and use a separate overlay/material approach where supported. Avoid mutating shared materials between multiple product instances.
- Handle mirrored/back-side UVs, seams, UV islands, edge bleeding, texture filtering, anisotropy, and expected design orientation. If accurate mapping cannot be assured, disable publishing/customization for that model and explain why.
- Test a known asymmetric logo and text such as `FRONT LEFT` / `BACK CENTER` to catch mirroring and orientation errors.
- Dispose replaced textures/materials and avoid memory leaks when the customer changes products many times.

## 9. Asset optimization and delivery

- Preserve high quality for the selected product while creating appropriate lower-resolution variants for thumbnails and lower-powered devices.
- Evaluate GLB/GLTF optimization techniques supported by the current Three.js loader: geometry compression, texture resizing/compression such as KTX2/Basis where justified, and lazy loading.
- Never overwrite the source asset. Keep reproducible scripts and outputs in separate `assets/processed/` or `public/models/` folders.
- Verify the derivative visually before adopting it; optimization must not corrupt UVs, normals, materials or textures.
- Measure loading size/time and browser frame rate on desktop and mobile viewport sizes.
- Avoid claiming 4K detail if the delivered asset is serving a lower-resolution texture.

## 10. Reference implementation/interaction checklist

Compare the local running website against the supplied video at relevant timestamps. Record how the new site reproduces or intentionally improves each interaction.

Required working interactions:
- select a shirt from the rack/collection;
- smooth transition into a product-detail/customization view;
- rotate and zoom the garment;
- switch front/back views;
- change supported product color;
- add/move/resize/rotate/remove image and text overlays;
- see design update on the actual 3D mesh immediately;
- save and restore the design;
- admin uploads another supported shirt and publishes it;
- the new shirt appears in the customer catalogue without a code edit;
- invalid GLB/model fails gracefully with actionable validation errors;
- keyboard accessibility for major controls, visible focus states and reduced-motion support.

## 11. Testing and completion gates

Do not proceed as if a phase is complete until its relevant checks pass.

1. **Build/lint/typecheck:** use scripts actually present in the repository.
2. **Model loading:** original GLB loads in browser; no missing texture paths, console errors or incorrect scaling.
3. **Render comparison:** capture the first hero view and compare with reference video stills. Adjust composition, light and scale using screenshots.
4. **Mapping tests:** verify asymmetric front/back logo and text orientation, position, clipping and persistence.
5. **Admin tests:** valid upload, invalid file, too-large file, model without UVs, publish/unpublish, permissions and catalogue update.
6. **Performance:** test initial load, repeated product switching, memory cleanup and representative mobile viewport.
7. **End-to-end:** browser test selection → customization → save → restore and admin upload → publish → customer view.
8. **Security:** ensure admin endpoints are protected, uploads validated and SVG/files sanitized, private assets are not publicly leaked, and no secrets are committed.
9. **Reporting:** produce `docs/TEST_REPORT.md`, `docs/ASSET_CREDITS.md`, `docs/VIDEO_REFERENCE_ANALYSIS.md`, `docs/ENVIRONMENT_AUDIT.md` and `IMPLEMENTATION_STATUS.md`.

The status report must categorize every requested feature as:
- Verified working (with command/test/screenshot evidence),
- Implemented but not fully verified,
- Blocked (explain the exact blocker), or
- Not implemented.

## 12. Execution order

1. Audit repository and files.
2. Verify model availability and reference video; inspect GLB before coding the 3D experience.
3. Set up only the necessary skills/plugins/MCP with source/license/safety checks.
4. Produce baseline preview of the original GLB in browser.
5. Make one model reliably render, orbit, zoom and switch views.
6. Implement one working front/back artwork pipeline and verify asymmetric design mapping.
7. Build the premium showroom/rack and selection transitions.
8. Build admin upload/validation/publishing workflow.
9. Add saved designs and integrate existing backend/cart if present.
10. Optimize, test, compare to video, fix issues, and document all results.

Do not spend time generating extra procedural 3D assets until the actual shirt customization works. Use real assets where they are better and procedural Three.js where editable code is genuinely beneficial.

## 13. Start now

Begin with Phase A and report the environment findings. Then continue through phases without waiting for unnecessary confirmations. Ask only when an input is genuinely missing, a permission/action needs approval, or a decision has a material cost/security/irreversible effect. Since the user wants to supply the real 4K GLB, do not invent its mesh structure—inspect the actual file once it is in the project.
