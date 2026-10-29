'use client';
// Admin-only model preview with the asymmetric mapping test pattern. Used to verify a print
// profile before customisation is enabled, and to generate the catalogue preview image.
import { Bounds, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { Component, Suspense, useEffect, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import type { Layer, ModelConfig, ZoneId } from '@/lib/types';
import { Garment } from '../three/Garment';

export const MAPPING_TEST: Record<ZoneId, Layer[]> = {
  front: [
    { id: 'tfl', type: 'text', text: 'FRONT LEFT', font: 'sans', fontSize: 0.08, fill: '#c0392b', weight: 700, letterSpacing: 0.02, x: 0.3, y: 0.25, rotation: 0, scale: 1, opacity: 1 },
    { id: 'tfa', type: 'text', text: '↑ TOP', font: 'sans', fontSize: 0.06, fill: '#1f4e79', weight: 700, letterSpacing: 0, x: 0.5, y: 0.08, rotation: 0, scale: 1, opacity: 1 },
  ],
  back: [
    { id: 'tbc', type: 'text', text: 'BACK CENTER', font: 'sans', fontSize: 0.08, fill: '#1e7a46', weight: 700, letterSpacing: 0.02, x: 0.5, y: 0.25, rotation: 0, scale: 1, opacity: 1 },
    { id: 'tbr', type: 'text', text: 'R →', font: 'sans', fontSize: 0.06, fill: '#1f4e79', weight: 700, letterSpacing: 0, x: 0.85, y: 0.6, rotation: 0, scale: 1, opacity: 1 },
  ],
};

class ErrorBoundary extends Component<{ children: ReactNode; onError: (m: string) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: Error) {
    this.props.onError(e.message);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function CaptureHook({ onReady }: { onReady: (fn: () => string) => void }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    onReady(() => {
      gl.render(scene, camera);
      return gl.domElement.toDataURL('image/png');
    });
  }, [gl, scene, camera, onReady]);
  return null;
}

export function AdminPreview({ config, baseArtwork, baseLayers, showTest, onCapture, initialSide = 'front', colorHex = '#ece8df' }: {
  config: ModelConfig;
  baseArtwork?: Partial<Record<ZoneId, string>>;
  baseLayers?: Partial<Record<ZoneId, Layer[]>>;
  showTest: boolean;
  initialSide?: ZoneId;
  colorHex?: string;
  onCapture: (fn: () => string) => void;
}) {
  const [side, setSide] = useState<ZoneId>(initialSide);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <div className="relative h-[420px] border border-line bg-bone" data-testid="admin-preview">
        {error ? (
          <p role="alert" className="p-4 text-sm text-danger">The model could not be rendered: {error}</p>
        ) : (
          <Canvas camera={{ fov: 30, position: [0, 0, 2.4] }} gl={{ preserveDrawingBuffer: true, toneMapping: THREE.NeutralToneMapping }} dpr={[1, 1.5]}>
            <color attach="background" args={['#ece8e1']} />
            <hemisphereLight args={['#fff6ea', '#b5a691', 1]} />
            <directionalLight position={[1.5, 2.5, 3]} intensity={2} />
            <Environment resolution={128} frames={1}>
              <Lightformer form="rect" intensity={2} scale={[5, 3, 1]} position={[0, 4, 2]} rotation-x={Math.PI / 2} />
            </Environment>
            <ErrorBoundary onError={setError}>
              <Suspense fallback={null}>
                <Bounds fit clip observe margin={1.15}>
                  <group rotation={[0, side === 'back' ? Math.PI : 0, 0]}>
                    <Garment config={config} colorHex={colorHex} zones={showTest ? MAPPING_TEST : baseLayers} baseArtwork={baseArtwork} />
                  </group>
                </Bounds>
              </Suspense>
            </ErrorBoundary>
            <OrbitControls makeDefault enablePan={false} />
            <CaptureHook onReady={onCapture} />
          </Canvas>
        )}
      </div>
      <div className="mt-2 flex gap-1">
        <button className="chip" aria-pressed={side === 'front'} onClick={() => setSide('front')} data-testid="admin-preview-front">Front</button>
        <button className="chip" aria-pressed={side === 'back'} onClick={() => setSide('back')} data-testid="admin-preview-back">Back</button>
      </div>
    </div>
  );
}
