import nextVitals from 'eslint-config-next/core-web-vitals';

const config = [
  ...nextVitals,
  { ignores: ['.next/**', 'node_modules/**', 'data/**', 'data-e2e/**', 'assets/**', 'playwright-report/**', 'test-results/**'] },
  {
    // React Three Fiber's documented pattern is to mutate three.js objects (camera, materials,
    // textures) imperatively inside useFrame/effects, which the React Compiler immutability rule
    // cannot model. Scoped to the 3D components only.
    files: ['src/components/three/**', 'src/components/admin/AdminPreview.tsx'],
    rules: { 'react-hooks/immutability': 'off' },
  },
];

export default config;
