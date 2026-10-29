import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { sanitizeSvg, sniffKind, validateImage } from '@/server/uploadValidate';
import { toPublic } from '@/server/storage';
import { templateModelConfig } from '@/lib/template';
import type { Product } from '@/lib/types';

describe('image upload validation', () => {
  it('sniffs the real type, not the extension', () => {
    expect(sniffKind(readFileSync('tests/fixtures/logo-arrow.png'))).toBe('png');
    expect(sniffKind(Buffer.from('GIF89a....'))).toBeNull();
    expect(sniffKind(Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe('svg');
  });

  it('accepts a valid PNG and reports its size', async () => {
    const r = await validateImage(readFileSync('tests/fixtures/logo-arrow.png'));
    expect(r.ok).toBe(true);
    expect([r.width, r.height]).toEqual([320, 160]);
  });

  it('rejects images over the pixel limit', async () => {
    const r = await validateImage(readFileSync('tests/fixtures/huge-dimensions.png'));
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/maximum/);
  });

  it('sanitises SVG: scripts, event handlers and foreignObject are removed', async () => {
    const r = await validateImage(readFileSync('tests/fixtures/evil.svg'));
    expect(r.ok).toBe(true);
    const out = r.data!.toString('utf8');
    expect(out).not.toMatch(/script|onload|foreignObject|iframe/i);
    expect(out).toMatch(/<circle/);
    expect(sanitizeSvg('<svg><a href="javascript:alert(1)"><rect/></a><use href="https://x/y.svg#a"/></svg>')).not.toMatch(/javascript|href/);
  });

  it('rejects unknown file types', async () => {
    expect((await validateImage(Buffer.from('hello world'))).ok).toBe(false);
  });
});

describe('public catalogue projection', () => {
  const base: Product = {
    id: 'p1', sku: 'S1', title: 'T', description: '', category: 'c', garment: 'half-sleeve', price: 1, currency: 'USD', active: true, sizes: ['M'],
    colors: [{ name: 'a', hex: '#000000' }], liveVersionId: 'v1', createdAt: '', updatedAt: '',
    versions: [{ id: 'v1', createdAt: '', status: 'published', pathway: 'glb', modelConfig: templateModelConfig(), issues: [], originalKey: 'p1/v1.glb' }],
  };
  it('exposes only the live version and never private keys', () => {
    const p = toPublic(base)!;
    expect(p.version.id).toBe('v1');
    expect(JSON.stringify(p)).not.toMatch(/originalKey|p1\/v1\.glb|issues/);
  });
  it('hides inactive, unpublished and non-published-status products', () => {
    expect(toPublic({ ...base, active: false })).toBeNull();
    expect(toPublic({ ...base, liveVersionId: null })).toBeNull();
    expect(toPublic({ ...base, versions: [{ ...base.versions[0], status: 'validated' }] })).toBeNull();
  });
});

describe('admin session tokens', () => {
  beforeAll(() => {
    process.env.ADMIN_SESSION_SECRET = 'x'.repeat(64);
    process.env.ADMIN_PASSWORD = 'correct horse battery staple';
  });
  it('verifies its own tokens, rejects tampered or expired ones', async () => {
    const { createSessionToken, verifySessionToken, checkPassword } = await import('@/server/auth');
    const t = createSessionToken();
    expect(verifySessionToken(t)).toBe(true);
    expect(verifySessionToken(t.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')))).toBe(false);
    expect(verifySessionToken(createSessionToken(Date.now() - 9 * 3600_000))).toBe(false);
    expect(verifySessionToken(undefined)).toBe(false);
    expect(checkPassword('correct horse battery staple')).toBe(true);
    expect(checkPassword('wrong')).toBe(false);
  });
});
