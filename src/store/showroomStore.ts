// UI/scene state for the showroom: which garment is hovered/selected and which view is active.
import { create } from 'zustand';
import type { GarmentCategory } from '@/lib/types';

export type Mode = 'collection' | 'detail' | 'customize';
export type Side = 'front' | 'back';
export type RackView = GarmentCategory | 'all';

interface ShowroomState {
  mode: Mode;
  hoveredId: string | null;
  selectedId: string | null;
  side: Side;
  /** Which rack the collection camera frames ('all' = overview of every rack). */
  rack: RackView;
  /** Category (rack) of the open product, so the scene can frame it. */
  selectedGarment: GarmentCategory | null;
  /** Incremented to ask the camera rig to re-frame (reset view / side change). */
  framingNonce: number;
  setHovered: (id: string | null) => void;
  setRack: (r: RackView) => void;
  open: (id: string) => void;
  customize: () => void;
  back: () => void;
  setSide: (s: Side) => void;
  resetView: () => void;
}

export const useShowroom = create<ShowroomState>((set, get) => ({
  mode: 'collection',
  hoveredId: null,
  selectedId: null,
  side: 'front',
  rack: 'half-sleeve',
  selectedGarment: null,
  framingNonce: 0,
  setHovered: (id) => set({ hoveredId: id }),
  setRack: (r) => set({ rack: r, hoveredId: null, framingNonce: get().framingNonce + 1 }),
  open: (id) => set({ mode: 'detail', selectedId: id, side: 'front', framingNonce: get().framingNonce + 1 }),
  customize: () => set({ mode: 'customize', framingNonce: get().framingNonce + 1 }),
  back: () => {
    const m = get().mode;
    if (m === 'customize') set({ mode: 'detail', framingNonce: get().framingNonce + 1 });
    else set({ mode: 'collection', selectedId: null, side: 'front', framingNonce: get().framingNonce + 1 });
  },
  setSide: (s) => set({ side: s, framingNonce: get().framingNonce + 1 }),
  resetView: () => set({ framingNonce: get().framingNonce + 1 }),
}));
