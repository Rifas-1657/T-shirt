'use client';
// The perfume salon: a wall of dark basalt with a row of pointed-arch niches carved into it. Each niche
// has its own downlight and a glow in the colour of its perfume, and the polished black floor reflects
// them. Perfumes stand in their niches as their product photo (cut out of its background) or, without
// photos, as the 3D Blender bottle. The niche lights switch on one by one when the salon opens.
import { Environment, OrbitControls, useTexture } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { getFontFamilies } from '@/lib/clientAssets';
import { BOTTLES } from '@/lib/perfume';
import type { PublicProduct } from '@/lib/types';
import { Bottle } from './Bottle';
import { PhotoProduct, useBlobShadow } from './PhotoProduct';
import { turningBottle } from './salonState';

export type SalonMode = 'intro' | 'gallery' | 'inspect';
/** Brightness of every niche (0–1), shared by its spot light, glow and label. */
type Levels = React.RefObject<number[]>;

export const SALON = { lighting: '/perfume-salon/lighting.hdr' };

// niche geometry, metres
const N_W = 0.2; // opening width
const N_H = 0.5; // sill to the point of the arch: tall niches, as in a gallery wall
const N_D = 0.2; // depth
const WALL_T = 0.07; // thickness of the stone in front of the niches (the visible reveal)
const SILL = 0.25; // sill height above the floor
const GAP = 0.262; // niche centre to centre: narrow stone piers between the niches
const WALL_H = 2.4;
const BG = '#0a0809';
const slotX = (i: number, n: number) => (i - (n - 1) / 2) * GAP;
const NICHE_Z = -WALL_T - N_D / 2; // where the perfume stands
const SPOTS = 5; // real spot lights follow the five niches around the one in view (odd)

function damp(c: number, t: number, l: number, dt: number) {
  return THREE.MathUtils.lerp(c, t, 1 - Math.exp(-l * dt));
}
/** Display height in the niche: hero size, about half the niche, a little larger for bigger bottles. */
const productHeight = (p: PublicProduct) => N_H * 0.44 * THREE.MathUtils.clamp(Math.cbrt((p.perfume?.volumeMl ?? 100) / 100), 0.85, 1.12);
const bottleScale = (p: PublicProduct) => productHeight(p) / (p.perfume ? BOTTLES[p.perfume.bottle].height : 0.15);
const accent = (p: PublicProduct) => p.perfume?.liquid ?? '#c9a45c';

/** Pointed (Islamic) arch: straight jambs, then two curves meeting in a point. Origin at the sill centre. */
function archPath<T extends THREE.Path>(path: T, cx = 0, cy = 0): T {
  const r = N_W / 2;
  const spring = N_H - N_W * 0.78;
  path.moveTo(cx - r, cy);
  path.lineTo(cx + r, cy);
  path.lineTo(cx + r, cy + spring);
  path.bezierCurveTo(cx + r, cy + spring + (N_H - spring) * 0.55, cx + r * 0.35, cy + N_H * 0.94, cx, cy + N_H);
  path.bezierCurveTo(cx - r * 0.35, cy + N_H * 0.94, cx - r, cy + spring + (N_H - spring) * 0.55, cx - r, cy + spring);
  path.lineTo(cx - r, cy);
  return path;
}

function useStone() {
  const tex = useTexture({ map: '/textures/rock_wall_02_Mono.jpg', normalMap: '/textures/rock_wall_02_nor_gl.jpg', roughnessMap: '/textures/rock_wall_02_Rough.jpg' }, (t) => {
    for (const x of Array.isArray(t) ? t : [t]) {
      x.wrapS = x.wrapT = THREE.RepeatWrapping;
      x.repeat.set(1 / 1.1, 1 / 1.1); // geometry UVs are in metres: one tile per 1.1 m
      x.anisotropy = 8;
      if ((x.image as HTMLImageElement | undefined)?.src?.includes('_Mono')) x.colorSpace = THREE.SRGBColorSpace;
    }
  });
  return tex;
}

