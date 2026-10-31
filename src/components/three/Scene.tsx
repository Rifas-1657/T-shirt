'use client';
import { Environment, OrbitControls, useGLTF, useTexture } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { captureRef } from '@/lib/capture';
import { getFontFamilies, prefersReducedMotion } from '@/lib/clientAssets';
import { CATEGORY_INFO, RACK_ORDER, TEMPLATES, templateUrl } from '@/lib/garments';
import type { GarmentCategory, Layer, PublicProduct, ZoneId } from '@/lib/types';
import { useDesign } from '@/store/designStore';
import { useShowroom } from '@/store/showroomStore';
import { openProduct } from '@/store/actions';
import { Garment } from './Garment';

export const RAIL_Y = 1.8;
const RACK_GAP = 3.1;
const RACK_HALF = 1.0; // half the rail length
const SIDE_ANGLE = -Math.PI / 2 + 0.3;
const DETAIL_Z = 1.0;
const WALL = '#ece8e1';
const WALL_Z = -1.5;

export const rackX = (c: GarmentCategory) => (RACK_ORDER.indexOf(c) - (RACK_ORDER.length - 1) / 2) * RACK_GAP;

/** Frame-rate independent exponential damping. */
function damp(current: number, target: number, lambda: number, dt: number) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

function activeRackX(): number {
  const { rack, mode, selectedId } = useShowroom.getState();
  if (mode !== 'collection' && selectedId) {
    const g = useShowroom.getState().selectedGarment;
    if (g) return rackX(g);
  }
  return rack === 'all' ? 0 : rackX(rack);
}

// ---------------------------------------------------------------- capture bridge (preview images + test hooks)
function CaptureBridge() {
  const { gl, scene, camera } = useThree();
  const pending = useRef<((url: string) => void)[]>([]);
  useEffect(() => {
    captureRef.current = () => new Promise((resolve) => pending.current.push(resolve));
    (window as unknown as Record<string, unknown>).__atelier = {
      info: () => ({ memory: { ...gl.info.memory }, render: { ...gl.info.render }, programs: gl.info.programs?.length ?? 0 }),
      camera: () => ({ position: camera.position.toArray(), quaternion: camera.quaternion.toArray() }),
      /** world-space x of every garment, grouped by the rack it hangs on (used by e2e tests) */
      racks: () => {
        const out: Record<string, { id: string; x: number }[]> = {};
        scene.traverse((o) => {
          if (o.userData.productId) (out[o.userData.garment] ??= []).push({ id: o.userData.productId, x: +o.getWorldPosition(new THREE.Vector3()).x.toFixed(3) });
        });
        return out;
      },
      /** screen position (CSS px) of a product's hit box, so tests can click the real 3D garment */
      screenPoint: (id: string) => {
        let target: THREE.Object3D | null = null;
        scene.traverse((o) => {
          if (o.userData.hitFor === id) target = o;
        });
        if (!target) return null;
        const v = (target as THREE.Object3D).getWorldPosition(new THREE.Vector3()).project(camera);
        const r = gl.domElement.getBoundingClientRect();
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      },
      capture: () => captureRef.current?.(),
    };
    return () => {
      captureRef.current = null;
    };
  }, [gl, camera, scene]);
  useFrame(() => {
    if (!pending.current.length) return;
    gl.render(scene, camera); // render then read in the same task (no preserveDrawingBuffer needed)
    const url = gl.domElement.toDataURL('image/png');
    pending.current.splice(0).forEach((r) => r(url));
  }); // default priority: a positive priority would disable R3F's automatic rendering
  return null;
}

