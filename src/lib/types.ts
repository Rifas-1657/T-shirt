// Shared domain types for the catalogue, garment models and customer designs.

export type ZoneId = 'front' | 'back';

/** Which rack a product hangs on and which garment template it uses. */
export type GarmentCategory = 'half-sleeve' | 'full-sleeve' | 'oversized' | 'hoodie';
export const GARMENT_CATEGORIES: GarmentCategory[] = ['half-sleeve', 'full-sleeve', 'oversized', 'hoodie'];

/** Rectangle in the garment's UV0 space (v grows upward, as in glTF UVs after flipY handling). */
export interface UvRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface PrintZone {
  id: ZoneId;
  label: string;
  uvRect: UvRect;
  /** Physical print size, used for the editor aspect ratio and print-file DPI. */
  widthCm: number;
  heightCm: number;
}

export interface ModelConfig {
  /** Public URL of the web derivative the customer viewer loads. */
  modelUrl: string;
  /** 'template' = shared, labelled garment template; 'upload' = admin-uploaded GLB. */
  source: 'template' | 'upload';
  /** Mesh names that receive the print overlay. */
  printableMeshes: string[];
  /** Material names that receive the selected base colour. */
  colorableMaterials: string[];
  printZones: PrintZone[];
  /** Uniform scale applied so the garment reads at real size (metres). */
  scale: number;
  /** Offset so that the model origin sits on the rail (hook point), in model units after scale. */
  hangOffset: [number, number, number];
  /** Y rotation (radians) that makes the garment front face +Z. */
  rotationY: number;
  /** Height of the garment centre below the hang point, metres (camera target). */
  centerDrop: number;
  /** Set only after an admin confirms the asymmetric FRONT LEFT / BACK CENTER mapping test. */
  mappingVerified: boolean;
  /** Atlas texture size (2:1) used for the print overlay. */
  atlasSize: [number, number];
}

export interface ProductColor {
  name: string;
  hex: string;
}

export type VersionStatus = 'validating' | 'failed' | 'validated' | 'published' | 'archived';

export interface ValidationIssue {
  level: 'error' | 'warning' | 'info';
  code: string;
  message: string;
}

export interface ModelReport {
  bytes: number;
  meshes: { name: string; triangles: number; hasUv: boolean; material: string | null }[];
  materials: string[];
  textures: { name: string; mimeType: string; width: number; height: number }[];
  triangles: number;
  bbox: { min: [number, number, number]; max: [number, number, number] };
  extensionsRequired: string[];
}

export interface ProductVersion {
  id: string;
  createdAt: string;
  status: VersionStatus;
  pathway: 'glb' | 'template-images';
  modelConfig: ModelConfig;
  /** Template-based versions: which garment template the artwork is mapped onto. */
  templateId?: GarmentCategory;
  /** Legacy (v1) base artwork: contain-fitted into each zone. */
  baseArtwork?: Partial<Record<ZoneId, string>>;
  /** Base artwork placed by the admin (image-only pathway); drawn under customer layers. */
  baseLayers?: Partial<Record<ZoneId, Layer[]>>;
  /** Image-only pathway: the original uploaded photos/artwork (for reference in the admin). */
  sourceImages?: Partial<Record<ZoneId, string>>;
  /** Image-only pathway: the admin confirmed the artwork placement in the 3D preview. */
  artworkApproved?: boolean;
  issues: ValidationIssue[];
  report?: ModelReport;
  previewUrl?: string;
  derivativeBytes?: number;
  /** Private storage key of the uploaded original (never served publicly). */
  originalKey?: string;
}

export interface Product {
  id: string;
  sku: string;
  title: string;
  description: string;
  category: string;
  /** Rack/template assignment. Set by the admin (auto-suggested from the product text). */
  garment: GarmentCategory;
  price: number;
  currency: string;
  active: boolean;
  sizes: string[];
  colors: ProductColor[];
  stock?: Record<string, number>;
  liveVersionId: string | null;
  versions: ProductVersion[];
  createdAt: string;
  updatedAt: string;
}

/** What the public catalogue exposes: only the live version, never private keys or drafts. */
export interface PublicProduct {
  id: string;
  sku: string;
  title: string;
  description: string;
  category: string;
  garment: GarmentCategory;
  price: number;
  currency: string;
  sizes: string[];
  colors: ProductColor[];
  stock?: Record<string, number>;
  version: {
    id: string;
    pathway: ProductVersion['pathway'];
    modelConfig: ModelConfig;
    baseArtwork?: ProductVersion['baseArtwork'];
    baseLayers?: ProductVersion['baseLayers'];
    previewUrl?: string;
  };
}

// ------------------------------------------------------------------ designs

export interface LayerBase {
  id: string;
  /** Centre position, normalised to the zone (0..1 across width, 0..1 down the height). */
  x: number;
  y: number;
  /** Degrees, clockwise as in the editor. */
  rotation: number;
  /** Uniform scale multiplier on the base size. */
  scale: number;
  opacity: number;
}

export interface ImageLayer extends LayerBase {
  type: 'image';
  /** Server URL of a validated upload (/api/uploads/<id>). */
  src: string;
  /** Base width as a fraction of the zone width (before scale). */
  width: number;
  /** Natural aspect ratio height/width of the source image. */
  aspect: number;
  name: string;
}

export interface TextLayer extends LayerBase {
  type: 'text';
  text: string;
  font: FontKey;
  /** Font size as a fraction of the zone height (before scale). */
  fontSize: number;
  fill: string;
  weight: 400 | 600 | 700;
  letterSpacing: number;
}

export type Layer = ImageLayer | TextLayer;

export type FontKey = 'serif' | 'sans' | 'mono';

export const DESIGN_SCHEMA_VERSION = 1;

export interface Design {
  schemaVersion: number;
  productId: string;
  productVersionId: string;
  /** Template/model identifier the transforms were authored against. */
  modelUrl: string;
  textureConfigVersion: number;
  color: ProductColor;
  size: string;
  zones: Record<ZoneId, Layer[]>;
  createdAt?: string;
}

export interface SavedDesign extends Design {
  id: string;
  previewUrl?: string;
  createdAt: string;
}
