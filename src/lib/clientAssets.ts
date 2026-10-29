'use client';
// Browser-side helpers: font families for canvas text, and a shared image cache for artwork.
import { DEFAULT_FONTS, type FontFamilies } from './atlasRenderer';

let fonts: FontFamilies | null = null;

/** Resolves next/font CSS variables into concrete family lists usable by Canvas2D and Konva. */
export function getFontFamilies(): FontFamilies {
  if (fonts) return fonts;
  if (typeof document === 'undefined') return DEFAULT_FONTS;
  const cs = getComputedStyle(document.documentElement);
  const read = (v: string, fallback: string) => {
    const val = cs.getPropertyValue(v).trim();
    return val ? `${val}, ${fallback}` : fallback;
  };
  fonts = {
    serif: read('--font-serif', DEFAULT_FONTS.serif),
    sans: read('--font-sans', DEFAULT_FONTS.sans),
    mono: read('--font-mono', DEFAULT_FONTS.mono),
  };
  return fonts;
}

const cache = new Map<string, Promise<HTMLImageElement>>();
const loaded = new Map<string, HTMLImageElement>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  let p = cache.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = () => {
        loaded.set(src, img);
        resolve(img);
      };
      img.onerror = () => {
        cache.delete(src);
        reject(new Error(`Could not load ${src}`));
      };
      img.src = src;
    });
    cache.set(src, p);
  }
  return p;
}

export function loadedImages(): Map<string, CanvasImageSource> {
  return loaded;
}

export function getLoadedImage(src: string): HTMLImageElement | undefined {
  return loaded.get(src);
}

let measureCtx: CanvasRenderingContext2D | null = null;
export function measureContext(): CanvasRenderingContext2D {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')!;
  return measureCtx;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
