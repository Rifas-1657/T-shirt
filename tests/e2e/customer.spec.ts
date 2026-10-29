import { expect, test } from '@playwright/test';
import { sceneInfo, waitForScene } from './helpers';

test.describe('customer showroom', () => {
  test('rail renders, hover caption, detail view with colour/size/front/back', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto('/');
    await waitForScene(page);
    await page.screenshot({ path: 'docs/screenshots/e2e/collection.png' });
    // every published product hangs on the rack of its garment category
    const { products } = await (await page.request.get('/api/products')).json();
    const racks = await page.evaluate(() => (window as unknown as { __atelier: { racks: () => Record<string, { id: string }[]> } }).__atelier.racks());
    for (const p of products as { id: string; garment: string }[]) expect(racks[p.garment].map((g) => g.id)).toContain(p.id);
    for (const cat of ['half-sleeve', 'full-sleeve', 'oversized', 'hoodie']) expect(racks[cat]?.length ?? 0).toBeGreaterThanOrEqual(4);

    // pointer hover over the middle of the rail swings a garment round and updates the caption
    await page.mouse.move(720, 460);
    await expect(page.getByTestId('caption')).not.toHaveText('Select a piece');
    await page.screenshot({ path: 'docs/screenshots/e2e/hover.png' });

    // keyboard path: focusing an index button previews it; Enter opens it
    await page.mouse.move(5, 5);
    await page.getByTestId('product-ATL-CRW-SGE').focus();
    await expect(page.getByTestId('caption')).toHaveText('Sage Crew Tee');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('detail-title')).toHaveText('Sage Crew Tee');
    await page.getByTestId('color-Onyx').click();
    await expect(page.getByRole('radio', { name: 'Onyx' })).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('view-back').click();
    await page.waitForTimeout(1200);
    await page.getByTestId('view-front').click();
    await page.getByTestId('view-reset').click();
    await page.screenshot({ path: 'docs/screenshots/e2e/detail.png' });
    // Escape returns to the collection
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('caption')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('clicking a garment on any rack shows its details and Customise immediately (no colour click needed)', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    const { products } = await (await page.request.get('/api/products')).json();
    for (const cat of ['half-sleeve', 'full-sleeve', 'oversized', 'hoodie']) {
      await page.getByTestId(`rack-tab-${cat}`).click();
      await page.waitForTimeout(2200); // camera glide to the rack
      const target = (products as { id: string; garment: string; title: string }[]).filter((p) => p.garment === cat)[1];
      const pt = await page.evaluate((id) => (window as unknown as { __atelier: { screenPoint: (id: string) => { x: number; y: number } | null } }).__atelier.screenPoint(id), target.id);
      expect(pt).not.toBeNull();
      await page.mouse.click(pt!.x, pt!.y); // a real click on the 3D garment, not on a chip
      // the panel and an enabled Customise button must appear at once, before any other interaction
      await expect(page.getByTestId('detail-panel')).toBeVisible({ timeout: 1000 });
      await expect(page.getByTestId('customize-btn')).toBeEnabled({ timeout: 1000 });
      await expect(page.getByTestId('detail-title')).toHaveText(target.title);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `docs/screenshots/e2e/detail-${cat}.png` });
      await page.getByTestId('customize-btn').click();
      await expect(page.getByTestId('design-editor')).toBeVisible();
      await page.keyboard.press('Escape'); // back to detail
      await page.keyboard.press('Escape'); // back to the rack
      await expect(page.getByTestId('caption')).toBeVisible();
    }
  });

  test('rack navigation: tabs, arrow keys and the overview', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    await expect(page.getByTestId('rack-tab-half-sleeve')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('rack-tab-full-sleeve')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('rack-products')).toContainText('Long Sleeve');
    await page.getByTestId('rack-tab-all').click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: 'docs/screenshots/e2e/all-racks.png' });
    await page.getByTestId('rack-tab-hoodie').click();
    await expect(page.getByTestId('rack-products')).toContainText('Hoodie');
    await page.waitForTimeout(2200);
    await page.screenshot({ path: 'docs/screenshots/e2e/hoodie-rack.png' });
  });

  test('customise front/back, upload artwork, undo/redo, save and restore', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    await page.getByTestId('product-ATL-CRW-CHK').click();
    await page.getByTestId('customize-btn').click();
    await expect(page.getByTestId('design-editor')).toBeVisible();

    // front: text, edited to an asymmetric label and nudged left by keyboard
    await page.getByTestId('add-text').click();
    await page.getByTestId('text-input').fill('FRONT LEFT');
    await page.getByTestId('zone-stage').focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowLeft');
    await expect(page.getByTestId('layer-list').locator('li')).toHaveCount(1);

    // upload a real PNG through the validated endpoint
    await page.getByTestId('upload-input').setInputFiles('tests/fixtures/logo-arrow.png');
    await expect(page.getByTestId('layer-list').locator('li')).toHaveCount(2);
    // resize via the property panel, then undo/redo it
    await page.getByTestId('scale-input').fill('0.6');
    await page.getByTestId('undo').click();
    await page.getByTestId('redo').click();

    // invalid upload is refused with a reason
    await page.getByTestId('upload-input').setInputFiles('tests/fixtures/not-a-model.glb');
    await expect(page.getByTestId('upload-error')).toContainText('Unsupported file type');

    // back side
    await page.getByTestId('zone-back').click();
    await page.getByTestId('add-text').click();
    await expect(page.getByTestId('layer-list').locator('li')).toHaveCount(1);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'docs/screenshots/e2e/customize-back.png' });

    // the design reaches the GPU: the print overlay texture exists
    const info = await sceneInfo(page);
    expect(info.memory.textures).toBeGreaterThan(3);

    await page.getByTestId('save-design').click();
    const link = page.getByTestId('saved-link').locator('a');
    await expect(link).toBeVisible();
    const href = await link.getAttribute('href');
    expect(href).toMatch(/\?design=/);

    // restore in a fresh page
    const fresh = await page.context().newPage();
    await fresh.goto(href!);
    await waitForScene(fresh);
    await expect(fresh.getByTestId('notice')).toContainText('restored');
    await expect(fresh.getByTestId('design-editor')).toBeVisible();
    await expect(fresh.getByTestId('layer-list').locator('li')).toHaveCount(2); // front: text + logo
    await expect(fresh.getByTestId('layer-list')).toContainText('FRONT LEFT');
    await fresh.getByTestId('zone-back').click();
    await expect(fresh.getByTestId('layer-list')).toContainText('BACK CENTER');
    await fresh.waitForTimeout(1500);
    await fresh.screenshot({ path: 'docs/screenshots/e2e/restored.png' });

    // saved JSON is versioned and references the validated upload, not a data URL
    const id = new URL(href!).searchParams.get('design');
    const saved = await (await page.request.get(`/api/designs/${id}`)).json();
    expect(saved.design.schemaVersion).toBe(1);
    expect(saved.design.zones.front.find((l: { type: string }) => l.type === 'image').src).toMatch(/^\/api\/uploads\//);
    expect(saved.design.productVersionId).toBeTruthy();
  });

  test('server rejects tampered designs', async ({ request }) => {
    const { products } = await (await request.get('/api/products')).json();
    const p = products[0];
    const res = await request.post('/api/designs', {
      data: { design: { schemaVersion: 1, productId: p.id, productVersionId: p.version.id, color: { name: 'x', hex: '#00ff00' }, size: 'M', zones: { front: [{ id: 'a', type: 'image', src: 'https://evil.example/a.png', width: 0.5, aspect: 1, name: 'a', x: 0.5, y: 0.5, rotation: 0, scale: 1, opacity: 1 }], back: [] } } },
    });
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.errors.join(' ')).toMatch(/color|upload/);
  });
});
