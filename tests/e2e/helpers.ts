import { expect, type Page } from '@playwright/test';

type AtelierDebug = {
  info: () => { memory: { geometries: number; textures: number }; render: { frame: number; calls: number; triangles: number } };
};

/** Waits until the WebGL scene exists and is actively rendering frames. */
export async function waitForScene(page: Page) {
  await page.waitForFunction(() => (window as unknown as { __atelier?: unknown }).__atelier, null, { timeout: 60_000 });
  const f0 = await page.evaluate(() => (window as unknown as { __atelier: AtelierDebug }).__atelier.info().render.frame);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __atelier: AtelierDebug }).__atelier.info().render.frame), { timeout: 30_000 }).toBeGreaterThan(f0 + 10);
  // let models stream in
  await page.waitForFunction(() => (window as unknown as { __atelier: AtelierDebug }).__atelier.info().render.triangles > 100_000, null, { timeout: 60_000 });
}

export function sceneInfo(page: Page) {
  return page.evaluate(() => (window as unknown as { __atelier: AtelierDebug }).__atelier.info());
}

export async function adminLogin(page: Page) {
  await page.goto('/admin');
  await page.getByTestId('admin-password').fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByTestId('admin-login').click();
  await expect(page.getByTestId('new-product')).toBeVisible();
}
