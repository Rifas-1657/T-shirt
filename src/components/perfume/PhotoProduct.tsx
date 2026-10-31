'use client';
// A perfume shown as its product photo, standing upright at real size: the cut-out stands free (a framed
// print otherwise), and with several angle photos it turns slowly and can be dragged to turn.
import { useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { bottleHeight, isCutout, shownUrl } from '@/lib/productPhotos';
import type { PhotoView, ProductPhoto, PublicProduct } from '@/lib/types';

export function srgb(t: THREE.Texture | THREE.Texture[]) {
  for (const x of Array.isArray(t) ? t : [t]) {
    x.colorSpace = THREE.SRGBColorSpace;
    x.anisotropy = 8;
  }
}

/** Soft contact shadow under a photo (a photo cannot cast a real one). */
export function useBlobShadow() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

const TURN_ORDER: PhotoView[] = ['front', 'angle', 'side', 'back'];
/** Turntable frames: the cut-out angle photos front → ¾ → side → back and back again (a turn in the hand),
 * starting from the photo the admin put first. Detail shots and framed photos are not part of it. */
function turnFrames(p: PublicProduct): ProductPhoto[] {
  const cut = (p.photos ?? []).filter((ph) => isCutout(ph) && ph.view !== 'detail');
  const ordered = TURN_ORDER.map((v) => cut.find((ph) => ph.view === v)).filter((ph): ph is ProductPhoto => !!ph);
  if (ordered.length < 2) return [p.photos![0]];
  const loop = [...ordered, ...ordered.slice(1, -1).reverse()];
  const start = Math.max(0, loop.findIndex((ph) => ph.id === p.photos![0].id));
  return [...loop.slice(start), ...loop.slice(0, start)];
}

/** A product photo standing upright at real size; cut-outs stand free, other photos stand framed. With
 * several angle photos, the active one turns slowly (cross-fading between angles) and can be dragged. */
export function PhotoProduct({ p, height, shadow, spin, reduced, turnRef, lightRef, index = 0 }: { p: PublicProduct; height?: number; shadow: THREE.Texture; spin: boolean; reduced: boolean; turnRef: (fn: ((d: number) => void) | null) => void; /** niche brightness (0–1) per index: photos are unlit, so they follow it */ lightRef?: React.RefObject<number[]>; index?: number }) {
  const frames = useMemo(() => turnFrames(p), [p]);
  const urls = useMemo(() => [...new Set(frames.map(shownUrl))], [frames]);
  const texList = useTexture(urls, srgb) as THREE.Texture[];
  const texOf = (ph: ProductPhoto) => texList[urls.indexOf(shownUrl(ph))];
  const cut = isCutout(frames[0]);
  const h = cut ? (height ?? bottleHeight(p.perfume)) : (height ?? 0.2) * 1.2;
  const size = (ph: ProductPhoto) => {
    const img = texOf(ph).image as { width: number; height: number };
    const w = (h * img.width) / img.height;
    // cut-outs carry ~3% transparent padding: sink by that much so the glass stands on the riser
    return { w, y: h / 2 + (cut ? -0.03 * Math.max(h, w) : 0.004) };
  };
  // the angle on show and the one fading out
  const [{ frame, from }, setFrames] = useState({ frame: 0, from: 0 });
  const fade = useRef(1);
  const cur = useRef<THREE.Mesh>(null);
  const prev = useRef<THREE.Mesh>(null);
  const pausedUntil = useRef(0);
  const turn = useMemo(
    () => (d: number) => {
      pausedUntil.current = performance.now() + 4000;
      setFrames(({ frame: f }) => ({ frame: (f + d + frames.length) % frames.length, from: f }));
    },
    [frames.length],
  );
  useEffect(() => {
    turnRef(frames.length > 1 ? turn : null);
    return () => turnRef(null);
  }, [turn, turnRef, frames.length]);
  // showroom turntable: the active bottle shows its next angle every few seconds
  useEffect(() => {
    if (!spin || reduced || frames.length < 2) return;
    const t = setInterval(() => {
      if (performance.now() < pausedUntil.current) return;
      setFrames(({ frame: f }) => ({ frame: (f + 1) % frames.length, from: f }));
    }, 2600);
    return () => clearInterval(t);
  }, [spin, reduced, frames.length]);
  // cross-fade from the previous angle whenever a new one is shown
  useEffect(() => {
    fade.current = 0;
  }, [frame]);
  useFrame((_, dt) => {
    fade.current = Math.min(1, fade.current + dt / (reduced ? 0.001 : 0.5));
    const k = fade.current * fade.current * (3 - 2 * fade.current);
    // a photo does not react to the scene lights: it follows its niche's brightness instead
    const lit = lightRef ? 0.12 + 0.88 * Math.min(1, (lightRef.current[index] ?? 0) * 1.25) : 1;
    if (cur.current) {
      (cur.current.material as THREE.MeshBasicMaterial).opacity = k;
      (cur.current.material as THREE.MeshBasicMaterial).color.setScalar(lit);
    }
    if (prev.current) {
      (prev.current.material as THREE.MeshBasicMaterial).color.setScalar(lit);
      (prev.current.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      prev.current.visible = k < 1;
    }
  });
  const a = frames[frame];
  const b = frames[from];
  const sa = size(a);
  const sb = size(b);
  return (
    <group>
      <mesh position={[0, 0.0015, 0.005]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <planeGeometry args={[Math.max(sa.w * 1.25, 0.06), Math.max(sa.w * 0.55, 0.04)]} />
        <meshBasicMaterial map={shadow} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      {!cut && (
        <mesh position={[0, h / 2 + 0.004, -0.006]} castShadow>
          <boxGeometry args={[sa.w + 0.02, h + 0.02, 0.01]} />
          <meshStandardMaterial color="#c9a45c" metalness={1} roughness={0.3} />
        </mesh>
      )}
      <mesh ref={prev} position={[0, sb.y, -0.001]} scale={[sb.w, h, 1]} renderOrder={2} visible={false}>
        <planeGeometry />
        <meshBasicMaterial map={texOf(b)} transparent depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={cur} position={[0, sa.y, 0]} scale={[sa.w, h, 1]} renderOrder={3}>
        <planeGeometry />
        <meshBasicMaterial map={texOf(a)} transparent alphaTest={cut ? 0.02 : 0} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

