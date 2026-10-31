// Design editing state with undo/redo. Continuous gestures (drag/transform) update `design` live
// and are committed to history once, when the gesture ends.
import { create } from 'zustand';
import type { Design, Layer, ProductColor, ZoneId } from '@/lib/types';

const HISTORY_LIMIT = 80;

interface DesignState {
  design: Design | null;
  activeZone: ZoneId;
  selectedId: string | null;
  past: Design[];
  future: Design[];
  gestureStart: Design | null;
  load: (d: Design) => void;
  clear: () => void;
  setZone: (z: ZoneId) => void;
  select: (id: string | null) => void;
  /** Apply a change as one undoable step. */
  commit: (fn: (d: Design) => Design) => void;
  beginGesture: () => void;
  /** Live update during a gesture (not recorded until endGesture). */
  live: (fn: (d: Design) => Design) => void;
  endGesture: () => void;
  undo: () => void;
  redo: () => void;
  // convenience operations
  addLayer: (layer: Layer) => void;
  updateLayer: (id: string, patch: Partial<Layer>) => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  moveLayer: (id: string, dir: 1 | -1) => void;
  setColor: (c: ProductColor) => void;
  setSize: (s: string) => void;
}

export const layerId = () => `l${Math.random().toString(36).slice(2, 10)}`;

function mapZone(d: Design, zone: ZoneId, fn: (layers: Layer[]) => Layer[]): Design {
  return { ...d, zones: { ...d.zones, [zone]: fn(d.zones[zone] ?? []) } };
}

export const useDesign = create<DesignState>((set, get) => ({
  design: null,
  activeZone: 'front',
  selectedId: null,
  past: [],
  future: [],
  gestureStart: null,
  load: (d) => set({ design: d, past: [], future: [], selectedId: null, activeZone: 'front' }),
  clear: () => set({ design: null, past: [], future: [], selectedId: null }),
  setZone: (z) => set({ activeZone: z, selectedId: null }),
  select: (id) => set({ selectedId: id }),
  commit: (fn) => {
    const { design, past } = get();
    if (!design) return;
    const next = fn(design);
    if (next === design) return;
    set({ design: next, past: [...past, design].slice(-HISTORY_LIMIT), future: [] });
  },
  beginGesture: () => set({ gestureStart: get().design }),
  live: (fn) => {
    const { design } = get();
    if (design) set({ design: fn(design) });
  },
  endGesture: () => {
    const { gestureStart, design, past } = get();
    if (gestureStart && design && gestureStart !== design)
      set({ past: [...past, gestureStart].slice(-HISTORY_LIMIT), future: [], gestureStart: null });
    else set({ gestureStart: null });
  },
  undo: () => {
    const { past, design, future } = get();
    if (!past.length || !design) return;
    set({ design: past[past.length - 1], past: past.slice(0, -1), future: [design, ...future], selectedId: null });
  },
  redo: () => {
    const { past, design, future } = get();
    if (!future.length || !design) return;
    set({ design: future[0], future: future.slice(1), past: [...past, design], selectedId: null });
  },
  addLayer: (layer) => {
    const zone = get().activeZone;
    get().commit((d) => mapZone(d, zone, (ls) => [...ls, layer]));
    set({ selectedId: layer.id });
  },
  updateLayer: (id, patch) => {
    const zone = get().activeZone;
    get().commit((d) => mapZone(d, zone, (ls) => ls.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l))));
  },
  removeLayer: (id) => {
    const zone = get().activeZone;
    get().commit((d) => mapZone(d, zone, (ls) => ls.filter((l) => l.id !== id)));
    if (get().selectedId === id) set({ selectedId: null });
  },
  duplicateLayer: (id) => {
    const zone = get().activeZone;
    const src = get().design?.zones[zone]?.find((l) => l.id === id);
    if (!src) return;
    const copy = { ...src, id: layerId(), x: Math.min(src.x + 0.05, 0.95), y: Math.min(src.y + 0.05, 0.95) };
    get().commit((d) => mapZone(d, zone, (ls) => [...ls, copy]));
    set({ selectedId: copy.id });
  },
  moveLayer: (id, dir) => {
    const zone = get().activeZone;
    get().commit((d) =>
      mapZone(d, zone, (ls) => {
        const i = ls.findIndex((l) => l.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= ls.length) return ls;
        const next = ls.slice();
        [next[i], next[j]] = [next[j], next[i]];
        return next;
      }),
    );
  },
  setColor: (c) => get().commit((d) => ({ ...d, color: c })),
  setSize: (s) => get().commit((d) => ({ ...d, size: s })),
}));
