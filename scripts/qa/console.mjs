import { chromium } from '@playwright/test';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => console.log(`[${m.type()}]`, m.text().slice(0, 400)));
page.on('pageerror', (e) => console.log('[pageerror]', e.message, e.stack?.slice(0, 600)));
page.on('requestfailed', (r) => console.log('[reqfail]', r.url(), r.failure()?.errorText));
await page.goto(process.argv[2] ?? 'http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(6000);
await browser.close();
