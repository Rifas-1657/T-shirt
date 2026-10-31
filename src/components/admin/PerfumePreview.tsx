'use client';
// Admin preview of a perfume bottle with the saved spec (same Bottle component as the salon).
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import * as THREE from 'three';
import { BOTTLES } from '@/lib/perfume';
import type { PerfumeSpec } from '@/lib/types';
import { Bottle } from '../perfume/Bottle';

export default function PerfumePreview({ title, spec }: { title: string; spec: PerfumeSpec }) {
  const h = BOTTLES[spec.bottle].height;
  return (
    <div className="h-[380px] border border-line bg-[#2a0712]" data-testid="perfume-preview">
      <Canvas camera={{ fov: 32, position: [0, h * 0.6, 0.45] }} gl={{ toneMapping: THREE.ACESFilmicToneMapping }} dpr={[1, 1.5]}>
        <color attach="background" args={['#2a0712']} />
        <spotLight position={[0.5, 1, 0.8]} intensity={6} angle={0.5} penumbra={0.8} />
        <Environment resolution={128} frames={1}>
          <Lightformer form="rect" intensity={3} scale={[3, 1, 1]} position={[0, 2, 1]} rotation-x={Math.PI / 2} />
          <Lightformer form="rect" intensity={2.2} scale={[0.5, 2, 1]} position={[1.6, 0.6, 0.4]} rotation-y={-Math.PI / 2} />
          <Lightformer form="rect" intensity={2.2} color="#ffd6de" scale={[0.5, 2, 1]} position={[-1.6, 0.6, 0.4]} rotation-y={Math.PI / 2} />
        </Environment>
        <Suspense fallback={null}>
          <Bottle key={`${spec.bottle}-${title}`} title={title} spec={spec} />
        </Suspense>
        <ContactShadows position={[0, 0, 0]} opacity={0.6} scale={0.5} blur={2.4} far={0.3} />
        <OrbitControls makeDefault target={[0, h * 0.45, 0]} enablePan={false} minDistance={0.2} maxDistance={0.8} autoRotate autoRotateSpeed={1.2} />
      </Canvas>
    </div>
  );
}
