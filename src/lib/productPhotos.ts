// Which photo of a product is shown, and at what real-world size.
import type { PerfumeSpec, ProductPhoto } from './types';

/** The image customers see for a photo: the cut-out when there is one and it is switched on. */
export const shownUrl = (ph: ProductPhoto) => (ph.useCutout && ph.cutoutUrl ? ph.cutoutUrl : ph.url);
export const isCutout = (ph: ProductPhoto) => !!(ph.useCutout && ph.cutoutUrl);

/** Approximate bottle height in metres from its volume (a 100 ml flacon stands about 15 cm tall). */
export function bottleHeight(spec?: PerfumeSpec) {
  const ml = spec?.volumeMl ?? 100;
  return Math.min(0.24, Math.max(0.09, 0.15 * Math.cbrt(ml / 100)));
}
