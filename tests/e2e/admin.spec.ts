import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { TEMPLATE_ZONES } from '../../src/lib/template';
import { adminLogin, waitForScene } from './helpers';

test.describe('admin security', () => {
  test('admin APIs refuse anonymous and cross-origin requests', async ({ request, browser }) => {
    expect((await request.get('/api/admin/products')).status()).toBe(401);
    expect((await request.post('/api/admin/products', { data: { title: 'x' } })).status()).toBe(401);
    expect((await request.post('/api/admin/login', { data: { password: 'wrong' }, headers: { origin: 'http://localhost:3100' } })).status()).toBe(401);
    // a logged-in browser still cannot be driven cross-origin
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await adminLogin(page);
    const res = await page.request.post('/api/admin/products', { data: { title: 'Evil' }, headers: { origin: 'https://evil.example' } });
    expect(res.status()).toBe(403);
    await ctx.close();
  });
});

test.describe('admin product workflow', () => {
  test('invalid uploads fail safely; valid GLB is profiled, verified, published and appears in the shop', async ({ page }) => {
    await adminLogin(page);
    const sku = `E2E-${Date.now().toString(36).toUpperCase()}`;
    await page.getByTestId('new-product').click();
    await page.getByTestId('pf-title').fill('Uploaded Studio Tee');
    await page.getByTestId('pf-sku').fill(sku);
    await page.getByTestId('pf-price').fill('79');
    await page.getByTestId('pf-submit').click();
    await expect(page.getByTestId('admin-msg')).toContainText('Created Uploaded Studio Tee');

    // 1) not a GLB
    await page.getByTestId('glb-input').setInputFiles('tests/fixtures/not-a-model.glb');
    await expect(page.getByTestId('version-status')).toHaveText('failed');
    await expect(page.getByTestId('version-issues').locator('[data-code=not_glb]')).not.toHaveCount(0);
    // 2) model without UVs
    await page.getByTestId('glb-input').setInputFiles('tests/fixtures/no-uv-shirt.glb');
    await expect(page.getByTestId('version-issues').locator('[data-code=no_uvs]')).not.toHaveCount(0);
    await expect(page.getByTestId('publish')).toBeDisabled();
    // 3) external resources
    await page.getByTestId('glb-input').setInputFiles('tests/fixtures/external-uri.glb');
    await expect(page.getByTestId('version-issues').locator('[data-code=external_resources]')).not.toHaveCount(0);

    // the product is still not in the public catalogue
    let cat = await (await page.request.get('/api/products')).json();
    expect(cat.products.some((p: { sku: string }) => p.sku === sku)).toBe(false);

    // 4) too large (sent through the API with the admin session)
    const { products } = await (await page.request.get('/api/admin/products')).json();
    const product = products.find((p: { sku: string }) => p.sku === sku);
    const huge = Buffer.alloc(61 * 1024 * 1024);
    readFileSync('tests/fixtures/valid-shirt.glb').copy(huge, 0, 0, 20);
    const big = await page.request.post(`/api/admin/products/${product.id}/model`, {
      multipart: { file: { name: 'huge.glb', mimeType: 'model/gltf-binary', buffer: huge } },
      headers: { origin: 'http://localhost:3100' },
    });
    expect([413, 422]).toContain(big.status());

    // 5) valid GLB
    await page.getByTestId('glb-input').setInputFiles('tests/fixtures/valid-shirt.glb');
    await expect(page.getByTestId('version-status')).toHaveText('validated');
    await expect(page.getByTestId('version-issues').locator('[data-code=no_print_profile]')).not.toHaveCount(0);

    // define the print profile (Shirt mesh + front/back zones), via the same API the form uses
    const after = (await (await page.request.get('/api/admin/products')).json()).products.find((p: { sku: string }) => p.sku === sku);
    const version = after.versions.at(-1);
    // drafts are not public
    expect((await page.request.get(`/api/models/${after.id}/${version.id}`)).status()).toBe(200); // admin session may preview drafts
    const anon = await (await import('@playwright/test')).request.newContext({ baseURL: 'http://localhost:3100' });
    expect((await anon.get(`/api/models/${after.id}/${version.id}`)).status()).toBe(404);

    const prof = await page.request.patch(`/api/admin/products/${after.id}/versions/${version.id}`, {
      data: { printableMeshes: ['Shirt'], printZones: TEMPLATE_ZONES },
      headers: { origin: 'http://localhost:3100' },
    });
    expect(prof.ok()).toBe(true);
    await page.reload();
    await page.getByRole('button', { name: /Uploaded Studio Tee/ }).click();
    await page.getByRole('button', { name: /GLB · validated/ }).last().click();
    await expect(page.getByTestId('version-issues').locator('[data-code=zone_coverage]')).not.toHaveCount(0);
    await expect(page.getByTestId('admin-preview').locator('canvas')).toBeVisible();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: 'docs/screenshots/e2e/admin-mapping-front.png' });
    await page.getByTestId('admin-preview-back').click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'docs/screenshots/e2e/admin-mapping-back.png' });

    // confirm the mapping test, save a preview, publish
    await page.getByTestId('mapping-check').check();
    await page.getByTestId('confirm-mapping').click();
    await expect(page.getByTestId('admin-msg')).toContainText('Mapping confirmed');
    await page.getByTestId('save-preview').click();
    await expect(page.getByTestId('admin-msg')).toContainText('Preview image saved');
    await page.getByTestId('publish').click();
    await expect(page.getByTestId('admin-msg')).toContainText('Published');
    // publishing puts it in the store; no separate "activate" step
    await expect(page.getByTestId('active-toggle')).toBeChecked();

    // customer catalogue now includes it, no code change
    cat = await (await anon.get('/api/products')).json();
    const pub = cat.products.find((p: { sku: string }) => p.sku === sku);
    expect(pub).toBeTruthy();
    expect(pub.version.modelConfig.modelUrl).toMatch(/^\/api\/models\//);
    expect(JSON.stringify(pub)).not.toMatch(/originalKey|private/);
    expect((await anon.get(pub.version.modelConfig.modelUrl)).status()).toBe(200);

    const shop = await page.context().newPage();
    await shop.goto('/');
    await waitForScene(shop);
    await shop.getByTestId(`product-${sku}`).click();
    await expect(shop.getByTestId('detail-title')).toHaveText('Uploaded Studio Tee');
    await expect(shop.getByTestId('customize-btn')).toBeEnabled();
    await shop.waitForTimeout(2000);
    await shop.screenshot({ path: 'docs/screenshots/e2e/uploaded-product-detail.png' });

    // unpublish removes it again
    await page.getByTestId('unpublish').click();
    await expect(page.getByTestId('admin-msg')).toContainText('Unpublished');
    cat = await (await anon.get('/api/products')).json();
    expect(cat.products.some((p: { sku: string }) => p.sku === sku)).toBe(false);
    await anon.dispose();
  });

  test('product photos → oversized rack: category saves at once, print cut out, colour detected, one-click publish, rollback', async ({ page }) => {
    await adminLogin(page);
    await expect(page.getByTestId('back-to-store')).toBeVisible();
    await page.getByTestId('new-product').click();
    const sku = `IMG-${Date.now().toString(36).toUpperCase()}`;
    await page.getByTestId('pf-title').fill('Embrace Tee');
    await expect(page.getByTestId('garment-hint')).toContainText('Automatic: Half-sleeve');
    await page.getByTestId('pf-sku').fill(sku);
    await page.getByTestId('pf-price').fill('99');
    await page.getByTestId('pf-submit').click();
    await expect(page.getByTestId('admin-msg')).toContainText('Half-sleeve tees rack');
    await expect(page.getByTestId('live-status')).toContainText('Not in the store yet');

    // switching the garment type on an existing product saves immediately (no hidden unsaved state)
    await page.getByTestId('pf-garment-oversized').click();
    await expect(page.getByTestId('admin-msg')).toContainText('Moved to the Oversized tees rack');
    type AdminP = { sku: string; id: string; garment: string; colors: { name: string; hex: string }[]; versions: { id: string; modelConfig: { source: string } }[] };
    const adminProduct = async () => ((await (await page.request.get('/api/admin/products')).json()).products as AdminP[]).find((x) => x.sku === sku)!;
    expect((await adminProduct()).garment).toBe('oversized');

    // an invalid image is refused with a reason and nothing is created
    await page.getByTestId('img-front').setInputFiles('tests/fixtures/not-a-model.glb');
    await page.getByTestId('img-submit').click();
    await expect(page.getByTestId('admin-msg')).toContainText('Unsupported file type');

    // product photos: black tee with a chest print, plain back
    await page.getByTestId('img-front').setInputFiles('tests/fixtures/product-photo-front.png');
    await page.getByTestId('img-back').setInputFiles('tests/fixtures/product-photo-back.png');
    await page.getByTestId('img-submit').click();
    await expect(page.getByTestId('admin-msg')).toContainText('Images prepared');
    await expect(page.getByTestId('detected-artwork')).toContainText('Black');
    await expect(page.getByTestId('print-front')).toHaveAttribute('src', /\/api\/uploads\//);
    await expect(page.getByTestId('print-back')).toContainText('Plain');
    await expect(page.getByTestId('version-issues')).toContainText('oversized');
    expect((await adminProduct()).colors[0].name).toBe('Black');
    // publishing needs the check box
    await expect(page.getByTestId('publish')).toBeDisabled();
    await page.getByTestId('place-front-scale').fill('0.9');
    await page.waitForTimeout(2500);
    await page.screenshot({ path: 'docs/screenshots/e2e/admin-photo-front.png' });
    await page.getByTestId('admin-preview-back').click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'docs/screenshots/e2e/admin-photo-back.png' });
    await page.getByTestId('approve-check').check();
    await page.getByTestId('publish').click();
    // one click: placement saved, approved, published and visible
    await expect(page.getByTestId('admin-msg')).toContainText('now live on the Oversized tees rack');
    await expect(page.getByTestId('admin-msg-link')).toHaveAttribute('href', /\?product=/);
    await expect(page.getByTestId('live-status')).toContainText('Live on the Oversized tees rack');

    type Pub = { sku: string; id: string; garment: string; colors: { name: string }[]; version: { pathway: string; modelConfig: { modelUrl: string }; baseLayers: Record<string, { src: string; scale: number }[]> } };
    const pub = async () => ((await (await page.request.get('/api/products')).json()).products as Pub[]).find((x) => x.sku === sku);
    const p = (await pub())!;
    expect(p.garment).toBe('oversized');
    expect(p.colors[0].name).toBe('Black');
    expect(p.version.modelConfig.modelUrl).toBe('/models/garments/oversized-v2.glb');
    expect(p.version.baseLayers.front[0].scale).toBeCloseTo(0.9);
    expect(p.version.baseLayers.back ?? []).toHaveLength(0);

    // storefront: on the oversized rack, front print, plain back
    const shop = await page.context().newPage();
    await shop.goto(`/?product=${p.id}`);
    await waitForScene(shop);
    const rackOf = async (id: string) =>
      Object.entries(await shop.evaluate(() => (window as unknown as { __atelier: { racks: () => Record<string, { id: string }[]> } }).__atelier.racks())).find(([, list]) => list.some((g) => g.id === id))?.[0];
    expect(await rackOf(p.id)).toBe('oversized');
    await expect(shop.getByTestId('detail-category')).toContainText('Oversized');
    await expect(shop.getByTestId('customize-btn')).toBeEnabled();
    await shop.waitForTimeout(2200);
    await shop.screenshot({ path: 'docs/screenshots/e2e/photo-product-front.png' });
    await shop.getByTestId('view-back').click();
    await shop.waitForTimeout(1800);
    await shop.screenshot({ path: 'docs/screenshots/e2e/photo-product-back.png' });

    // clear errors for an invalid category and an invalid placement
    const bad = await page.request.patch(`/api/admin/products/${p.id}`, { data: { garment: 'kimono' }, headers: { origin: 'http://localhost:3100' } });
    expect(bad.status()).toBe(422);
    expect((await bad.json()).errors.join(' ')).toMatch(/half-sleeve, full-sleeve, oversized or hoodie/);
    const vid = (await adminProduct()).versions.at(-1)!.id;
    const badPlace = await page.request.patch(`/api/admin/products/${p.id}/versions/${vid}`, {
      data: { baseLayers: { front: [{ id: 'x', type: 'image', src: 'https://evil.example/x.png', width: 0.5, aspect: 1, name: 'x', x: 0.5, y: 0.5, rotation: 0, scale: 1, opacity: 1 }] } },
      headers: { origin: 'http://localhost:3100' },
    });
    expect(badPlace.status()).toBe(422);
    expect((await badPlace.json()).errors.join(' ')).toMatch(/validated upload/);

    // re-categorise from the admin: moves rack and template
    await page.getByTestId('pf-garment-hoodie').click();
    await expect(page.getByTestId('admin-msg')).toContainText('Moved to the Hoodies rack');
    expect((await pub())!.version.modelConfig.modelUrl).toBe('/models/garments/hoodie-v2.glb');
    await shop.goto('/');
    await waitForScene(shop);
    expect(await rackOf(p.id)).toBe('hoodie');

    // unpublish removes it from the storefront
    await page.getByTestId('unpublish').click();
    await expect(page.getByTestId('admin-msg')).toContainText('Unpublished');
    expect(await pub()).toBeUndefined();
    await shop.goto('/');
    await waitForScene(shop);
    expect(await rackOf(p.id)).toBeUndefined();
  });

  test('a seeded product can be rolled back to its original template design', async ({ page }) => {
    await adminLogin(page);
    const products = (await (await page.request.get('/api/admin/products')).json()).products as { id: string; sku: string; liveVersionId: string; versions: { id: string }[] }[];
    const onyx = products.find((p) => p.sku === 'ATL-CRW-ONX')!;
    const original = onyx.liveVersionId;
    const fd = { front: { name: 'f.png', mimeType: 'image/png', buffer: readFileSync('tests/fixtures/logo-arrow.png') } };
    const created = await page.request.post(`/api/admin/products/${onyx.id}/images`, { multipart: fd, headers: { origin: 'http://localhost:3100' } });
    const vid = (await created.json()).version.id;
    await page.request.patch(`/api/admin/products/${onyx.id}/versions/${vid}`, { data: { artworkApproved: true }, headers: { origin: 'http://localhost:3100' } });
    expect((await page.request.post(`/api/admin/products/${onyx.id}/publish`, { data: { versionId: vid }, headers: { origin: 'http://localhost:3100' } })).ok()).toBe(true);
    // roll back to the original (archived) template version
    const back = await page.request.post(`/api/admin/products/${onyx.id}/publish`, { data: { versionId: original }, headers: { origin: 'http://localhost:3100' } });
    expect(back.ok()).toBe(true);
    const pub = (await (await page.request.get('/api/products')).json()).products.find((p: { sku: string }) => p.sku === 'ATL-CRW-ONX');
    expect(pub.version.id).toBe(original);
  });
});
