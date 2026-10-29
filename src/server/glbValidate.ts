// Server-side inspection/validation of admin-uploaded GLB files and creation of web derivatives.
import { NodeIO, type Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, getBounds, prune, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { isValidUvRect } from '@/lib/printZones';
import type { ModelReport, PrintZone, ValidationIssue } from '@/lib/types';

export const GLB_LIMITS = {
  maxBytes: 60 * 1024 * 1024,
  maxTriangles: 2_000_000,
  maxTextureSize: 8192,
  derivativeTextureSize: 2048,
};

/** Extensions the customer viewer (three.js GLTFLoader + meshopt decoder) can actually render. */
const SUPPORTED_REQUIRED = new Set([
  'KHR_materials_unlit',
  'KHR_texture_transform',
  'KHR_mesh_quantization',
  'EXT_meshopt_compression',
  'EXT_texture_webp',
  'KHR_materials_emissive_strength',
]);

async function createIO(): Promise<NodeIO> {
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
}

export interface GlbCheckResult {
  ok: boolean;
  issues: ValidationIssue[];
  report?: ModelReport;
  doc?: Document;
}

const err = (code: string, message: string): ValidationIssue => ({ level: 'error', code, message });
const warn = (code: string, message: string): ValidationIssue => ({ level: 'warning', code, message });

/** Structural checks on the raw container before handing it to the parser. */
function checkContainer(bytes: Uint8Array): { issues: ValidationIssue[]; json?: Record<string, unknown> } {
  const issues: ValidationIssue[] = [];
  if (bytes.byteLength > GLB_LIMITS.maxBytes)
    issues.push(err('too_large', `File is ${(bytes.byteLength / 1048576).toFixed(1)} MB; the limit is ${GLB_LIMITS.maxBytes / 1048576} MB. Reduce texture sizes or compress geometry.`));
  if (bytes.byteLength < 20) return { issues: [...issues, err('not_glb', 'File is too small to be a GLB.')] };
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) return { issues: [...issues, err('not_glb', 'Not a binary glTF (.glb) file: missing "glTF" header. Export as glTF Binary (.glb).')] };
  if (dv.getUint32(4, true) !== 2) issues.push(err('gltf_version', `glTF version ${dv.getUint32(4, true)} is not supported; export glTF 2.0.`));
  const len = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== 0x4e4f534a || 20 + len > bytes.byteLength)
    return { issues: [...issues, err('corrupt', 'GLB JSON chunk is missing or truncated.')] };
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + len)));
  } catch {
    return { issues: [...issues, err('corrupt', 'GLB JSON chunk is not valid JSON.')] };
  }
  const required = (json.extensionsRequired as string[] | undefined) ?? [];
  for (const ext of required) {
    if (ext === 'KHR_draco_mesh_compression')
      issues.push(err('draco_unsupported', 'Draco-compressed geometry is not accepted. Re-export without Draco (or with EXT_meshopt_compression).'));
    else if (!SUPPORTED_REQUIRED.has(ext)) issues.push(err('extension_unsupported', `Required extension ${ext} is not supported by the viewer.`));
  }
  const external = [
    ...(((json.buffers as { uri?: string }[]) ?? []).filter((b) => b.uri)),
    ...(((json.images as { uri?: string }[]) ?? []).filter((i) => i.uri)),
  ];
  if (external.length)
    issues.push(err('external_resources', 'The GLB references external files (buffers/images by URI). Export with all resources embedded.'));
  return { issues, json };
}

export async function inspectGlb(bytes: Uint8Array): Promise<GlbCheckResult> {
  const pre = checkContainer(bytes);
  if (pre.issues.some((i) => i.level === 'error')) return { ok: false, issues: pre.issues };
  const issues = [...pre.issues];
  let doc: Document;
  try {
    doc = await (await createIO()).readBinary(bytes);
  } catch (e) {
    return { ok: false, issues: [...issues, err('parse_failed', `The GLB could not be parsed: ${(e as Error).message}`)] };
  }
  const root = doc.getRoot();
  const meshes: ModelReport['meshes'] = [];
  let triangles = 0;
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    let tris = 0;
    let hasUv = false;
    let material: string | null = null;
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const pos = prim.getAttribute('POSITION');
      if (prim.getMode() === 4) tris += (idx ? idx.getCount() : (pos?.getCount() ?? 0)) / 3;
      if (prim.getAttribute('TEXCOORD_0')) hasUv = true;
      material ??= prim.getMaterial()?.getName() ?? null;
    }
    triangles += tris;
    meshes.push({ name: node.getName() || mesh.getName() || '(unnamed)', triangles: Math.round(tris), hasUv, material });
  }
  const textures = root.listTextures().map((t) => {
    const size = t.getSize();
    return { name: t.getName() || t.getURI() || '(embedded)', mimeType: t.getMimeType(), width: size?.[0] ?? 0, height: size?.[1] ?? 0 };
  });
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const bounds = scene ? getBounds(scene) : { min: [0, 0, 0], max: [0, 0, 0] };
  const report: ModelReport = {
    bytes: bytes.byteLength,
    meshes,
    materials: root.listMaterials().map((m) => m.getName()),
    textures,
    triangles: Math.round(triangles),
    bbox: { min: bounds.min as [number, number, number], max: bounds.max as [number, number, number] },
    extensionsRequired: ((pre.json?.extensionsRequired as string[]) ?? []).slice(),
  };
  if (!meshes.length) issues.push(err('no_meshes', 'The file contains no meshes.'));
  if (triangles > GLB_LIMITS.maxTriangles)
    issues.push(err('too_many_triangles', `${Math.round(triangles).toLocaleString()} triangles exceeds ${GLB_LIMITS.maxTriangles.toLocaleString()}. Decimate the model in Blender.`));
  if (meshes.length && !meshes.some((m) => m.hasUv))
    issues.push(err('no_uvs', 'No mesh has a UV map (TEXCOORD_0). Printing needs UVs: unwrap the garment in Blender and give the front and back panels their own non-overlapping UV areas.'));
  for (const t of textures)
    if (t.width > GLB_LIMITS.maxTextureSize || t.height > GLB_LIMITS.maxTextureSize)
      issues.push(err('texture_too_large', `Texture ${t.name} is ${t.width}x${t.height}; the maximum is ${GLB_LIMITS.maxTextureSize}.`));
  const size = report.bbox.max.map((v, i) => v - report.bbox.min[i]);
  if (Math.max(...size) > 50 || Math.max(...size) < 0.01)
    issues.push(warn('unusual_scale', `Model size ${size.map((s) => s.toFixed(3)).join(' x ')} units looks unusual; check the export units. The preview scale was normalised.`));
  return { ok: !issues.some((i) => i.level === 'error'), issues, report, doc };
}