/** The stone wall with the arched openings cut out, and the carved inside of every niche. */
function NicheWall({ n }: { n: number }) {
  const stone = useStone();
  const half = Math.max(3, (n * GAP) / 2 + 2.5);
  const wall = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-half, 0);
    s.lineTo(half, 0);
    s.lineTo(half, WALL_H);
    s.lineTo(-half, WALL_H);
    s.lineTo(-half, 0);
    for (let i = 0; i < n; i++) s.holes.push(archPath(new THREE.Path(), slotX(i, n), SILL));
    return new THREE.ExtrudeGeometry(s, { depth: WALL_T, bevelEnabled: false, curveSegments: 18 });
  }, [n, half]);
  const niche = useMemo(() => new THREE.ExtrudeGeometry(archPath(new THREE.Shape()), { depth: N_D, bevelEnabled: false, curveSegments: 18 }), []);
  useEffect(() => () => void (wall.dispose(), niche.dispose()), [wall, niche]);
  return (
    <group>
      <mesh geometry={wall} position={[0, 0, -WALL_T]} receiveShadow>
        <meshStandardMaterial {...stone} color="#6f6a67" roughness={1} normalScale={new THREE.Vector2(1.6, 1.6)} />
      </mesh>
      {Array.from({ length: n }, (_, i) => (
        // seen from inside: the back faces of the extruded arch are the niche's walls, sill and back
        <mesh key={i} geometry={niche} position={[slotX(i, n), SILL, -WALL_T - N_D]} receiveShadow>
          <meshStandardMaterial {...stone} color="#bdb5ae" roughness={1} side={THREE.BackSide} normalScale={new THREE.Vector2(1.8, 1.8)} />
        </mesh>
      ))}
    </group>
  );
}

function gradientTexture(draw: (ctx: CanvasRenderingContext2D, s: number) => void) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  draw(c.getContext('2d')!, 128);
  return new THREE.CanvasTexture(c);
}

/** The light inside one niche: downlight fitting, the cone it throws on the back wall, a coloured glow
 * from a hidden strip down one side, and the name carved below the sill. Brightness follows `level`. */
