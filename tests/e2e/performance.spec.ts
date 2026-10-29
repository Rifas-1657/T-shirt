import { expect, test } from '@playwright/test';
import { sceneInfo, waitForScene } from './helpers';

test('repeated product switching does not leak GPU textures or geometries', async ({ page }) => {
  await page.goto('/');
  await waitForScene(page);
  const skus = ['ATL-CRW-CHK', 'ATL-CRW-ONX', 'ATL-CRW-SGE', 'ATL-CRW-CLY'];
  const open = async (sku: string, customise: boolean) => {
    await page.getByTestId(`product-${sku}`).click();
    if (customise) {
      await page.getByTestId('customize-btn').click();
      await page.getByTestId('add-text').click();
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  };
  // warm-up round so caches (models, shader programs) are populated
  for (const s of skus) await open(s, true);
  await page.waitForTimeout(1000);
  const before = await sceneInfo(page);
  for (let round = 0; round < 3; round++) for (const s of skus) await open(s, true);
  await page.waitForTimeout(1500);
  const after = await sceneInfo(page);
  test.info().annotations.push({ type: 'gpu-memory', description: `before ${JSON.stringify(before.memory)} after ${JSON.stringify(after.memory)}` });
  expect(after.memory.textures).toBeLessThanOrEqual(before.memory.textures + 1);
  expect(after.memory.geometries).toBeLessThanOrEqual(before.memory.geometries + 1);
});

test('initial load size and frame rate (desktop)', async ({ page }) => {
  const t0 = Date.now();
  let bytes = 0;
  page.on('response', async (r) => {
    const len = Number(r.headers()['content-length'] ?? 0);
    bytes += len;
  });
  await page.goto('/');
  await waitForScene(page);
  const loadMs = Date.now() - t0;
  const fps = await page.evaluate(
    () => new Promise<number>((res) => {
      let n = 0;
      const t = performance.now();
      const f = () => (++n, performance.now() - t < 2000 ? requestAnimationFrame(f) : res(n / 2));
      requestAnimationFrame(f);
    }),
  );
  test.info().annotations.push({ type: 'perf', description: `scene ready ${loadMs} ms, ~${(bytes / 1048576).toFixed(1)} MB transferred (content-length), ${fps.toFixed(0)} fps` });
  expect(fps).toBeGreaterThan(20);
});

test.describe('mobile viewport', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  test('collection, detail and editor are usable on a phone', async ({ page }) => {
    await page.goto('/');
    await waitForScene(page);
    await page.screenshot({ path: 'docs/screenshots/e2e/mobile-collection.png' });
    await page.getByTestId('product-ATL-CRW-INK').click();
    await expect(page.getByTestId('detail-panel')).toBeVisible();
    await page.getByTestId('customize-btn').click();
    await page.getByTestId('add-text').click();
    await expect(page.getByTestId('layer-list').locator('li')).toHaveCount(1);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'docs/screenshots/e2e/mobile-customize.png' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
});

test('reduced motion is honoured (no animated transitions)', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await waitForScene(page);
  await page.getByTestId('product-ATL-CRW-CLY').click();
  // with reduced motion the camera snaps; one short wait is enough for the view to settle
  await page.waitForTimeout(300);
  await expect(page.getByTestId('detail-title')).toHaveText('Clay Crew Tee');
  await ctx.close();
});