// ---------------------------------------------------------------- procedural surfaces
function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Engraved-looking wall sign for a rack, drawn with the site's display font. */
function RackSign({ category, x }: { category: GarmentCategory; x: number }) {
  const tex = useMemo(() => {
    const fonts = getFontFamilies();
    return canvasTexture(1024, 256, (ctx) => {
      ctx.clearRect(0, 0, 1024, 256);
      ctx.fillStyle = '#2b2722';
      ctx.textAlign = 'center';
      ctx.font = `500 96px ${fonts.serif}`;
      ctx.letterSpacing = '6px';
      ctx.fillText(CATEGORY_INFO[category].plural, 512, 120);
      ctx.font = `600 30px ${fonts.sans}`;
      ctx.letterSpacing = '9px';
      ctx.fillStyle = '#8a8378';
      ctx.fillText(CATEGORY_INFO[category].blurb.toUpperCase(), 512, 190);
    });
  }, [category]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh position={[x, 2.12, WALL_Z + 0.01]}>
      <planeGeometry args={[1.6, 0.4]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} />
    </mesh>
  );
}

// ---------------------------------------------------------------- room, racks, lighting
const METAL = { color: '#2a2724', metalness: 0.85, roughness: 0.38 } as const;
const BRASS = { color: '#b0915a', metalness: 1, roughness: 0.26 } as const;

function Rack({ category }: { category: GarmentCategory }) {
  const x = rackX(category);
  return (
    <group position={[x, 0, 0]}>
      {/* plinth */}
      <mesh position={[0, 0.03, 0]} receiveShadow castShadow>
        <boxGeometry args={[RACK_HALF * 2 + 0.5, 0.06, 0.9]} />
        <meshStandardMaterial color="#d9d1c4" roughness={0.75} />
      </mesh>
      {/* uprights, top rail, base runners */}
      {[-RACK_HALF, RACK_HALF].map((ux) => (
        <group key={ux} position={[ux, 0, 0]}>
          <mesh position={[0, (RAIL_Y + 0.06) / 2 + 0.03, 0]} castShadow>
            <cylinderGeometry args={[0.013, 0.013, RAIL_Y + 0.03, 16]} />
            <meshStandardMaterial {...METAL} />
          </mesh>
          <mesh position={[0, 0.075, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.012, 0.012, 0.62, 12]} />
            <meshStandardMaterial {...METAL} />
          </mesh>
          {[-0.31, 0.31].map((z) => (
            <mesh key={z} position={[0, 0.07, z]}>
              <sphereGeometry args={[0.018, 16, 12]} />
              <meshStandardMaterial {...BRASS} />
            </mesh>
          ))}
        </group>
      ))}
      <mesh position={[0, RAIL_Y, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.012, 0.012, RACK_HALF * 2 + 0.06, 24]} />
        <meshStandardMaterial {...BRASS} />
      </mesh>
      {[-RACK_HALF - 0.03, RACK_HALF + 0.03].map((ex) => (
        <mesh key={ex} position={[ex, RAIL_Y, 0]}>
          <sphereGeometry args={[0.022, 20, 16]} />
          <meshStandardMaterial {...BRASS} />
        </mesh>
      ))}
    </group>
  );
}

/** Real CC0 PBR surfaces from Poly Haven (see docs/ASSET_CREDITS.md). */
function usePbr(prefix: string, repeat: [number, number]) {
  const maps = useTexture({ map: `/textures/${prefix}_Diffuse.jpg`, normalMap: `/textures/${prefix}_nor_gl.jpg`, roughnessMap: `/textures/${prefix}_Rough.jpg` });
  useMemo(() => {
    for (const [k, t] of Object.entries(maps)) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat[0], repeat[1]);
      t.anisotropy = 8;
      t.colorSpace = k === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.needsUpdate = true;
    }
  }, [maps, repeat]);
  return maps;
}

/** A Poly Haven prop (CC0), cloned so it can be placed more than once. */
function Prop({ name, position, rotation = 0, scale = 1 }: { name: string; position: [number, number, number]; rotation?: number; scale?: number }) {
  const { scene } = useGLTF(`/models/props/${name}.glb`);
  const root = useMemo(() => {
    const r = scene.clone(true);
    r.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.raycast = () => undefined; // decor never steals clicks from garments
      }
    });
    return r;
  }, [scene]);
  return <primitive object={root} position={position} rotation={[0, rotation, 0]} scale={scale} />;
}

