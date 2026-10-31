import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { adminLogin } from './helpers';

test.describe('perfume salon', () => {
  test('opening animation, then gallery, next/previous, inspect with notes, back', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/perfumes');
    // the opening plays first (maroon field, Arabic + French title, Qatar serrated sweep)
    await expect(page.getByTestId('perfume-intro')).toBeVisible();
    await expect(page.getByTestId('perfume-intro')).toContainText(/maison des parfums/i);
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'docs/screenshots/e2e/perfume-intro.png' });
    // it unveils the salon once the 3D scene is ready
    await expect(page.getByTestId('perfume-intro')).toBeHidden({ timeout: 20_000 });
    await expect(page.getByTestId('perfume-caption')).toBeVisible();
    const first = await page.getByTestId('perfume-title').textContent();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'docs/screenshots/e2e/perfume-gallery.png' });

    await page.getByTestId('perfume-next').click();
    await expect(page.getByTestId('perfume-title')).not.toHaveText(first!);
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('perfume-title')).toHaveText(first!);

    await page.getByTestId('perfume-discover').click();
    await expect(page.getByTestId('perfume-detail')).toBeVisible();
    await expect(page.getByTestId('perfume-notes')).toContainText('Top');
    await expect(page.getByTestId('perfume-detail')).toContainText('QAR');
    await page.waitForTimeout(1800);
    await page.screenshot({ path: 'docs/screenshots/e2e/perfume-inspect.png' });
    // no customisation exists for perfumes
    await expect(page.getByText(/customis/i)).toHaveCount(0);
    await page.getByTestId('perfume-back').click();
    await expect(page.getByTestId('perfume-caption')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('skip and reduced motion: the salon is usable without waiting for the intro', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto('/perfumes');
    await expect(page.getByTestId('perfume-intro')).toHaveCount(0);
    await expect(page.getByTestId('perfume-caption')).toBeVisible();
    await ctx.close();

    const p2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await p2.goto('/perfumes');
    await p2.getByTestId('skip-intro').click();
    await expect(p2.getByTestId('perfume-intro')).toBeHidden();
    await expect(p2.getByTestId('perfume-caption')).toBeVisible();
    await p2.close();
  });

  test('mobile: salon fits the phone and swipe/buttons work', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto('/perfumes');
    await page.getByTestId('skip-intro').click();
    await expect(page.getByTestId('perfume-caption')).toBeVisible();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'docs/screenshots/e2e/perfume-mobile.png' });
    const t = await page.getByTestId('perfume-title').textContent();
    await page.getByTestId('perfume-next').click();
    await expect(page.getByTestId('perfume-title')).not.toHaveText(t!);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await ctx.close();
  });
});

test('admin: create a perfume (auto category), preview the bottle, publish to the salon; never on the apparel racks', async ({ page }) => {
  await adminLogin(page);
  await page.getByTestId('new-product').click();
  const sku = `PF-${Date.now().toString(36).toUpperCase()}`;
  await page.getByTestId('pf-title').fill('Rose Royale Eau de Parfum');
  await expect(page.getByTestId('garment-hint')).toContainText('Automatic: Perfume');
  await expect(page.getByTestId('perfume-fields')).toBeVisible();
  await page.getByTestId('pf-sku').fill(sku);
  await page.getByTestId('pf-price').fill('920');
  await page.getByTestId('pf-bottle-ward').click();
  await page.getByTestId('pf-cap-rose-gold').click();
  await page.getByTestId('pf-volume').fill('75');
  await page.getByTestId('pf-notes-top').fill('Lychee, Bergamot');
  await page.getByTestId('pf-submit').first().click();
  await expect(page.getByTestId('admin-msg')).toContainText('perfume salon');
  await expect(page.getByTestId('perfume-panel')).toBeVisible();
  await expect(page.getByTestId('perfume-preview').locator('canvas')).toBeVisible();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'docs/screenshots/e2e/admin-perfume.png' });
  await page.getByTestId('publish-perfume').click();
  await expect(page.getByTestId('admin-msg')).toContainText('now in the perfume salon');
  await expect(page.getByTestId('live-status')).toContainText('perfume salon');

  const pub = ((await (await page.request.get('/api/products')).json()).products as { sku: string; id: string; kind: string; currency: string; perfume: { bottle: string; cap: string; volumeMl: number; notes: { top: string[] } }; version: { modelConfig: { printZones: unknown[]; modelUrl: string } } }[]).find((x) => x.sku === sku)!;
  expect(pub.kind).toBe('perfume');
  expect(pub.currency).toBe('QAR');
  expect(pub.perfume).toMatchObject({ bottle: 'ward', cap: 'rose-gold', volumeMl: 75, notes: { top: ['Lychee', 'Bergamot'] } });
  expect(pub.version.modelConfig.modelUrl).toBe('/models/perfume/ward.glb');
  expect(pub.version.modelConfig.printZones).toEqual([]); // not customisable

  const shop = await page.context().newPage();
  await shop.goto(`/perfumes?p=${pub.id}`);
  await shop.getByTestId('skip-intro').click();
  await expect(shop.getByTestId('perfume-title')).toHaveText('Rose Royale Eau de Parfum');
  await shop.goto('/');
  await expect(shop.getByTestId(`product-${sku}`)).toHaveCount(0); // perfumes never hang on the apparel racks
});

