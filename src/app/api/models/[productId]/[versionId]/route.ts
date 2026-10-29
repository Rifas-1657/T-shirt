// Serves uploaded-model derivatives. Public only for the live version of an active product;
// admins can also load validated drafts for preview. Originals are never served.
import { promises as fs } from 'node:fs';
import { isAdmin } from '@/server/auth';
import { PATHS, readProducts, safeJoin } from '@/server/storage';

export async function GET(_req: Request, { params }: { params: Promise<{ productId: string; versionId: string }> }) {
  const { productId, versionId } = await params;
  const product = (await readProducts()).find((p) => p.id === productId);
  const version = product?.versions.find((v) => v.id === versionId);
  if (!product || !version) return new Response('Not found', { status: 404 });
  const isLive = product.active && product.liveVersionId === versionId && version.status === 'published';
  if (!isLive && !(await isAdmin())) return new Response('Not found', { status: 404 });
  try {
    const buf = await fs.readFile(safeJoin(PATHS.models, productId, `${versionId}.glb`));
    return new Response(new Uint8Array(buf), {
      headers: { 'Content-Type': 'model/gltf-binary', 'Cache-Control': isLive ? 'public, max-age=3600' : 'private, no-store' },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