/** Raised moulding frame on the wall (boutique panelling). */
function WallPanel({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const t = 0.022;
  const mat = <meshStandardMaterial color="#ebe3d7" roughness={0.75} />;
  return (
    <group position={[x, y, WALL_Z + 0.012]}>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow><boxGeometry args={[w, t, 0.02]} />{mat}</mesh>
      <mesh position={[0, -h / 2, 0]} castShadow receiveShadow><boxGeometry args={[w, t, 0.02]} />{mat}</mesh>
      <mesh position={[-w / 2, 0, 0]} castShadow receiveShadow><boxGeometry args={[t, h, 0.02]} />{mat}</mesh>
      <mesh position={[w / 2, 0, 0]} castShadow receiveShadow><boxGeometry args={[t, h, 0.02]} />{mat}</mesh>
    </group>
  );
}

const PARQUET_REPEAT: [number, number] = [22, 10];
const PLASTER_REPEAT: [number, number] = [10, 2];

function Room({ mobile }: { mobile: boolean }) {
  const floor = usePbr('herringbone_parquet', PARQUET_REPEAT);
  const plaster = usePbr('grey_plaster_03', PLASTER_REPEAT); // relief only
  const gap = (RACK_ORDER.length - 1) / 2;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 14]} />
        <meshStandardMaterial {...floor} color="#d9c3a5" roughness={0.75} envMapIntensity={0.7} />
      </mesh>
      <mesh position={[0, 3, WALL_Z]} receiveShadow>
        <planeGeometry args={[30, 6]} />
        {/* clean ivory plaster: only the surface relief of the scan, not its stains */}
        <meshStandardMaterial normalMap={plaster.normalMap} normalScale={new THREE.Vector2(0.35, 0.35)} color="#efe8dd" roughness={0.92} emissive={WALL} emissiveIntensity={0.2} />
      </mesh>
      {RACK_ORDER.map((c) => (
        <group key={c}>
          <WallPanel x={rackX(c)} y={1.45} w={2.5} h={2.2} />
          <Rack category={c} />
          <RackSign category={c} x={rackX(c)} />
          {!mobile && <spotLight position={[rackX(c), 3.6, 1.6]} target-position={[rackX(c), 1.3, 0]} angle={0.55} penumbra={0.9} intensity={5} distance={8} color="#fff0de" />}
        </group>
      ))}
      {/* skirting and cornice */}
      <mesh position={[0, 0.06, WALL_Z + 0.015]} receiveShadow>
        <boxGeometry args={[30, 0.12, 0.03]} />
        <meshStandardMaterial color="#eee7dc" roughness={0.6} />
      </mesh>
      <mesh position={[0, 3.05, WALL_Z + 0.02]}>
        <boxGeometry args={[30, 0.08, 0.04]} />
        <meshStandardMaterial color="#eee7dc" roughness={0.6} />
      </mesh>
      {/* store furniture: dressing mirror, plants between racks, lounge corners at both ends */}
      <Suspense fallback={null}>
        <Prop name="ornate_mirror_01" position={[0, 1.42, WALL_Z + 0.03]} scale={2.1} />
        {[-1, 1].map((sd) => (
          <Prop key={sd} name={sd < 0 ? 'potted_plant_02' : 'potted_plant_01'} position={[sd * RACK_GAP, 0, WALL_Z + 0.42]} rotation={sd * 0.6} scale={sd < 0 ? 1.15 : 1} />
        ))}
        {!mobile && (
          <>
            <Prop name="mid_century_lounge_chair" position={[-(gap * RACK_GAP + 2.75), 0, -0.6]} rotation={0.55} />
            <Prop name="modern_coffee_table_01" position={[-(gap * RACK_GAP + 2.05), 0, 0.15]} rotation={Math.PI / 2} />
            <Prop name="ceramic_vase_02" position={[-(gap * RACK_GAP + 2.05), 0.39, 0.15]} />
            <Prop name="mid_century_lounge_chair" position={[gap * RACK_GAP + 2.75, 0, -0.6]} rotation={-0.55} />
            <Prop name="modern_coffee_table_01" position={[gap * RACK_GAP + 2.05, 0, 0.15]} rotation={Math.PI / 2} />
            <Prop name="potted_plant_01" position={[gap * RACK_GAP + 2.9, 0, WALL_Z + 0.45]} rotation={2} />
            <Prop name="potted_plant_02" position={[-(gap * RACK_GAP + 2.9), 0, WALL_Z + 0.45]} rotation={-1} scale={1.15} />
          </>
        )}
      </Suspense>
    </group>
  );
}

