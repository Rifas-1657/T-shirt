// Validation for artwork/photo uploads (customer artwork and admin product images).
// Checks the real file signature (not the browser-supplied MIME type), size, pixel dimensions,
// and sanitises SVG with DOMPurify before anything is stored or served.
import DOMPurify from 'isomorphic-dompurify';
import sharp from 'sharp';

export const IMAGE_LIMITS = {
  maxBytes: 8 * 1024 * 1024,
  maxSvgBytes: 512 * 1024,
  minPx: 32,
  maxPx: 6000,
};

export type ImageKind = 'png' | 'jpeg' | 'svg';

export interface ImageCheck {
  ok: boolean;
  errors: string[];
  kind?: ImageKind;
  width?: number;
  height?: number;
  /** Bytes to store: the original for raster images, the sanitised markup for SVG. */
  data?: Buffer;
  contentType?: string;
}

export function sniffKind(buf: Buffer): ImageKind | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  const head = buf.subarray(0, 1024).toString('utf8').replace(/^﻿/, '').trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return 'svg';
  return null;
}

export function sanitizeSvg(markup: string): string {
  return DOMPurify.sanitize(markup, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'foreignObject', 'iframe', 'image', 'use', 'a', 'animate', 'set', 'style'],
    FORBID_ATTR: ['href', 'xlink:href', 'style'],
  });
}

export async function validateImage(buf: Buffer): Promise<ImageCheck> {
  const errors: string[] = [];
  const kind = sniffKind(buf);
  if (!kind) return { ok: false, errors: ['Unsupported file type. Upload a PNG, JPEG or SVG image.'] };
  const limit = kind === 'svg' ? IMAGE_LIMITS.maxSvgBytes : IMAGE_LIMITS.maxBytes;
  if (buf.length > limit) errors.push(`File is ${(buf.length / 1048576).toFixed(2)} MB; the limit for ${kind.toUpperCase()} is ${(limit / 1048576).toFixed(1)} MB.`);
  let data = buf;
  if (kind === 'svg') {
    const clean = sanitizeSvg(buf.toString('utf8'));
    if (!/<svg[\s>]/i.test(clean)) return { ok: false, errors: ['SVG could not be sanitised into a valid image.'] };
    data = Buffer.from(clean, 'utf8');
  }
  let width = 0;
  let height = 0;
  try {
    const meta = await sharp(data, { limitInputPixels: IMAGE_LIMITS.maxPx * IMAGE_LIMITS.maxPx }).metadata();
    width = meta.width ?? 0;
    height = meta.height ?? 0;
  } catch (e) {
    errors.push(`Image could not be decoded: ${(e as Error).message}`);
  }
  if (width && height) {
    if (kind !== 'svg' && (width < IMAGE_LIMITS.minPx || height < IMAGE_LIMITS.minPx))
      errors.push(`Image is ${width}x${height}px; at least ${IMAGE_LIMITS.minPx}px per side is required.`);
    if (width > IMAGE_LIMITS.maxPx || height > IMAGE_LIMITS.maxPx)
      errors.push(`Image is ${width}x${height}px; the maximum is ${IMAGE_LIMITS.maxPx}px per side.`);
  } else if (!errors.length) errors.push('Image has no readable dimensions.');
  const contentType = kind === 'svg' ? 'image/svg+xml' : `image/${kind}`;
  return { ok: errors.length === 0, errors, kind, width, height, data, contentType };
}
