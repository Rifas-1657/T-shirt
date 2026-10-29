// Storage helpers for validated uploads and generated previews.
import { promises as fs } from 'node:fs';
import { atomicWrite, newId, PATHS, safeJoin } from './storage';

interface StoredMeta {
  contentType: string;
  width?: number;
  height?: number;
  owner: 'customer' | 'admin';
  createdAt: string;
}

const ID = /^[a-zA-Z0-9_-]{8,64}$/;

export async function storeUpload(data: Buffer, meta: Omit<StoredMeta, 'createdAt'>): Promise<string> {
  const id = newId();
  await atomicWrite(safeJoin(PATHS.uploads, `${id}.bin`), data);
  await atomicWrite(safeJoin(PATHS.uploads, `${id}.json`), JSON.stringify({ ...meta, createdAt: new Date().toISOString() }));
  return id;
}

export async function readUpload(id: string): Promise<{ data: Buffer; meta: StoredMeta } | null> {
  if (!ID.test(id)) return null;
  try {
    const meta = JSON.parse(await fs.readFile(safeJoin(PATHS.uploads, `${id}.json`), 'utf8')) as StoredMeta;
    return { data: await fs.readFile(safeJoin(PATHS.uploads, `${id}.bin`)), meta };
  } catch {
    return null;
  }
}

/** Decodes a PNG data URL produced by canvas.toDataURL and stores it as a preview. */
export async function storePreviewDataUrl(dataUrl: unknown): Promise<string | null> {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) return null;
  const buf = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
  if (buf.length < 100 || buf.length > 4 * 1024 * 1024) return null;
  if (!buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return null;
  const id = newId();
  await atomicWrite(safeJoin(PATHS.previews, `${id}.png`), buf);
  return id;
}

export async function readPreview(id: string): Promise<Buffer | null> {
  if (!ID.test(id)) return null;
  try {
    return await fs.readFile(safeJoin(PATHS.previews, `${id}.png`));
  } catch {
    return null;
  }
}

const hits = new Map<string, number[]>();
/** Small in-memory sliding-window limiter for public write endpoints. */
export function rateLimited(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > max;
}

export function clientKey(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
}
