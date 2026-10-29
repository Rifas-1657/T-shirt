'use client';
// One garment instance: clones the product GLB with per-instance materials (never mutating the
// cached originals), tints the colourable materials, and adds a print overlay that samples the
// design atlas through the model's own UV0. Disposes everything it created on unmount.
import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { renderAtlas, referencedImages } from '@/lib/atlasRenderer';
import { getFontFamilies, loadedImages, loadImage } from '@/lib/clientAssets';
import type { Layer, ModelConfig, ZoneId } from '@/lib/types';

export interface GarmentProps {
  config: ModelConfig;
  colorHex: string;
  zones?: Partial<Record<ZoneId, Layer[]>>;
  baseArtwork?: Partial<Record<ZoneId, string>>;
  /** Atlas resolution multiplier: 1 = config.atlasSize, 0.5 for rail thumbnails. */
  atlasScale?: number;
  onAtlas?: (canvas: HTMLCanvasElement | null) => void;
}

function useAtlas(config: ModelConfig, zones: GarmentProps['zones'], baseArtwork: GarmentProps['baseArtwork'], scale: number) {
  const hasArt = !!baseArtwork?.front || !!baseArtwork?.back || Object.values(zones ?? {}).some((l) => l && l.length);
  const [w, h] = config.atlasSize.map((n) => Math.round(n * scale));
  const atlas = useMemo(() => {
    if (!hasArt || typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const texture = new THREE.CanvasTexture(canvas);
    texture.flipY = false; // glTF UV convention (see lib/printZones.ts)
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    return { canvas, texture, ctx: canvas.getContext('2d')! };
  }, [hasArt, w, h]);
  useEffect(() => () => atlas?.texture.dispose(), [atlas]);

  // bump when images/fonts finish loading so the atlas redraws
  const [assetTick, setAssetTick] = useState(0);
  useEffect(() => {
    const srcs = [...referencedImages(zones ?? {}), ...Object.values(baseArtwork ?? {}).filter(Boolean)] as string[];
    let alive = true;
    const missing = srcs.filter((s) => !loadedImages().has(s));
    if (missing.length)
      Promise.allSettled(missing.map(loadImage)).then(() => alive && setAssetTick((t) => t + 1));
    return () => {
      alive = false;
    };
  }, [zones, baseArtwork]);
  useEffect(() => {
    const onFonts = () => setAssetTick((t) => t + 1);
    document.fonts?.addEventListener?.('loadingdone', onFonts);
    return () => document.fonts?.removeEventListener?.('loadingdone', onFonts);
  }, []);

  useEffect(() => {
    if (!atlas) return;
    const imgs = loadedImages();
    const base: Partial<Record<ZoneId, HTMLImageElement>> = {};
    for (const z of ['front', 'back'] as const) {
      const src = baseArtwork?.[z];
      const img = src ? (imgs.get(src) as HTMLImageElement | undefined) : undefined;
      if (img) base[z] = img;
    }
    renderAtlas(atlas.ctx, w, h, { config, zones: zones ?? {}, images: imgs, fonts: getFontFamilies(), baseArtwork: base });
    atlas.texture.needsUpdate = true;
  }, [atlas, config, zones, baseArtwork, assetTick, w, h]);
  return atlas;
}

export function Garment({ config, colorHex, zones, baseArtwork, atlasScale = 1, onAtlas }: GarmentProps) {
  const gltf = useGLTF(config.modelUrl);
  const atlas = useAtlas(config, zones, baseArtwork, atlasScale);
  const overlays = useRef<THREE.Mesh[]>([]);

  // clone scene graph + materials for this instance (geometry stays shared with the cache)
  const { root, colorable, owned } = useMemo(() => {
    const root = gltf.scene.clone(true);
    const colorable: THREE.MeshStandardMaterial[] = [];
    const owned: THREE.Material[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
        const c = m.clone();
        owned.push(c);
        if (config.colorableMaterials.includes(m.name) && 'color' in c) colorable.push(c as THREE.MeshStandardMaterial);
        if ((c as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
          (c as THREE.MeshStandardMaterial).side = THREE.DoubleSide; // the neck opening shows the inside
          (c as THREE.MeshStandardMaterial).envMapIntensity = 0.85;
        }
        return c;
      });
      mesh.material = Array.isArray(mesh.material) ? mats : mats[0];
    });
    return { root, colorable, owned };
  }, [gltf.scene, config.colorableMaterials]);

  useEffect(() => () => owned.forEach((m) => m.dispose()), [owned]);

  useEffect(() => {
    for (const m of colorable) {
      m.color.set(colorHex);
      // cotton/fleece sheen tinted by the fabric colour: soft and matte, never a white velvet rim
      const phys = m as THREE.MeshPhysicalMaterial;
      if (phys.isMeshPhysicalMaterial && phys.sheen > 0) {
        phys.sheen = Math.min(phys.sheen, 0.35);
        phys.sheenRoughness = 0.9;
        phys.sheenColor.set(colorHex).multiplyScalar(0.5);
      }
    }
  }, [colorable, colorHex]);

  // print overlay meshes share the printable geometry and sample the atlas through UV0
  useEffect(() => {
    if (!atlas) return;
    const created: THREE.Mesh[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !config.printableMeshes.includes(mesh.name)) return;
      if (created.some((c) => c.parent === mesh)) return;
      const base = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
      const mat = new THREE.MeshStandardMaterial({
        map: atlas.texture,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        roughness: 0.78,
        metalness: 0,
        normalMap: base.normalMap ?? null,
        normalScale: base.normalScale?.clone() ?? new THREE.Vector2(1, 1),
        // baked ambient occlusion darkens the print in folds, like real ink on fabric
        aoMap: base.aoMap ?? null,
        aoMapIntensity: base.aoMapIntensity ?? 1,
        side: THREE.FrontSide,
      });
      const overlay = new THREE.Mesh(mesh.geometry, mat);
      overlay.name = `${mesh.name}__print`;
      overlay.renderOrder = 2;
      overlay.receiveShadow = true;
      overlay.raycast = () => undefined; // never steal pointer events from the garment
      mesh.add(overlay);
      created.push(overlay);
    });
    overlays.current = created;
    onAtlas?.(atlas.canvas);
    return () => {
      for (const o of created) {
        o.removeFromParent();
        (o.material as THREE.Material).dispose();
      }
      overlays.current = [];
      onAtlas?.(null);
    };
  }, [atlas, root, config.printableMeshes, onAtlas]);

  return (
    <group rotation={[0, config.rotationY, 0]}>
      <group position={config.hangOffset} scale={config.scale}>
        <primitive object={root} />
      </group>
    </group>
  );
}