function NicheLight({ x, color, title, index, levelsRef, showName }: { x: number; color: string; title: string; index: number; levelsRef: Levels; showName: boolean }) {
  const cone = useMemo(
    () =>
      gradientTexture((ctx, s) => {
        const g = ctx.createRadialGradient(s / 2, s * 0.12, 1, s / 2, s * 0.12, s * 0.85);
        g.addColorStop(0, 'rgba(255,236,205,1)');
        g.addColorStop(0.4, 'rgba(255,226,190,0.32)');
        g.addColorStop(1, 'rgba(255,220,180,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
        // fade the top edge away so the cone has no visible border
        ctx.globalCompositeOperation = 'destination-in';
        const m = ctx.createLinearGradient(0, 0, 0, s * 0.18);
        m.addColorStop(0, 'rgba(0,0,0,0)');
        m.addColorStop(1, 'rgba(0,0,0,1)');
        ctx.fillStyle = m;
        ctx.fillRect(0, 0, s, s);
      }),
    [],
  );
  const glow = useMemo(
    () =>
      gradientTexture((ctx, s) => {
        const g = ctx.createLinearGradient(s, 0, 0, 0);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.25)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
        // soft top and bottom, so the glow has no edges
        ctx.globalCompositeOperation = 'destination-in';
        const m = ctx.createLinearGradient(0, 0, 0, s);
        m.addColorStop(0, 'rgba(0,0,0,0)');
        m.addColorStop(0.3, 'rgba(0,0,0,1)');
        m.addColorStop(0.8, 'rgba(0,0,0,1)');
        m.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = m;
        ctx.fillRect(0, 0, s, s);
      }),
    [],
  );
  const label = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 96;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#e9dfcf';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `500 54px ${getFontFamilies().serif}`;
    ctx.fillText(title.replace(/\s+(eau de parfum|eau de toilette|extrait( de parfum)?|parfum)$/i, ''), 256, 48, 500);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [title]);
  useEffect(() => () => void (cone.dispose(), glow.dispose(), label.dispose()), [cone, glow, label]);
  const fitting = useRef<THREE.MeshBasicMaterial>(null);
  const coneM = useRef<THREE.MeshBasicMaterial>(null);
  const glowM = useRef<THREE.MeshBasicMaterial>(null);
  const strip = useRef<THREE.MeshBasicMaterial>(null);
  const name = useRef<THREE.MeshBasicMaterial>(null);
  const halo = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    const k = levelsRef.current[index] ?? 0;
    fitting.current?.color.setScalar(0.2 + 2.6 * k);
    if (coneM.current) coneM.current.opacity = 0.85 * k;
    if (glowM.current) glowM.current.opacity = 0.6 * k;
    if (strip.current) strip.current.opacity = 0.95 * k;
    if (halo.current) halo.current.opacity = 0.9 * k;
    if (name.current) name.current.opacity = showName ? 0.12 + 0.75 * k * k : 0;
  });
  const back = -WALL_T - N_D + 0.003;
  return (
    <group position={[x, 0, 0]}>
      {/* the fitting, just under the point of the arch */}
      <mesh position={[0, SILL + N_H - 0.07, NICHE_Z]}>
        <cylinderGeometry args={[0.01, 0.01, 0.003, 24]} />
        <meshBasicMaterial ref={fitting} color="#fff4e0" toneMapped={false} />
      </mesh>
      {/* the lamp's halo, so the fitting glows rather than reads as a flat disc */}
      <mesh position={[0, SILL + N_H - 0.075, NICHE_Z + 0.03]}>
        <planeGeometry args={[0.07, 0.04]} />
        <meshBasicMaterial ref={halo} map={cone} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, SILL + N_H * 0.5, back]}>
        <planeGeometry args={[N_W * 0.98, N_H * 0.86]} />
        <meshBasicMaterial ref={coneM} map={cone} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, SILL + N_H * 0.4, back + 0.001]}>
        <planeGeometry args={[N_W, N_H * 0.8]} />
        <meshBasicMaterial ref={glowM} map={glow} color={color} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[N_W / 2 - 0.004, SILL + N_H * 0.36, NICHE_Z]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[N_D * 0.8, N_H * 0.62]} />
        <meshBasicMaterial ref={strip} map={glow} color={color} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, SILL - 0.032, 0.002]}>
        <planeGeometry args={[N_W * 0.8, (N_W * 0.8 * 96) / 512]} />
        <meshBasicMaterial ref={name} map={label} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Display({ products, active, mode, onSelect, reduced, levelsRef }: { products: PublicProduct[]; active: number; mode: SalonMode; onSelect: (i: number) => void; reduced: boolean; levelsRef: Levels }) {
  const spins = useRef<(THREE.Group | null)[]>([]);
  const shadow = useBlobShadow();
  const turners = useRef<(((d: number) => void) | null)[]>([]);
  const n = products.length;
  // drag the bottle in view sideways to turn it (each 60 px shows the next angle)
  const startTurn = (i: number, x0: number) => {
    const turn = turners.current[i];
    if (!turn || mode === 'intro') return;
    turningBottle.current = true;
    let last = x0;
    const move = (e: PointerEvent) => {
      while (Math.abs(e.clientX - last) > 60) {
        const d = e.clientX > last ? -1 : 1;
        turn(d);
        last += d * -60;
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setTimeout(() => (turningBottle.current = false), 0);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  useFrame((_, dt) => {
    spins.current.forEach((s, i) => {
      if (!s) return;
      // 3D bottles: the one in view turns slowly, the rest face front
      if (i === active && mode !== 'intro' && !reduced) s.rotation.y += dt * 0.3;
      else s.rotation.y = damp(s.rotation.y, Math.round(s.rotation.y / (Math.PI * 2)) * Math.PI * 2, 3, dt);
    });
  });
  return (
    <group>
      {products.map((p, i) => {
        const h = productHeight(p);
        return (
          <group key={p.id}>
            <NicheLight x={slotX(i, n)} color={accent(p)} title={p.title} index={i} levelsRef={levelsRef} showName={mode !== 'inspect'} />
            <group position={[slotX(i, n), SILL, NICHE_Z]}>
              {p.photos?.length ? (
                <PhotoProduct p={p} height={h} lightRef={levelsRef} index={i} shadow={shadow} spin={i === active && mode !== 'intro'} reduced={reduced} turnRef={(fn) => void (turners.current[i] = fn)} />
              ) : (
                <group ref={(g) => void (spins.current[i] = g)} scale={bottleScale(p)}>{p.perfume && <Bottle title={p.title} spec={p.perfume} />}</group>
              )}
              {/* generous hit volume so perfumes are easy to pick */}
              <mesh
                position={[0, h / 2, 0.02]}
                visible={false}
                onClick={(e) => {
                  e.stopPropagation();
                  if (e.delta > 8) return; // the end of a drag, not a click
                  onSelect(i);
                }}
                onPointerDown={(e) => {
                  if (i === active) startTurn(i, e.nativeEvent.clientX);
                }}
                onPointerOver={() => (document.body.style.cursor = 'pointer')}
                onPointerOut={() => (document.body.style.cursor = '')}
                userData={{ perfumeId: p.id }}
              >
                <boxGeometry args={[N_W * 0.9, Math.min(N_H, h + 0.06), N_D]} />
              </mesh>
            </group>
          </group>
        );
      })}
    </group>
  );
}

/**
 * Light levelsRef: dark during the opening, then the niches switch on one after another (from the one in
 * view outwards). The niche in view is brightest; in close-up the others dim, like a gallery spot.
 * A pool of real spot lights follows the niches around the one in view (they light the stone and cast
 * the bottles' shadows); the glow and cone in every niche are drawn without lights so any number is cheap.
 */
/** One spot light of the pool: it lights niche `slot` positions away from the one in view. */
function NicheSpot({ products, active, slot, levelsRef }: { products: PublicProduct[]; active: number; slot: number; levelsRef: Levels }) {
  const light = useRef<THREE.SpotLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  const i = active + slot;
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    const x = slotX(i, products.length);
    l.position.set(x, SILL + N_H - 0.05, NICHE_Z + 0.02);
    target.position.set(x, SILL, NICHE_Z - 0.02);
    l.intensity = i >= 0 && i < products.length ? 3.4 * (levelsRef.current[i] ?? 0) : 0;
  });
  return (
    <>
      <primitive object={target} />
      <spotLight ref={light} target={target} angle={0.5} penumbra={0.7} distance={1.1} decay={2} color="#ffeccf" castShadow={slot === 0} shadow-mapSize={[512, 512]} shadow-bias={-0.0005} shadow-camera-near={0.01} />
    </>
  );
}

/**
 * Light levelsRef: dark during the opening, then the niches switch on one after another (from the one in
 * view outwards). The niche in view is brightest; in close-up the others dim, like a gallery spot.
 * A small pool of real spot lights follows the niches around the one in view (they light the stone and
 * cast the bottles' shadows); the glow and cone in every niche are drawn without lights, so any number
 * of perfumes stays cheap.
 */
function Lighting({ products, active, mode, reduced, levelsRef }: { products: PublicProduct[]; active: number; mode: SalonMode; reduced: boolean; levelsRef: Levels }) {
  const n = products.length;
  const started = useRef<number | null>(null);
  useFrame((state, dt) => {
    if (mode !== 'intro' && started.current === null) started.current = state.clock.elapsedTime;
    const since = started.current === null ? -1 : state.clock.elapsedTime - started.current;
    const lv = levelsRef.current;
    for (let i = 0; i < n; i++) {
      const on = reduced ? 1 : THREE.MathUtils.clamp((since - 0.15 - Math.abs(i - active) * 0.28) / 0.35, 0, 1);
      const target = on * (i === active ? 1 : mode === 'inspect' ? 0.2 : 0.5);
      // a little flicker as each one strikes, like a real lamp
      const strike = on > 0 && on < 1 && !reduced ? 0.6 + 0.4 * Math.sin(since * 60 + i) : 1;
      lv[i] = damp(lv[i] ?? 0, target * strike, reduced ? 1000 : 6, dt);
    }
  });
  return (
    <>
      <ambientLight intensity={0.05} color="#ffe7d6" />
      {/* a faint wash grazing down the wall so the carved stone reads in the dark */}
      <spotLight position={[0, WALL_H + 0.6, 1.4]} angle={0.9} penumbra={1} intensity={2.2} color="#ffe1c4" distance={6} />
      {Array.from({ length: SPOTS }, (_, k) => (
        <NicheSpot key={k} products={products} active={active} slot={k - Math.floor(SPOTS / 2)} levelsRef={levelsRef} />
      ))}
    </>
  );
}

function CameraRig({ products, active, mode, reduced }: { products: PublicProduct[]; active: number; mode: SalonMode; reduced: boolean }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size } = useThree();
  const narrow = size.width < 768;
  const settled = useRef(false);
  const p = products[active];
  const photo = !!p?.photos?.length;
  const h = p ? productHeight(p) : 0.15;
  const x = slotX(active, products.length);
  // on the wall the camera keeps the row filling the frame (no empty stone past the first or last niche)
  const edge = Math.max(0, slotX(products.length - 1, products.length) - (narrow ? 0 : 0.5));
  const wallX = THREE.MathUtils.clamp(x, -edge, edge);
  useEffect(() => {
    settled.current = false;
  }, [mode, active]);
  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const mid = SILL + Math.max(h, 0.12) * 0.5;
    const [pos, tgt] =
      mode === 'intro'
        ? [new THREE.Vector3(x, SILL + N_H * 0.6, 2.6), new THREE.Vector3(x, SILL + N_H * 0.45, 0)]
        : mode === 'inspect'
          ? narrow
            ? // the niche in the top half, the details below
              [new THREE.Vector3(x, SILL + N_H * 0.1, 2.0), new THREE.Vector3(x, SILL - N_H * 0.12, NICHE_Z)]
            : // the niche fills the right half; the details sit on the left
              [new THREE.Vector3(x - 0.2, SILL + N_H * 0.52, 1.0), new THREE.Vector3(x - 0.2, SILL + N_H * 0.48, NICHE_Z)]
          : narrow
            ? [new THREE.Vector3(x, SILL + N_H * 0.5, 1.75), new THREE.Vector3(x, SILL + N_H * 0.46, 0)]
            : [new THREE.Vector3(wallX, SILL + N_H * 0.52, 1.42), new THREE.Vector3(wallX, SILL + N_H * 0.44, 0)];
    if (!settled.current) {
      const l = reduced ? 1000 : mode === 'gallery' ? 2.2 : 2.6;
      camera.position.set(damp(camera.position.x, pos.x, l, dt), damp(camera.position.y, pos.y, l, dt), damp(camera.position.z, pos.z, l, dt));
      c.target.set(damp(c.target.x, tgt.x, l, dt), damp(c.target.y, tgt.y, l, dt), damp(c.target.z, tgt.z, l, dt));
      if (mode === 'inspect' && camera.position.distanceTo(pos) < 0.003) settled.current = true;
    }
    c.update();
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      // photos are turned by dragging the bottle; a 3D bottle can be looked at from a little around
      enabled={mode === 'inspect' && !photo}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      // limits only for looking around a 3D bottle; OrbitControls clamps the distance even when disabled
      minDistance={mode === 'inspect' && !photo ? 0.45 : 0.01}
      maxDistance={mode === 'inspect' && !photo ? 1.3 : 50}
      minAzimuthAngle={-0.45}
      maxAzimuthAngle={0.45}
      minPolarAngle={Math.PI * 0.35}
      maxPolarAngle={Math.PI * 0.55}
      onStart={() => {
        settled.current = true; // the customer takes over the camera
      }}
    />
  );
}

