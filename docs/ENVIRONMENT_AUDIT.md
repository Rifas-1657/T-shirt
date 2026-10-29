# Environment audit

Audited 2026-10-29 on the user's Windows machine, inside a Claude desktop app (Code tab) session.

## Repository (before this work)

| Item | Finding |
|---|---|
| Git | Not a git repository. No existing app, package manager config, routes, APIs or tests. |
| Files present | `Tshirt_Luxury_3D_Customizer_MASTER_PROMPT.md`, `assets/source/cloth_rack.glb`, `references/videos/Transform your clothing store … .mp4` |
| Decision | New project → stack from spec §5 (Next.js + React + TS + Tailwind + R3F/Drei + React Konva + Zustand + Playwright/Vitest). |

## Tool versions (detected)

| Tool | Version / status |
|---|---|
| Node.js | 24.14.0 (runs `scripts/seed.ts` natively via type stripping) |
| npm | 11.9.0 (project package manager, `package-lock.json`) |
| Python | 3.11.9 |
| Git | 2.50.1.windows.1 |
| Blender | **5.2.3 LTS** at `C:\Program Files\Blender Foundation\Blender 5.2\` (not on PATH; scripts locate it, override with `BLENDER_PATH`) |
| FFmpeg | git build 2026-04-30 (gyan.dev essentials) at `C:\ffmpeg\bin` — used for video frame extraction |
| gltf-transform CLI | 4.5.1 (global) — used for the rack derivatives |
| Playwright Chromium | chromium-1248 already installed in `%LOCALAPPDATA%\ms-playwright` |
| GPU (as seen by Chromium/ANGLE) | AMD Radeon Graphics, Direct3D11 |
| Disk | **C: 476 GB, ~17 GB free (97 % used)** — enough for this project (node_modules ≈ 0.5 GB) but tight; see blockers. |
| Model | Claude Opus 5.5 (`claude-opus-5-5`) — the session's model. |
| Claude Code CLI | `claude` is not on PATH in the shell; this session runs inside the desktop app. |

## Installed dependencies (exact, locked in package-lock.json)

next 16.4.3 · react/react-dom 19.3.1 · three 0.186.1 · @react-three/fiber 9.8.2 · @react-three/drei 10.7.9 · konva 10.9.0 · react-konva 19.3.2 · zustand 5.0.16 · @gltf-transform/{core,functions,extensions} 4.5.1 · meshoptimizer 1.3.0 · sharp 0.35.5 · isomorphic-dompurify 4.6.0 · tailwindcss 4.3.3 · typescript 5.9.3 (7.0 exists but 5.9 chosen for tool compatibility) · vitest 5.0.5 · @playwright/test 1.64.1 · eslint-config-next 16.4.3.
Peer ranges were checked before install (`@react-three/fiber` requires react `>=19 <19.4`; `react-konva` requires react `^19.3.0`). `npm install` reported 0 vulnerabilities.

## Environment variables

`.env.local` (git-ignored) was generated with random values. Values are not reproduced here.

| Variable | Present |
|---|---|
| `ADMIN_PASSWORD` | yes (random, in `.env.local`) |
| `ADMIN_SESSION_SECRET` | yes (64 hex chars, in `.env.local`) |
| `ATELIER_DATA_DIR` | not set (defaults to `./data`) |

## Plugins, skills and MCP

| Item | Source / trust | Result |
|---|---|---|
| **frontend-design** | Anthropic Directory, publisher Anthropic | Suggested via the install card; the user enabled it on their claude.ai account. **Not loaded in this already-running session** (verified: no tools appear). Active in new sessions. |
| **context7** | Anthropic Directory, partner (Upstash), remote MCP | Same as above: enabled on the account, not loaded in this session, so no harmless read-only call could be made. Library versions were instead verified with `npm view`. |
| **playwright** (MCP) | Anthropic Directory, partner (Microsoft) | Same: enabled on the account, not loaded here. Browser testing used the `@playwright/test` npm package (same engine), which is the project's committed test runner anyway. |
| Superpowers | Anthropic Directory, partner (obra) | **Not installed**: "privileged" reach with a SessionStart hook, and adds nothing this project needs. |
| **img2threejs** | npm `img2threejs@0.1.1`, Apache-2.0, single maintainer, repo github.com/img2threejs/img2threejs | **Evaluated, not installed.** Its installer writes skill files into agent hosts; it rebuilds props procedurally from a still image and cannot recover a garment mesh. No procedural props were needed. |
| Blender MCP | — | **Not enabled.** Reproducible headless Blender scripts (`scripts/blender/*.py`) cover inspection and template building without giving an LLM arbitrary code execution inside Blender. |
| 3DAssets.dev MCP | — | Not used: no additional props were required, and every asset has a verified licence (see ASSET_CREDITS.md). |
| Built-in browser (Claude desktop) | first-party | Connected, but **the pane was hidden**, which freezes `requestAnimationFrame`/`ResizeObserver` (measured: no rAF in 1 s), so WebGL could not render there. All visual QA used Playwright Chromium (GPU-backed ANGLE/D3D11) instead. |
| Local skills used | `built-in-browser` (loaded) | — |

## Assets found

| File | Size | SHA-256 | Notes |
|---|---|---|---|
| `assets/source/cloth_rack.glb` | 36,653,780 B | `0eded0d0e2aab0521a72befb253c20307ee528b9e293c89aa3aaf9de0ab803da` | Unchanged after all processing (hash re-checked after building derivatives). See GLB_DIAGNOSTIC.md: **it is a coat rack, not a T-shirt.** |
| `references/videos/…mp4` | 4,233,405 B | — | 31.5 s, 720×1280 portrait, H.264 + AAC. See VIDEO_REFERENCE_ANALYSIS.md. |

## Changes made to the environment

- Project files created in this folder only. `npm install` into `./node_modules`.
- **Side effect to clean up:** the first Blender inspection run used a relative output path inside Blender and wrote four renders to `C:\docs\glb-inspection\`. The files were moved into `docs/glb-inspection/`; the now-empty folders `C:\docs\glb-inspection` and `C:\docs` remain because removing a top-level `C:\` folder was blocked by a safety check. Delete them manually if they are not yours. The script now resolves absolute paths.
