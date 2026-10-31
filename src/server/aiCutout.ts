// AI background removal for product photos that are not on a plain background (a bottle on a table,
// flowers behind it…). Model: BiRefNet-lite (MIT), downloaded once by `npm run models` into ./models and
// run locally on the CPU with onnxruntime in a worker process — photos never leave the server. One photo
// takes ~20 s, so photos are processed one at a time in the background and the product updates when done.
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import readline from 'node:readline';
import path from 'node:path';
import sharp from 'sharp';
import type { CutoutResult } from './productCutout';

const REPO = 'onnx-community/BiRefNet_lite-ONNX';
const MODEL_DIR = path.resolve('models');
const MODEL_FILE = path.join(MODEL_DIR, REPO, 'onnx', 'model_fp16.onnx');

export const aiCutoutAvailable = () => existsSync(MODEL_FILE);

// The model runs in a child process (scripts/ai/cutout-worker.mjs) so a 20-second cut-out never blocks
// the web server; the worker is started on first use and kept alive.
let worker: ChildProcess | null = null;
const waiting = new Map<string, (r: { ok: boolean; error?: string }) => void>();
function getWorker() {
  if (worker && worker.exitCode === null) return worker;
  const w = spawn(process.execPath, [path.resolve('scripts/ai/cutout-worker.mjs'), MODEL_DIR, REPO], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
  readline.createInterface({ input: w.stdout! }).on('line', (line) => {
    try {
      const msg = JSON.parse(line);
      waiting.get(msg.id)?.(msg);
      waiting.delete(msg.id);
    } catch {
      // not a protocol line (library logging)
    }
  });
  w.on('exit', () => {
    for (const done of waiting.values()) done({ ok: false, error: 'The cut-out worker stopped.' });
    waiting.clear();
    worker = null;
  });
  worker = w;
  return w;
}

// the model holds about a gigabyte of memory: stop the worker after two idle minutes
let idle: ReturnType<typeof setTimeout> | null = null;
function scheduleIdleStop() {
  if (idle) clearTimeout(idle);
  idle = setTimeout(() => {
    if (!waiting.size) worker?.kill();
  }, 120_000);
  idle.unref?.();
}

function segmentOnce(input: string, output: string) {
  return new Promise<{ ok: boolean; error?: string }>((resolve) => {
    const id = randomUUID();
    waiting.set(id, (r) => {
      scheduleIdleStop();
      resolve(r);
    });
    getWorker().stdin!.write(`${JSON.stringify({ id, input, output })}\n`);
  });
}

/** One retry in a fresh worker: a failure is most often a temporary shortage of memory. */
async function segment(input: string, output: string) {
  const first = await segmentOnce(input, output);
  if (first.ok) return first;
  worker?.kill();
  await new Promise((r) => setTimeout(r, 1500));
  return segmentOnce(input, output);
}

const median = (v: number[]) => (v.length ? v.slice().sort((a, b) => a - b)[v.length >> 1] : 0);

/** Cuts the main product out of any photo; trims to it with a little padding and finds its accent colour. */
export async function aiCutout(input: Buffer): Promise<CutoutResult> {
  if (!aiCutoutAvailable()) return { ok: false, reason: 'The AI cut-out model is not installed (npm run models).' };
  const dir = await mkdtemp(path.join(tmpdir(), 'atelier-cutout-'));
  let rgba: Buffer;
  let w: number;
  let h: number;
  try {
    await writeFile(path.join(dir, 'in'), input);
    const r = await segment(path.join(dir, 'in'), path.join(dir, 'out.png'));
    if (!r.ok) return { ok: false, reason: `The AI cut-out failed: ${r.error}` };
    const raw = await sharp(path.join(dir, 'out.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    [rgba, w, h] = [raw.data, raw.info.width, raw.info.height];
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  let x0 = w, y0 = h, x1 = -1, y1 = -1, solid = 0;
  const sat: { s: number; c: number[] }[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (rgba[i + 3] < 128) continue;
      solid++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if ((x + y) % 3 === 0) {
        const c = [rgba[i], rgba[i + 1], rgba[i + 2]];
        sat.push({ s: Math.max(...c) - Math.min(...c), c });
      }
    }
  if (solid / (w * h) < 0.02) return { ok: false, reason: 'No product was found in the photo.' };
  sat.sort((a, b) => b.s - a.s);
  const top = sat.slice(0, Math.max(1, sat.length >> 2));
  const accent = [0, 1, 2].map((k) => median(top.map((t) => t.c[k])));
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03);
  const left = Math.max(0, x0 - pad);
  const topY = Math.max(0, y0 - pad);
  const width = Math.min(w, x1 + pad + 1) - left;
  const height = Math.min(h, y1 + pad + 1) - topY;
  const png = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).extract({ left, top: topY, width, height }).png().toBuffer();
  return { ok: true, png, width, height, accentColor: '#' + accent.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('') };
}

// --------------------------------------------------------------------------- background queue
type Job = { key: string; run: () => Promise<void> };
const queue: Job[] = [];
const queued = new Set<string>();
let busy = false;

/** Runs jobs one at a time (the model is CPU-heavy); the same key is never queued twice. */
export function enqueueCutout(key: string, run: () => Promise<void>) {
  if (queued.has(key)) return;
  queued.add(key);
  queue.push({ key, run });
  void drain();
}

async function drain() {
  if (busy) return;
  busy = true;
  try {
    for (let job = queue.shift(); job; job = queue.shift()) {
      try {
        await job.run();
      } catch (e) {
        console.error('[ai-cutout]', job.key, (e as Error).message);
      } finally {
        queued.delete(job.key);
      }
    }
  } finally {
    busy = false;
  }
}
