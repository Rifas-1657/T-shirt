// Visual QA of the admin: signs in with ADMIN_PASSWORD from .env.local (never printed), opens
// "New product", picks a category and screenshots the form. Usage: node scripts/qa/admin-shots.mjs <prefix> [photo...]
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const [prefix = 'scripts/qa/out/admin', ...photos] = process.argv.slice(2);
const pw = readFileSync('.env.local', 'utf8').match(/^ADMIN_PASSWORD=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto('http://localhost:3000/admin');
await page.fill('input[type=password]', pw ?? '');
await page.keyboard.press('Enter');
await page.click('[data-testid=new-product]');
await page.waitForTimeout(800);
await page.screenshot({ path: `${prefix}-new.png`, fullPage: true });
await page.click('[data-testid=pf-garment-perfume]');
if (photos.length) await page.setInputFiles('[data-testid=perfume-photos-input]', photos);
await page.fill('[data-testid=pf-title]', 'Rose Royale Eau de Parfum');
await page.waitForTimeout(800);
await page.screenshot({ path: `${prefix}-perfume.png`, fullPage: true });
await browser.close();
