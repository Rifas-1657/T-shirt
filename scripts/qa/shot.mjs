// Visual QA helper: node scripts/qa/shot.mjs <out.png> [url] [w] [h] [actions-json]
// actions: [{"fill":[sel,text]}|{"focus":sel}|{"click":"selector"}|{"hover":[x,y]}|{"wait":ms}|{"eval":"js"}|{"key":"Escape"}|{"shot":"file.png"}]
import { chromium } from '@playwright/test';
const [out, url = 'http://localhost:3000/', w = '1440', h = '900', actions = '[]'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__atelier, null, { timeout: 60000 }).catch(() => logs.push('no __atelier'));
await page.waitForTimeout(3500);
for (const a of JSON.parse(actions)) {
  if (a.click) await page.click(a.click);
  if (a.hover) await page.mouse.move(a.hover[0], a.hover[1]);
  if (a.wait) await page.waitForTimeout(a.wait);
  if (a.eval) console.log('eval:', JSON.stringify(await page.evaluate(a.eval)));
  if (a.key) await page.keyboard.press(a.key);
  if (a.fill) await page.fill(a.fill[0], a.fill[1]);
  if (a.focus) await page.focus(a.focus);
  if (a.shot) await page.screenshot({ path: a.shot });
}
await page.screenshot({ path: out });
console.log('renderer:', JSON.stringify(await page.evaluate(() => { const c = document.querySelector('canvas'); const gl = c?.getContext('webgl2'); const d = gl?.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'n/a'; })));
console.log(logs.slice(0, 20).join('\n'));
await browser.close();
