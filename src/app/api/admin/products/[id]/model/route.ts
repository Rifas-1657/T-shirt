// GLB pathway upload: multipart form with "file" (.glb) and optional "profile" (JSON).
import { NextResponse } from 'next/server';
import { adminRoute } from '@/server/adminRoute';
import { addGlbVersion, AdminError } from '@/server/catalogAdmin';
import { GLB_LIMITS } from '@/server/glbValidate';

export const POST = adminRoute<{ id: string }>(async (req, { id }) => {
  if (Number(req.headers.get('content-length') ?? 0) > GLB_LIMITS.maxBytes + 1024 * 1024)
    throw new AdminError(413, [`File too large; the limit is ${GLB_LIMITS.maxBytes / 1048576} MB.`]);
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new AdminError(400, ['No GLB file uploaded.']);
  if (!/\.glb$/i.test(file.name)) throw new AdminError(422, ['Only .glb files are accepted (binary glTF with embedded textures).']);
  let profile = {};
  const raw = form.get('profile');
  if (typeof raw === 'string' && raw.trim()) {
    try {
      profile = JSON.parse(raw);
    } catch {
      throw new AdminError(422, ['Print profile is not valid JSON.']);
    }
  }
  const version = await addGlbVersion(id, new Uint8Array(await file.arrayBuffer()), profile);
  const { originalKey: _k, ...safe } = version;
  return NextResponse.json({ version: safe }, { status: version.status === 'failed' ? 422 : 201 });
});
