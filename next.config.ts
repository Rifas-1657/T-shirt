import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // a stray lockfile in the user's home directory must not become the workspace root
  turbopack: { root: path.resolve('.') },
  // sharp, gltf-transform and the AI cut-out (onnxruntime) run only in route handlers (Node runtime)
  serverExternalPackages: ['sharp', '@gltf-transform/core', '@gltf-transform/functions', '@gltf-transform/extensions', 'meshoptimizer', '@huggingface/transformers', 'onnxruntime-node'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      { source: '/models/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }] },
    ];
  },
};

export default nextConfig;
