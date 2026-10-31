// Downloads the background-removal model used for product photos on busy backgrounds:
// BiRefNet-lite (MIT licence) — https://huggingface.co/onnx-community/BiRefNet_lite-ONNX
// It runs locally on the server; photos are never sent anywhere. ~115 MB, kept out of git.
// Usage: node scripts/assets/fetch-cutout-model.mjs
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const REPO = 'onnx-community/BiRefNet_lite-ONNX';
const DIR = path.join('models', REPO);
const FILES = ['config.json', 'preprocessor_config.json', 'onnx/model_fp16.onnx'];

for (const f of FILES) {
  const out = path.join(DIR, f);
  if (existsSync(out) && statSync(out).size > 0) {
    console.log('have', f);
    continue;
  }
  mkdirSync(path.dirname(out), { recursive: true });
  const res = await fetch(`https://huggingface.co/${REPO}/resolve/main/${f}`);
  if (!res.ok || !res.body) throw new Error(`${f}: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(out));
  console.log('got', f, `${(statSync(out).size / 1e6).toFixed(1)} MB`);
}
