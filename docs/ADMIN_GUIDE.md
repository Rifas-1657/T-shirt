# Admin guide — adding a T-shirt design to the store

Open http://localhost:3000/admin and sign in (password: `ADMIN_PASSWORD` in `.env.local`).
"← Back to the store" (top right) returns to the showroom.

## Add a new design (product photos or artwork)

1. **Click "+ New product".** Enter the name, SKU and price, and pick the sizes and colours.
   - **Garment type = rack.** Half-sleeve, Full-sleeve, Oversized or Hoodie. It is suggested from the title ("Oversized …", "… Hoodie", "Long sleeve …"); click another type if the suggestion is wrong.
   - Click **Create product**.
2. **Step 2 · Front & back images.** Choose a front image and/or a back image, then click **Upload & prepare**.
   - **Product photo** (a garment on a plain white/grey background): the fabric colour is detected and becomes the product's base colour; only the printed graphic is cut out and placed where it sits on the garment. A side without a print stays plain.
   - **Print artwork** (PNG/SVG with a transparent background, or artwork on a coloured background): used as it is.
3. **Step 3 · Check & publish.**
   - Look at the two boxes: *your image → the print that will be used*. Check the base colour.
   - Rotate the 3D preview and use **Front / Back**. Adjust size and position with the sliders if needed (the preview updates instantly).
   - Tick the check box, then press **Publish to the … rack**. This saves, approves, publishes and makes it visible in one step.
   - Use **View in store ↗** to see it on its rack.

## Change or remove

- **Wrong rack?** Open the product and click the right garment type. It saves and moves immediately (no Save button needed).
- **New images for a live product:** upload them in step 2 and publish. The old design is kept as an earlier version.
- **Undo a publish:** open the product and pick the earlier version under **Versions**, then click **Publish**.
- **Hide temporarily:** untick **Visible in store**. **Remove:** click **Unpublish**.

## Good images

- Product photos: one garment, front-on, on a plain light background, at least 1000 px wide.
- Low-resolution images still look fine on screen; the admin warns when they are below print quality (150 dpi).

## Limits

- Photos are shown on the category's 3D template; they don't recreate the photographed garment's exact cut.
- Print extraction works best on solid-colour garments. On heavily patterned or all-over-print garments, upload the artwork file instead.