function Lights({ mobile }: { mobile: boolean }) {
  const key = useRef<THREE.DirectionalLight>(null);
  // the shadow-casting key light follows the active rack: sharp shadows from a small shadow map
  useFrame((_, dt) => {
    const l = key.current;
    if (!l) return;
    const x = activeRackX();
    l.position.x = damp(l.position.x, x + 2.2, 3, dt);
    l.target.position.x = damp(l.target.position.x, x, 3, dt);
    l.target.updateMatrixWorld();
  });
  return (
    <>
      <hemisphereLight args={['#fff6ea', '#b5a28a', 0.5]} />
      <directionalLight
        ref={key}
        position={[2.2, 4.6, 3.4]}
        intensity={2.0}
        color="#fff0dc"
        castShadow
        shadow-mapSize={mobile ? [1024, 1024] : [2048, 2048]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.025}
        shadow-camera-left={-2.4}
        shadow-camera-right={2.4}
        shadow-camera-top={3}
        shadow-camera-bottom={-1}
        shadow-camera-near={1}
        shadow-camera-far={12}
        shadow-radius={5}
      />
      <directionalLight position={[-3, 2.4, 2]} intensity={0.4} color="#e9eef5" />
      {/* real interior light from a CC0 Poly Haven HDRI: believable reflections on wood, brass and fabric */}
      <Environment files="/hdri/brown_photostudio_02_1k.hdr" environmentIntensity={0.55} />
    </>
  );
}

// ---------------------------------------------------------------- rail garments
function mergeZones(base: Partial<Record<ZoneId, Layer[]>> | undefined, own: Partial<Record<ZoneId, Layer[]>> | undefined) {
  if (!base) return own;
  return { front: [...(base.front ?? []), ...(own?.front ?? [])], back: [...(base.back ?? []), ...(own?.back ?? [])] };
}

