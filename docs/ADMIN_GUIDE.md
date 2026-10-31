# Admin guide — adding T-shirts and perfumes to the store

Open http://localhost:3000/admin and sign in (password: `ADMIN_PASSWORD` in `.env.local`).
"← Back to the store" (top right) returns to the showroom.

## The New product form (same order for every category)

1. **What are you adding?** Click a card. Each card shows a real picture of where the product will appear: the half-sleeve, full-sleeve, oversized or hoodie rack, or the perfume salon. The category is also detected from the name ("… Hoodie", "… Eau de Parfum"), so you can type the name first if you prefer. There is no separate "display category" any more; the shop's label (T-Shirts, Hoodies, Perfumes) follows the card.
2. **Photos.** These come *before* the details, so you start with the product itself.
   - T-shirts and hoodies: a **Front** slot and a **Back** slot (product photo or print artwork). Both are optional; you can add them later.
   - Perfumes: drop up to **8 photos** (front, ¾ angle, side, back, detail). The view of each photo is guessed from the order; change it with the drop-down.
3. **Details.** Name, SKU (suggested from the name, editable), price, and sizes and colours (apparel) or volume, concentration, family and notes (perfume).
4. **Create.** The product is created and the photos are uploaded straight away. You land on the product with the next step shown.

The product list on the left is grouped by category; a green dot means the product is live.

## T-shirts and hoodies: check & publish

- **Product photo** (a garment on a plain white/grey background): the fabric colour is detected and becomes the base colour. Only the printed graphic is cut out and placed where it sits on the garment. A side without a print stays plain.
- **Print artwork** (PNG/SVG with a transparent background): used as it is.
- In **2 · Check & publish**, compare *your image → the print that will be used* and rotate the 3D preview. Adjust size and position if needed, tick the box and press **Publish to the … rack**. **View in store ↗** opens it on its rack.

## Perfumes: photos, check & publish

1. **1 · Photos.** Each photo shows *your upload → what customers see*. **Any photo works**: the bottle is cut out of its background automatically.
   - Plain, light background (white/grey studio shot): cut out instantly, and the juice colour of the first photo becomes the perfume's colour.
   - Busy background (table, flowers, a room): the AI cut-out removes the background in about 20 seconds per photo, in the background. The photo shows "Removing the background…" and the page updates by itself. If a photo stayed framed, press **Cut out with AI**.
   - For each photo you can choose **Show first** (the photo on display), change the **view**, switch the **cut-out** off, or **Delete** it.
2. **2 · Check & publish.** The *salon preview* shows the first photo on its plinth. Press **Publish to the perfume salon**. In the salon each perfume gets its own lit niche; the niche glows in the perfume's liquid colour (set from the first photo, or in the details).
3. **3 · Details.** Name, price, volume (the bottle's size in the salon follows it) and notes. The **3D bottle** settings are used only when a perfume has no photos.

**Which photos to upload (for a premium result)**

| Photo | Why |
|---|---|
| **Front** (label facing you) | The photo on display |
| **¾ angle** (turned about 35°) | Makes the bottle turn on the counter |
| **Side** | 〃 |
| **Back** | 〃 |
| Detail (optional) | Close-up of the cap or label, shown in Discover only |

- One bottle per photo, upright, the whole bottle in the picture (cap not cut off), sharp, at least 1000 px tall.
- Same camera height and distance for all angles: the angles then line up when the bottle turns.
- You do **not** need to change the background yourself. A plain white background still gives the cleanest glass edges.
- Use your own product photos or photos you are licensed to use; images copied from other shops are usually copyrighted.

With two or more angle photos (front, ¾, side, back), the bottle **turns slowly on the counter** and customers can **drag it to turn it**. Customers browse perfumes by dragging or swiping anywhere, with the arrows, or with the keyboard; the browser **Back** button returns to the previous perfume.

## Print areas customers can design

Every T-shirt and hoodie offers **Front**, **Back**, **Left sleeve** and **Right sleeve**. Sleeve prints are small (about 8 × 4 cm on short sleeves, 4 × 9 cm down the upper arm on long sleeves) and follow the angle of the sleeve. Uploaded 3D models (GLB) keep only the zones defined in their print profile.

## Change or remove

- **Wrong rack?** Open the product and click the right garment type. It saves and moves immediately (no Save button needed).
- **New images for a live product:** upload them in step 1 and publish. The old design is kept as an earlier version.
- **Undo a publish:** open the product and pick the earlier version under **Versions**, then click **Publish**.
- **Hide temporarily:** untick **Visible in store**. **Remove:** click **Unpublish**.

## Good images

- Product photos: one garment, front-on, on a plain light background, at least 1000 px wide.
- Low-resolution images still look fine on screen; the admin warns when they are below print quality (150 dpi).

## Limits

- Photos are shown on the category's 3D template; they don't recreate the photographed garment's exact cut.
- Print extraction works best on solid-colour garments. On heavily patterned or all-over-print garments, upload the artwork file instead.