/** Fires once everything inside its Suspense boundary has loaded and a few frames have rendered
 * (shader compilation done), so the intro can unveil a scene that is really there. */
function ReadySignal({ onReady }: { onReady: () => void }) {
  const frames = useRef(0);
  const fired = useRef(false);
  useFrame(() => {
    if (fired.current) return;
    if (++frames.current > 3) {
      fired.current = true;
      onReady();
    }
  });
  return null;
}

/** Black stone floor with a low mist drifting along the foot of the wall, lit by the niches above. */
function Floor({ reduced }: { reduced: boolean }) {
  const mist = useMemo(() => {
    const W = 1024;
    const H = 256;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;
    // soft overlapping puffs, tiling horizontally
    for (let i = 0; i < 90; i++) {
      const x = (Math.sin(i * 91.7) * 0.5 + 0.5) * W;
      const y = H * (0.45 + 0.4 * (Math.cos(i * 13.1) * 0.5 + 0.5));
      const r = 40 + ((i * 53) % 90);
      for (const dx of [-W, 0, W]) {
        const g = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, r);
        g.addColorStop(0, 'rgba(255,255,255,0.22)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x + dx - r, y - r, r * 2, r * 2);
      }
    }
    // fade out toward the top
    ctx.globalCompositeOperation = 'destination-in';
    const m = ctx.createLinearGradient(0, 0, 0, H);
    m.addColorStop(0, 'rgba(0,0,0,0)');
    m.addColorStop(0.6, 'rgba(0,0,0,1)');
    m.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = m;
    ctx.fillRect(0, 0, W, H);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(3, 1);
    return t;
  }, []);
  useEffect(() => () => mist.dispose(), [mist]);
  // the mist drifts slowly (both layers share the texture)
  const mistMat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((_, dt) => {
    const map = mistMat.current?.map;
    if (map && !reduced) map.offset.x = (map.offset.x + dt * 0.006) % 1;
  });
  return (
    <group>
      {/* unlit: the room's light would only grey it */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 2]}>
        <planeGeometry args={[30, 4.1]} />
        <meshBasicMaterial color="#050404" />
      </mesh>
      {[0.05, 0.35].map((z, k) => (
        <mesh key={z} position={[0, 0.16, z]}>
          <planeGeometry args={[9, 0.34]} />
          <meshBasicMaterial ref={k ? undefined : mistMat} map={mist} color={k ? '#cdbfb3' : '#a99c92'} transparent opacity={k ? 0.35 : 0.5} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

export function PerfumeScene({ products, active, mode, onSelect, mobile, reduced, onReady }: { products: PublicProduct[]; active: number; mode: SalonMode; onSelect: (i: number) => void; mobile: boolean; reduced: boolean; onReady?: () => void }) {
  // one brightness value per niche, shared by the lights, the glows and the labels
  const levelsRef = useRef<number[]>([]);
  return (
    <Canvas
      shadows
      dpr={mobile ? [1, 1.5] : [1, 1.75]}
      camera={{ fov: 30, near: 0.02, far: 30, position: [0, SILL + 0.35, 2.4] }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.3 }}
      onCreated={({ gl }) => {
        gl.domElement.setAttribute('role', 'img');
        gl.domElement.setAttribute('aria-label', 'Perfume salon: perfumes in lit niches carved into a dark stone wall. Choose a perfume to see it close up and read its notes.');
      }}
    >
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 3.2, 8]} />
      <Suspense fallback={null}>
        {/* the glass and metal pick up a real interior, kept dim */}
        <Environment files={SALON.lighting} environmentIntensity={0.18} />
        <NicheWall n={products.length} />
        <Display products={products} active={active} mode={mode} onSelect={onSelect} reduced={reduced} levelsRef={levelsRef} />
        <Floor reduced={reduced} />
        {onReady && <ReadySignal onReady={onReady} />}
      </Suspense>
      <Lighting products={products} active={active} mode={mode} reduced={reduced} levelsRef={levelsRef} />
      <CameraRig products={products} active={active} mode={mode} reduced={reduced} />
    </Canvas>
  );
}