function RailItem({ product, index, rackIds }: { product: PublicProduct; index: number; rackIds: string[] }) {
  const group = useRef<THREE.Group>(null);
  const turn = useRef<THREE.Group>(null);
  const selectedId = useShowroom((s) => s.selectedId);
  const hovered = useShowroom((s) => s.hoveredId === product.id);
  const mode = useShowroom((s) => s.mode);
  const setHovered = useShowroom((s) => s.setHovered);
  const design = useDesign((s) => s.design);
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const isSelected = selectedId === product.id && mode !== 'collection';
  const cfg = product.version.modelConfig;
  const meta = cfg.source === 'template' ? TEMPLATES[product.garment] : null;
  const hit = meta ? meta.size : ([0.62, 0.8, 0.12] as const);
  const n = rackIds.length;
  // spread the rack's garments evenly, closer together when there are many
  const spacing = Math.min(product.garment === 'hoodie' ? 0.24 : 0.2, (RACK_HALF * 2 - 0.36) / Math.max(1, n - 1));
  const rx = rackX(product.garment);
  const baseX = rx + (index - (n - 1) / 2) * spacing;
  const spread = (meta ? meta.size[0] : 0.62) / 2 + 0.04 - spacing / 2;
  const sway = useMemo(() => ({ phase: index * 1.7 + rx, amp: 0.012 }), [index, rx]);

  useFrame((state, dt) => {
    const g = group.current;
    const t = turn.current;
    if (!g || !t) return;
    const st = useShowroom.getState();
    let tx = baseX;
    let ty = RAIL_Y;
    let tz = 0;
    let ry = SIDE_ANGLE + (reduced ? 0 : Math.sin(state.clock.elapsedTime * 0.6 + sway.phase) * sway.amp);
    if (isSelected) {
      tx = rx;
      ty = RAIL_Y + 0.02;
      tz = DETAIL_Z;
      // back view turns the garment (like turning a shirt on its hanger) instead of sending the
      // camera behind it, where the racks would block the view
      // sleeves: turn about 45 degrees so that sleeve faces the customer (wearer's left is the viewer's right)
      ry = st.side === 'back' ? Math.PI : st.side === 'sleeveL' ? -0.8 : st.side === 'sleeveR' ? 0.8 : 0;
    } else if (st.mode === 'collection' && st.hoveredId) {
      // the hovered garment swings to face the customer; its rack neighbours make room
      const hi = rackIds.indexOf(st.hoveredId);
      if (hi === index) ry = 0;
      else if (hi >= 0) tx += index < hi ? -Math.max(0, spread) : Math.max(0, spread);
    }
    const lambda = reduced ? 1000 : isSelected ? 4.2 : 6;
    g.position.x = damp(g.position.x, tx, lambda, dt);
    g.position.y = damp(g.position.y, ty, lambda, dt);
    g.position.z = damp(g.position.z, tz, lambda, dt);
    t.rotation.y = damp(t.rotation.y, ry, lambda, dt);
  });

  const mine = isSelected && design?.productId === product.id;
  const zones = mergeZones(product.version.baseLayers, mine ? design.zones : undefined);
  return (
    <group ref={group} position={[baseX, RAIL_Y, 0]} userData={{ productId: product.id, garment: product.garment }}>
      <group ref={turn} rotation={[0, SIDE_ANGLE, 0]}>
        <Suspense fallback={null}>
          <Garment
            config={cfg}
            colorHex={mine ? design.color.hex : product.colors[0].hex}
            zones={zones}
            baseArtwork={product.version.baseArtwork}
            atlasScale={isSelected ? 1 : 0.5}
          />
        </Suspense>
      </group>
      {/* light-weight hit volume instead of raycasting ~40k triangles per garment. It does not turn
          with the garment: on the rack it covers only this garment's slot (so a click never lands on a
          neighbour), and widens to the full garment once it has swung round to face the customer. */}
      <mesh
        position={[0, -(meta ? meta.centerDrop : cfg.centerDrop), 0]}
        visible={false}
        userData={{ hitFor: product.id }}
        onPointerOver={(e) => {
          if (useShowroom.getState().mode !== 'collection') return;
          e.stopPropagation();
          setHovered(product.id);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          if (useShowroom.getState().hoveredId === product.id) setHovered(null);
          document.body.style.cursor = '';
        }}
        onClick={(e) => {
          if (useShowroom.getState().mode !== 'collection') return;
          e.stopPropagation();
          document.body.style.cursor = '';
          openProduct(product); // loads the product's design state too, so details + Customise appear at once
        }}
      >
        <boxGeometry args={[hovered || isSelected ? hit[0] : spacing * 0.96, hit[1], 0.3]} />
      </mesh>
    </group>
  );
}

