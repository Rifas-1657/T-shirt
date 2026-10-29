# Reference video analysis

Source: `references/videos/Transform your clothing store into a premium shopping experience …mp4` — 31.5 s, 720×1280 portrait, 30 fps. It is a phone recording of a laptop screen (social-media style, with burnt-in captions). The video was analysed from extracted frames: `docs/video-frames/contact-sheet.jpg` (1 fps, timestamped) and the key-frame sheets `docs/video-frames/key-a.jpg` (0.5 / 2.5 / 4.0 / 5.2 s) and `key-b.jpg` (5.8 / 27 / 29.5 / 31 s).

It is visual reference only. Its storefront brands ("ELLE"-style logo, "LARANA Studio") and the builder UI were not reproduced.

## Timeline

| Time | What is on screen | Relevance |
|---|---|---|
| 0.0–4.9 s | Storefront section: thin promo bar, centred serif logo, small nav, eyebrow "NEW COLLECTION · PREMIUM STREETWEAR". A long horizontal **steel rail with ball end caps** spanning the page; 9 garments (hoodies, jacket, tees) on hangers **seen edge-on**. Below: the hovered product's name ("Cryptic Celestia Hoodie", "Sunset Orange Tee", "Classic Crewe Sweatshirt") + "Shop the Collection". | Core interaction |
| ~1–4 s | **Hover**: the garment under the cursor **swings ~90° to face the viewer** and its neighbours shift aside; the caption updates to that product. | Reproduced in 3D |
| 5.0–6.0 s | **Detail view**: the selected garment (Forest Green Hoodie) centred large on a plain light background, still on its hanger; below it the eyebrow, name, short description, price (₹2,799), a **Front / Back** toggle, a "View in the store" link and a close (×) at top right. | Reproduced (3D, rotatable) |
| 6–20 s | Store-builder / code-editor footage ("Edit code", "New file", "Copy & paste the code"). | Not a product interaction; ignored |
| 21–23 s | Another site section with lifestyle photos. | Not relevant |
| 24–31 s | Second storefront ("LARANA Studio") using the same rail section: hovering "Midnight Navy Blazer" and "Heather Grey Hoodie" swings them to face front. | Confirms the interaction pattern |

## Visual language

- **Palette:** near-white / warm off-white backgrounds, black or rust promo bar, garments in muted tones (charcoal, navy, grey, forest green, cream, dusty pink, off-white, orange).
- **Typography:** high-contrast serif logo, small widely-tracked uppercase sans for eyebrows and nav, a medium serif/sans product name centred under the rail.
- **Lighting:** soft, shadowless product photography (2D cut-outs). There is no real 3D lighting in the video; the garments are images rotated with CSS-like transforms.
- **Motion:** quick, eased swing on hover (~300–400 ms); a crossfade into the detail screen.
- **Composition:** the rail sits in the upper third, the garments hang into the middle, the caption sits at the bottom centre with generous whitespace.

## What the video does not prove

The video shows a 2D image-based effect. It does not show 3D rotation of the garments, customisation, colour changes or an admin workflow. Those are new features in this project, not reproductions.

## Interaction checklist (reference → implementation)

| Reference behaviour | Implementation | Status |
|---|---|---|
| Rail with garments edge-on | Real 3D rail (`Scene.tsx` `Room`), garments rotated ~72° on the rail | Verified (screenshot `docs/screenshots/e2e/collection.png`) |
| Hover swings garment to the front, neighbours make room | `RailItem` damped rotation + neighbour spread; caption bound to the hovered product | Verified (`hover.png`, e2e `customer.spec`) |
| Caption under the rail | `data-testid=caption`, `aria-live=polite` | Verified |
| Click → centred detail view, plain light background | Garment glides forward, a veil fades the room, camera dollies in; info panel on the right | Verified (`detail.png`) |
| Front / Back toggle | Turns the 3D garment 180° (Front/Back/Reset view buttons) | Verified |
| Close / back | "Back to collection" button and Escape key | Verified (e2e) |
| *Improvement:* free orbit + zoom | OrbitControls limited to the front hemisphere with distance limits | Implemented; verified by screenshot only |
| *Improvement:* keyboard access | Collection index buttons (focus previews, Enter opens), Escape, editor arrow keys/Delete, Ctrl+Z/Y | Verified (e2e) |
| *Improvement:* reduced motion | All damping becomes an instant snap when `prefers-reduced-motion` is set | Verified (e2e) |
| *Improvement:* customisation | Front/back print editor mapped live onto the 3D mesh | Verified |

## Hero comparison

`docs/screenshots/e2e/collection.png` vs `docs/video-frames/key-a.jpg` (0.5 s): same structure (promo bar, centred logo, eyebrow, rail with end caps in the upper third, edge-on garments, caption at the bottom). The differences are deliberate: a real 3D gallery with a floor, a warm key light and a visible scanned coat rack as a set piece. The collection is T-shirts only, because only a T-shirt template exists.
