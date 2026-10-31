'use client';
// One perfume bottle, styled at runtime from the product's PerfumeSpec. The geometry comes from the
// Blender bottle templates; materials are created here (glass refraction, juice colour, cap finish)
// and the label is drawn on a canvas with the product name. Everything created is disposed on unmount.
import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { getFontFamilies } from '@/lib/clientAssets';
import { BOTTLES, CAP_FINISHES } from '@/lib/perfume';
import type { PerfumeSpec } from '@/lib/types';

export const MAROON = '#8a1538'; // Qatar maroon

function labelTexture(title: string, spec: PerfumeSpec) {
  const [lw, lh] = BOTTLES[spec.bottle].labelSize;
  const W = 768;
  const H = Math.round((W * lh) / lw);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const fonts = getFontFamilies();
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#7a1131');
  g.addColorStop(1, '#5a0b23');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#d6b46e';
  ctx.lineWidth = Math.max(3, W * 0.006);
  const m = W * 0.035;
  ctx.strokeRect(m, m, W - 2 * m, H - 2 * m);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(m * 1.6, m * 1.6, W - 3.2 * m, H - 3.2 * m);
  ctx.fillStyle = '#e9cf93';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const name = title.replace(/\s+(eau de parfum|eau de toilette|extrait de parfum|parfum)$/i, '').toUpperCase();
  let size = H * (H > W ? 0.13 : 0.34);
  ctx.font = `600 ${size}px ${fonts.serif}`;
  ctx.letterSpacing = `${size * 0.12}px`;
  while (ctx.measureText(name).width > W * 0.82 && size > 8) {
    size *= 0.92;
    ctx.font = `600 ${size}px ${fonts.serif}`;
    ctx.letterSpacing = `${size * 0.12}px`;
  }
  ctx.fillText(name, W / 2, H * (H > W ? 0.42 : 0.44));
  const small = Math.max(10, H * (H > W ? 0.045 : 0.12));
  ctx.font = `600 ${small}px ${fonts.sans}`;
  ctx.letterSpacing = `${small * 0.3}px`;
  ctx.fillStyle = '#d6b46e';
  ctx.fillText(`${spec.concentration} · ${spec.volumeMl} ML`.toUpperCase(), W / 2, H * (H > W ? 0.6 : 0.76));
  const t = new THREE.CanvasTexture(c);
  t.flipY = false; // glTF UV convention (the label UVs come from the Blender bottle)
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function Bottle({ title, spec, glassTint = '#fff6f6' }: { title: string; spec: PerfumeSpec; glassTint?: string }) {
  const { scene } = useGLTF(`/models/perfume/${spec.bottle}.glb`);
  const label = useMemo(() => labelTexture(title, spec), [title, spec]);

  const mats = useMemo(() => {
    const finish = CAP_FINISHES[spec.cap];
    const liquid = new THREE.Color(spec.liquid);
    return {
      glass: new THREE.MeshPhysicalMaterial({
        color: '#ffffff',
        transmission: 1,
        thickness: 0.035,
        roughness: 0.025,
        ior: 1.52,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        attenuationColor: new THREE.Color(glassTint),
        attenuationDistance: 0.6,
        specularIntensity: 1,
        envMapIntensity: 1.35,
      }),
      liquid: new THREE.MeshPhysicalMaterial({
        color: liquid,
        roughness: 0.1,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        emissive: liquid.clone().multiplyScalar(0.18),
        envMapIntensity: 1.1,
      }),
      metal: new THREE.MeshPhysicalMaterial({ color: CAP_FINISHES[spec.cap === 'onyx' ? 'gold' : spec.cap].color, metalness: 1, roughness: 0.2, envMapIntensity: 1.4 }),
      cap: new THREE.MeshPhysicalMaterial({ color: finish.color, metalness: finish.metal, roughness: finish.rough, clearcoat: spec.cap === 'onyx' ? 1 : 0.4, clearcoatRoughness: 0.06, envMapIntensity: 1.4 }),
      label: new THREE.MeshStandardMaterial({ map: label, roughness: 0.45, metalness: 0.1 }),
    };
  }, [spec, label, glassTint]);

  const root = useMemo(() => {
    const r = scene.clone(true);
    r.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      const n = m.name.split('.')[0].split('_')[0];
      m.material =
        n === 'Glass' || n === 'Neck' ? mats.glass : n === 'Liquid' ? mats.liquid : n === 'Cap' ? mats.cap : n === 'Label' ? mats.label : mats.metal;
      if (n === 'Label') m.castShadow = false;
    });
    return r;
  }, [scene, mats]);

  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => m.dispose());
      label.dispose();
    },
    [mats, label],
  );
  return <primitive object={root} />;
}

for (const b of ['qasr', 'ward', 'majlis']) useGLTF.preload(`/models/perfume/${b}.glb`);