/** Fraction of the printable meshes' triangles whose UV centroid falls inside each zone. */
export function zoneCoverage(doc: Document, printableMeshes: string[], zones: PrintZone[]): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(zones.map((z) => [z.id, 0]));
  let total = 0;
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || !printableMeshes.includes(node.getName() || mesh.getName())) continue;
    for (const prim of mesh.listPrimitives()) {
      const uv = prim.getAttribute('TEXCOORD_0');
      if (!uv) continue;
      const idx = prim.getIndices();
      const n = idx ? idx.getCount() : uv.getCount();
      const a: number[] = [0, 0];
      const b: number[] = [0, 0];
      const c: number[] = [0, 0];
      for (let t = 0; t + 2 < n; t += 3) {
        const i0 = idx ? idx.getScalar(t) : t;
        uv.getElement(i0, a);
        uv.getElement(idx ? idx.getScalar(t + 1) : t + 1, b);
        uv.getElement(idx ? idx.getScalar(t + 2) : t + 2, c);
        const u = (a[0] + b[0] + c[0]) / 3;
        // glTF UV origin is top-left; convert to the bottom-left convention used by print zones
        const v = 1 - (a[1] + b[1] + c[1]) / 3;
        total++;
        for (const z of zones) if (u >= z.uvRect.u0 && u <= z.uvRect.u1 && v >= z.uvRect.v0 && v <= z.uvRect.v1) counts[z.id]++;
      }
    }
  }
  return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, total ? v / total : 0]));
}

/** Validates the admin's customisation profile against the actual model. */
export function checkPrintProfile(
  doc: Document,
  report: ModelReport,
  printableMeshes: string[],
  zones: PrintZone[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!printableMeshes.length) return [warn('no_print_profile', 'No printable meshes selected: the product can be shown but customisation stays disabled.')];
  for (const name of printableMeshes) {
    const m = report.meshes.find((x) => x.name === name);
    if (!m) issues.push(err('mesh_missing', `Printable mesh "${name}" does not exist in the model.`));
    else if (!m.hasUv) issues.push(err('mesh_no_uv', `Printable mesh "${name}" has no UV map.`));
  }
  if (!zones.length) issues.push(err('no_zones', 'Define at least one print zone (front/back) to enable customisation.'));
  for (const z of zones) if (!isValidUvRect(z.uvRect)) issues.push(err('zone_invalid', `Print zone ${z.id} has an invalid UV rectangle (values must be 0-1 with u1>u0, v1>v0).`));
  if (issues.some((i) => i.level === 'error')) return issues;
  const cov = zoneCoverage(doc, printableMeshes, zones);
  for (const z of zones)
    if (cov[z.id] === 0) issues.push(err('zone_empty', `Print zone ${z.id} does not overlap any UV island of the printable meshes. Artwork there would never appear.`));
    else issues.push({ level: 'info', code: 'zone_coverage', message: `Print zone ${z.id} covers ${(cov[z.id] * 100).toFixed(1)}% of printable triangles.` });
  issues.push(warn('mapping_unverified', 'Run the FRONT LEFT / BACK CENTER mapping test in the preview and confirm it before enabling customisation.'));
  return issues;
}

/** Web derivative: dedup, prune, WebP textures capped at 2048. The original is left untouched. */
export async function buildDerivative(doc: Document): Promise<Uint8Array> {
  await doc.transform(
    dedup(),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [GLB_LIMITS.derivativeTextureSize, GLB_LIMITS.derivativeTextureSize] }),
  );
  return (await createIO()).writeBinary(doc);
}

/** Suggested display transform: ~0.8 m garment height, top-centre (hang point) at the origin. */
export function suggestTransform(report: ModelReport) {
  const { min, max } = report.bbox;
  const height = max[1] - min[1] || 1;
  const scale = 0.8 / height;
  const cx = (min[0] + max[0]) / 2;
  const cz = (min[2] + max[2]) / 2;
  return {
    scale,
    hangOffset: [-cx * scale, -max[1] * scale, -cz * scale] as [number, number, number],
    centerDrop: 0.4,
  };
}
