import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkPrintProfile, GLB_LIMITS, inspectGlb, suggestTransform, zoneCoverage } from '@/server/glbValidate';
import { TEMPLATE_ZONES } from '@/lib/template';

const fx = (n: string) => new Uint8Array(readFileSync(`tests/fixtures/${n}`));
const codes = (r: { issues: { code: string }[] }) => r.issues.map((i) => i.code);

describe('GLB inspection', () => {
  it('accepts the template shirt and reports its structure', async () => {
    const r = await inspectGlb(fx('valid-shirt.glb'));
    expect(r.ok).toBe(true);
    expect(r.report!.meshes.map((m) => m.name)).toContain('Shirt');
    expect(r.report!.meshes.find((m) => m.name === 'Shirt')!.hasUv).toBe(true);
    expect(r.report!.materials).toContain('Fabric');
    expect(r.report!.triangles).toBeGreaterThan(10000);
  });

  it('template print zones overlap real UV islands of the Shirt mesh (front and back)', async () => {
    const r = await inspectGlb(fx('valid-shirt.glb'));
    const cov = zoneCoverage(r.doc!, ['Shirt'], TEMPLATE_ZONES);
    expect(cov.front).toBeGreaterThan(0.05);
    expect(cov.back).toBeGreaterThan(0.05);
    const issues = checkPrintProfile(r.doc!, r.report!, ['Shirt'], TEMPLATE_ZONES);
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('flags a print zone that covers no UV island', async () => {
    const r = await inspectGlb(fx('valid-shirt.glb'));
    const empty = [{ ...TEMPLATE_ZONES[0], uvRect: { u0: 0.96, v0: 0.0, u1: 0.98, v1: 0.02 } }];
    expect(codes({ issues: checkPrintProfile(r.doc!, r.report!, ['Shirt'], empty) })).toContain('zone_empty');
    expect(codes({ issues: checkPrintProfile(r.doc!, r.report!, ['Nope'], TEMPLATE_ZONES) })).toContain('mesh_missing');
  });

  it('rejects a model without UVs with an actionable message', async () => {
    const r = await inspectGlb(fx('no-uv-shirt.glb'));
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain('no_uvs');
    expect(r.issues.find((i) => i.code === 'no_uvs')!.message).toMatch(/unwrap/i);
  });

  it('rejects non-GLB data, external resources and oversize files without parsing them', async () => {
    expect(codes(await inspectGlb(fx('not-a-model.glb')))).toContain('not_glb');
    expect(codes(await inspectGlb(fx('external-uri.glb')))).toContain('external_resources');
    const big = new Uint8Array(GLB_LIMITS.maxBytes + 10);
    big.set(fx('valid-shirt.glb').subarray(0, 20));
    expect(codes(await inspectGlb(big))).toContain('too_large');
  });

  it('suggests a transform that hangs the model from its top centre at ~0.8 m', async () => {
    const r = await inspectGlb(fx('valid-shirt.glb'));
    const t = suggestTransform(r.report!);
    const h = (r.report!.bbox.max[1] - r.report!.bbox.min[1]) * t.scale;
    expect(h).toBeCloseTo(0.8);
    expect(r.report!.bbox.max[1] * t.scale + t.hangOffset[1]).toBeCloseTo(0);
  });
});
