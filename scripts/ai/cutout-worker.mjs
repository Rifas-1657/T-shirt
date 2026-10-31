// Background-removal worker, run as a child process of the web server so the CPU-heavy model never blocks
// requests. Protocol: one JSON object per line on stdin {id, input, output}; it replies on stdout with
// {id, ok, width, height} or {id, ok:false, error}. `output` receives a full-size RGBA PNG (product kept,
// background transparent). The model loads once and stays in memory.
import { availableParallelism } from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { env, pipeline, RawImage } from '@huggingface/transformers';
import sharp from 'sharp';

const [modelDir, repo] = process.argv.slice(2);
env.localModelPath = path.resolve(modelDir) + path.sep;
env.allowRemoteModels = false; // never download at runtime

const threads = Math.max(1, availableParallelism() - 2); // leave cores for the web server
// no memory arena: it reserves far more RAM than one photo needs
const segmenter = pipeline('background-removal', repo, { dtype: 'fp16', device: 'cpu', session_options: { intraOpNumThreads: threads, enableCpuMemArena: false } });
const reply = (o) => process.stdout.write(JSON.stringify(o) + '\n');

let chain = Promise.resolve();
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  chain = chain.then(async () => {
    let job;
    try {
      job = JSON.parse(line);
      const { data, info } = await sharp(job.input).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const res = await (await segmenter)(new RawImage(new Uint8ClampedArray(data), info.width, info.height, 3));
      const out = Array.isArray(res) ? res[0] : res;
      await sharp(Buffer.from(out.data.buffer, out.data.byteOffset, out.data.byteLength), { raw: { width: out.width, height: out.height, channels: 4 } }).png().toFile(job.output);
      reply({ id: job.id, ok: true, width: out.width, height: out.height });
    } catch (e) {
      reply({ id: job?.id, ok: false, error: e.message });
    }
  });
});
