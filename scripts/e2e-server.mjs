// Starts an isolated production server for Playwright: fresh data dir, seeded catalogue.
import { spawn, spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
const dataDir = process.env.ATELIER_DATA_DIR ?? 'data-e2e';
rmSync(dataDir, { recursive: true, force: true });
const seed = spawnSync(process.execPath, ['scripts/seed.ts'], { stdio: 'inherit', env: { ...process.env, ATELIER_DATA_DIR: dataDir } });
if (seed.status !== 0) process.exit(seed.status ?? 1);
const next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', process.env.PORT ?? '3100'], {
  stdio: 'inherit',
  env: { ...process.env, ATELIER_DATA_DIR: dataDir },
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => next.kill(sig));
next.on('exit', (c) => process.exit(c ?? 0));
