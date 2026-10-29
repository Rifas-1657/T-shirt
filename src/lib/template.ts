// Configuration of the Blender-built T-shirt template (scripts/blender/build_tshirt_template.py).
// The numbers below are derived from that script's constants, not guessed:
//   PRINT_SPAN = 0.80 m per half atlas, Z0 = -0.04 m, front u = 0.5*(x/0.8 + 0.5), back mirrored.
// Front chest zone: x in [-0.15, 0.15] m, z in [0.17, 0.57] m  -> 30 x 40 cm
// Back zone:        x in [-0.15, 0.15] m, z in [0.16, 0.61] m  -> 30 x 45 cm
import type { ModelConfig, PrintZone } from './types';

const SPAN = 0.8;
const Z0 = -0.04;
const u = (x: number) => 0.5 * (x / SPAN + 0.5);
const v = (z: number) => (z - Z0) / SPAN;

export const TEMPLATE_MODEL_URL = '/models/tshirt-template-v1.glb';

export const TEMPLATE_ZONES: PrintZone[] = [
  { id: 'front', label: 'Front', widthCm: 30, heightCm: 40, uvRect: { u0: u(-0.15), v0: v(0.17), u1: u(0.15), v1: v(0.57) } },
  { id: 'back', label: 'Back', widthCm: 30, heightCm: 45, uvRect: { u0: 0.5 + u(-0.15), v0: v(0.16), u1: 0.5 + u(0.15), v1: v(0.61) } },
];

export function templateModelConfig(): ModelConfig {
  return {
    modelUrl: TEMPLATE_MODEL_URL,
    source: 'template',
    printableMeshes: ['Shirt'],
    colorableMaterials: ['Fabric'],
    printZones: TEMPLATE_ZONES,
    scale: 1,
    hangOffset: [0, 0, 0],
    rotationY: 0,
    centerDrop: 0.42,
    mappingVerified: true, // verified in tests/e2e/mapping.spec.ts + docs/TEST_REPORT.md
    atlasSize: [2048, 1024],
  };
}
