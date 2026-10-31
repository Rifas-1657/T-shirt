// Visual QA of the perfume salon: intro frames, gallery, next, inspect.
import { chromium } from '@playwright/test';
const [url = 'http://localhost:3000/perfumes', w = '1440', h = '900', prefix = 'scripts/qa/pf'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && logs.push(`[${m.type()}] ${m.text().slice(0, 200)}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'domcontentloaded' });
for (const [t, name] of [[700, 'intro1'], [1900, 'intro2'], [2900, 'intro3']]) {
  await page.waitForTimeout(t === 700 ? 700 : t === 1900 ? 1200 : 1000);
  await page.screenshot({ path: `${prefix}-${name}.png` });
}
await page.waitForTimeout(4500);
await page.screenshot({ path: `${prefix}-gallery.png` });
await page.click('[data-testid=perfume-next]');
await page.waitForTimeout(2200);
await page.screenshot({ path: `${prefix}-next.png` });
await page.click('[data-testid=perfume-discover]');
await page.waitForTimeout(2600);
await page.screenshot({ path: `${prefix}-inspect.png` });
console.log(logs.filter((l) => !/THREE\.Clock|PCFSoft/.test(l)).slice(0, 15).join('\n') || 'no errors');
await browser.close();