test('admin: photos first — pick the Perfume card, drop photos, create; bottle is cut out and shown as a photo in the salon', async ({ page }) => {
  await adminLogin(page);
  await page.getByTestId('new-product').click();
  // 1 · category card with a preview of where it appears, 2 · photos before any details
  await page.getByTestId('pf-garment-perfume').click();
  await page.getByTestId('perfume-photos-input').setInputFiles(['tests/fixtures/perfume-front.jpg', 'tests/fixtures/perfume-angle.jpg']);
  await expect(page.getByTestId('photo-picker').locator('li')).toHaveCount(2);
  await page.getByTestId('pf-title').fill('Maroon Velvet Extrait');
  await expect(page.getByTestId('pf-sku')).toHaveValue(/^PF-MAROON-VELVET/); // suggested, editable
  const sku = `PF-MV-${Date.now().toString(36).toUpperCase()}`;
  await page.getByTestId('pf-sku').fill(sku);
  await page.getByTestId('pf-price').fill('1100');
  await page.getByTestId('pf-submit').first().click();
  await expect(page.getByTestId('admin-msg')).toContainText('Photos uploaded');
  // saved photos: the cut-out is shown, first photo is on display
  await expect(page.getByTestId('saved-photo')).toHaveCount(2);
  await expect(page.getByTestId('perfume-photo-preview')).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/e2e/admin-perfume-photos.png', fullPage: true });
  await page.getByTestId('publish-perfume').click();
  await expect(page.getByTestId('admin-msg')).toContainText('now in the perfume salon');

  const pub = ((await (await page.request.get('/api/products')).json()).products as { sku: string; id: string; perfume: { liquid: string }; photos: { view: string; cutoutUrl?: string; useCutout: boolean }[] }[]).find((x) => x.sku === sku)!;
  expect(pub.photos.map((p) => p.view)).toEqual(['front', 'angle']);
  expect(pub.photos.every((p) => p.useCutout && p.cutoutUrl)).toBe(true);
  // the juice colour was taken from the photo (maroon), not left at the default
  const [r, g] = pub.perfume.liquid.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  expect(r).toBeGreaterThan(100);
  expect(g).toBeLessThan(60);

  const shop = await page.context().newPage();
  await shop.goto(`/perfumes?p=${pub.id}`);
  await shop.getByTestId('skip-intro').click();
  await expect(shop.getByTestId('perfume-title')).toHaveText('Maroon Velvet Extrait');
  await shop.getByTestId('perfume-discover').click();
  // close-up of the niche with the details beside it; paging stays in the close-up
  await expect(shop.getByTestId('perfume-detail')).toContainText('Maroon Velvet Extrait');
  await shop.getByTestId('detail-next').click();
  await expect(shop.getByTestId('perfume-detail')).not.toContainText('Maroon Velvet Extrait');
  await expect(shop).toHaveURL(/view=details/);
  await shop.waitForTimeout(800);
  await shop.screenshot({ path: 'docs/screenshots/e2e/perfume-photo-inspect.png' });
});

test('salon navigation: drag to browse, Discover, and the browser Back button steps back inside the salon', async ({ page }) => {
  await page.goto('/');
  await page.goto('/perfumes');
  await page.getByTestId('skip-intro').click();
  const first = (await page.getByTestId('perfume-title').textContent())!;
  // mouse drag along the bare wall (not on a bottle, which would turn it) → next perfume
  await page.mouse.move(900, 560);
  await page.mouse.down();
  await page.mouse.move(700, 565, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('perfume-title')).not.toHaveText(first);
  const second = (await page.getByTestId('perfume-title').textContent())!;
  await page.getByTestId('perfume-discover').click();
  await expect(page.getByTestId('perfume-detail')).toBeVisible();
  await expect(page).toHaveURL(/view=details/);
  await page.goBack(); // details → the same perfume in the salon
  await expect(page.getByTestId('perfume-detail')).toBeHidden();
  await expect(page.getByTestId('perfume-title')).toHaveText(second);
  await page.goBack(); // → the perfume before
  await expect(page.getByTestId('perfume-title')).toHaveText(first);
  await expect(page).toHaveURL(/\/perfumes/);
});

const AI_MODEL = 'models/onnx-community/BiRefNet_lite-ONNX/onnx/model_fp16.onnx';
test('admin: a photo on a busy background is cut out by the AI model in the background', async ({ page }) => {
  test.skip(!existsSync(AI_MODEL), 'AI cut-out model not installed (npm run models)');
  test.setTimeout(180_000);
  await adminLogin(page);
  await page.getByTestId('new-product').click();
  await page.getByTestId('pf-garment-perfume').click();
  await page.getByTestId('perfume-photos-input').setInputFiles(['tests/fixtures/perfume-busy.jpg']);
  await page.getByTestId('pf-title').fill('Parquet Test Parfum');
  await page.getByTestId('pf-sku').fill(`PF-AI-${Date.now().toString(36).toUpperCase()}`);
  await page.getByTestId('pf-price').fill('500');
  await page.getByTestId('pf-submit').first().click();
  await expect(page.getByTestId('admin-msg')).toContainText('with AI');
  await expect(page.getByTestId('cutout-working')).toBeVisible();
  // the page refreshes itself; the cut-out replaces the "working" placeholder
  await expect(page.getByTestId('cutout-working')).toHaveCount(0, { timeout: 150_000 });
  const img = page.getByTestId('saved-photo').locator('img').nth(1);
  await expect(img).toHaveAttribute('src', /\/api\/uploads\//);
  const box = await img.evaluate((el: HTMLImageElement) => ({ w: el.naturalWidth, h: el.naturalHeight }));
  expect(box.h).toBeGreaterThan(box.w); // trimmed to the upright bottle, not the whole square-ish photo
});