/** Translucent veil that pushes the room back when a garment is opened (cf. the video's detail screen). */
function Veil() {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const reduced = useMemo(() => prefersReducedMotion(), []);
  useFrame((_, dt) => {
    const m = mat.current;
    if (!m || !mesh.current) return;
    const target = useShowroom.getState().mode === 'collection' ? 0 : 0.9;
    m.opacity = damp(m.opacity, target, reduced ? 1000 : 5, dt);
    m.visible = m.opacity > 0.005;
    mesh.current.position.x = activeRackX();
  });
  return (
    <mesh ref={mesh} position={[0, 1.6, DETAIL_Z - 0.34]} renderOrder={1}>
      <planeGeometry args={[16, 8]} />
      <meshBasicMaterial ref={mat} color={WALL} transparent opacity={0} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/** Studio behind the garment while customising: a charcoal sweep lit by one soft spot, with the blurred
 * shadows of leaves falling across it (a gobo), so the print is judged against a calm, dark ground. */
function StudioBackdrop() {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const tex = useMemo(() => {
    const W = 1600;
    const H = 800;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;
    // only the middle of the sweep is in view, so the spot's fall-off is tight around it
    const g = ctx.createRadialGradient(W / 2, H * 0.5, 20, W / 2, H * 0.5, W * 0.26);
    g.addColorStop(0, '#77787b');
    g.addColorStop(0.55, '#3d3e41');
    g.addColorStop(1, '#121315');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // leaf shadows, drawn sharp on their own layer and laid on heavily blurred
    const leaves = document.createElement('canvas');
    leaves.width = W;
    leaves.height = H;
    const l = leaves.getContext('2d')!;
    l.fillStyle = 'rgba(6,7,8,0.85)';
    for (let i = 0; i < 520; i++) {
      // leaves gather in clusters, like branches between the lamp and the wall; only the middle of
      // the backdrop is ever in view, so that is where they fall
      const cluster = i % 9;
      const x = W * (0.3 + 0.4 * (Math.sin(cluster * 4.1) * 0.5 + 0.5)) + Math.sin(i * 12.9898) * 55;
      const y = H * (0.22 + 0.56 * (Math.cos(cluster * 2.7) * 0.5 + 0.5)) + Math.sin(i * 78.233) * 40;
      const len = 4 + ((i * 37) % 8);
      l.save();
      l.translate(x, y);
      l.rotate(i * 2.4);
      l.beginPath();
      l.ellipse(0, 0, len, len * 0.38, 0, 0, Math.PI * 2);
      l.fill();
      l.restore();
    }
    ctx.filter = 'blur(3px)';
    ctx.drawImage(leaves, 0, 0);
    ctx.filter = 'none';
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  useFrame((_, dt) => {
    const m = mat.current;
    if (!m || !mesh.current) return;
    m.opacity = damp(m.opacity, useShowroom.getState().mode === 'customize' ? 1 : 0, reduced ? 1000 : 4, dt);
    m.visible = m.opacity > 0.005;
    mesh.current.position.x = activeRackX();
  });
  return (
    <mesh ref={mesh} position={[0, 1.45, DETAIL_Z - 0.32]} renderOrder={2}>
      <planeGeometry args={[9, 4.5]} />
      <meshBasicMaterial ref={mat} map={tex} transparent opacity={0} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

// ---------------------------------------------------------------- camera
function CameraRig({ products }: { products: PublicProduct[] }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, pointer, size } = useThree();
  const mode = useShowroom((s) => s.mode);
  const nonce = useShowroom((s) => s.framingNonce);
  const animating = useRef(true);
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const target = useRef(new THREE.Vector3(rackX('half-sleeve'), 1.28, 0));
  const desired = useRef(new THREE.Vector3(rackX('half-sleeve'), 1.52, 4.35));
  const base = useRef(new THREE.Vector3());

  useEffect(() => {
    const st = useShowroom.getState();
    const p = products.find((x) => x.id === st.selectedId);
    const narrow = size.width < 768;
    if (st.mode === 'collection' || !p) {
      if (st.rack === 'all') {
        target.current.set(0, 1.25, 0);
        desired.current.set(0, 1.9, narrow ? 30 : 13.5);
      } else {
        const x = rackX(st.rack);
        // stand back like a customer walking in: floor, plinth and neighbours visible
        target.current.set(x, 1.28, 0);
        desired.current.set(x, 1.52, narrow ? 6.2 : 4.35);
      }
    } else {
      const drop = p.version.modelConfig.source === 'template' ? TEMPLATES[p.garment].centerDrop : p.version.modelConfig.centerDrop;
      const x = rackX(p.garment);
      // on wide screens in detail mode, aim right of the garment so it sits left of the info panel
      const shift = st.mode === 'detail' && !narrow ? 0.24 : 0;
      // a sleeve being designed: move in on it (the garment is turned so it faces the customer; it sits in the
      // upper part of the garment, about 20 cm to the side)
      const sleeve = st.mode === 'customize' && (st.side === 'sleeveL' || st.side === 'sleeveR') ? (st.side === 'sleeveL' ? 1 : -1) : 0;
      const sx = sleeve * 0.19;
      const sy = sleeve ? (p.garment === 'full-sleeve' || p.garment === 'hoodie' ? 0.08 : 0.16) : 0;
      target.current.set(x + shift + sx, RAIL_Y - drop + 0.02 + sy, DETAIL_Z);
      const dist = (st.mode === 'customize' ? 1.9 : 2.1) * (narrow ? 1.3 : 1) * (p.garment === 'oversized' || p.garment === 'hoodie' ? 1.08 : 1) * (sleeve ? 0.6 : 1);
      desired.current.set(x + shift + sx * 0.6, RAIL_Y - drop + 0.08 + sy, DETAIL_Z + dist);
    }
    base.current.copy(desired.current);
    animating.current = true;
  }, [mode, nonce, products, size.width]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const st = useShowroom.getState();
    if (animating.current) {
      const l = reduced ? 1000 : 2.6;
      camera.position.set(
        damp(camera.position.x, desired.current.x, l, dt),
        damp(camera.position.y, desired.current.y, l, dt),
        damp(camera.position.z, desired.current.z, l, dt),
      );
      c.target.set(damp(c.target.x, target.current.x, l, dt), damp(c.target.y, target.current.y, l, dt), damp(c.target.z, target.current.z, l, dt));
      if (camera.position.distanceTo(desired.current) < 0.003 && c.target.distanceTo(target.current) < 0.003) animating.current = false;
    } else if (st.mode === 'collection' && !reduced) {
      // gentle parallax around the framed rack
      camera.position.x = damp(camera.position.x, base.current.x + pointer.x * 0.16, 2, dt);
      camera.position.y = damp(camera.position.y, base.current.y + pointer.y * 0.05, 2, dt);
    }
    c.update();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={mode !== 'collection'}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={0.75}
      maxDistance={mode === 'collection' ? 40 : 3.4}
      minPolarAngle={Math.PI * 0.18}
      maxPolarAngle={Math.PI * 0.62}
      minAzimuthAngle={-Math.PI * 0.42}
      maxAzimuthAngle={Math.PI * 0.42}
      onStart={() => {
        animating.current = false;
      }}
    />
  );
}

export function ShowroomCanvas({ products, mobile, onError }: { products: PublicProduct[]; mobile: boolean; onError: (m: string) => void }) {
  const racks = useMemo(() => {
    const m = new Map<GarmentCategory, PublicProduct[]>(RACK_ORDER.map((c) => [c, []]));
    for (const p of products) m.get(p.garment)?.push(p);
    return m;
  }, [products]);
  return (
    <Canvas
      shadows
      dpr={mobile ? [1, 1.5] : [1, 1.75]}
      camera={{ fov: 32, near: 0.05, far: 60, position: [rackX('half-sleeve'), 1.52, 4.35] }}
      gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1.0, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.domElement.setAttribute('role', 'img');
        gl.domElement.setAttribute('aria-label', '3D boutique with garment racks. Hover a garment to turn it, click to inspect.');
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault();
          onError('The 3D view lost its graphics context. Reload the page to continue.');
        });
      }}
      onPointerMissed={() => useShowroom.getState().setHovered(null)}
    >
      <color attach="background" args={[WALL]} />
      <fog attach="fog" args={[WALL, 12, 34]} />
      <Lights mobile={mobile} />
      <Room mobile={mobile} />
      {RACK_ORDER.map((c) => {
        const list = racks.get(c) ?? [];
        const ids = list.map((p) => p.id);
        return (
          <group key={c}>
            {list.map((p, i) => (
              <RailItem key={p.id} product={p} index={i} rackIds={ids} />
            ))}
          </group>
        );
      })}
      <Veil />
      <StudioBackdrop />
      <CameraRig products={products} />
      <CaptureBridge />
    </Canvas>
  );
}

for (const c of RACK_ORDER) useGLTF.preload(templateUrl(c));
for (const p of ['ornate_mirror_01', 'potted_plant_01', 'potted_plant_02']) useGLTF.preload(`/models/props/${p}.glb`);
