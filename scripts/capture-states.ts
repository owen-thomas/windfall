/**
 * Reference-plate capture for /map (Windfall_Map_Spec.md step 3b Part C).
 *
 * The Claude Browser pane used for day-to-day preview work has no
 * screenshot-to-disk primitive, so this dev-only Playwright script is the
 * documented fallback: spin up a throwaway Vite dev server, drive a real
 * Chromium against it, and write PNGs straight to capture/case-study/.
 * Meant to be reused for the step 7 capture pack, not a one-off.
 *
 * Six of the seven plates are *fixture* demonstrations reached via
 * `?state=`, not a captured live transition (DECISIONS 020's labelling
 * rule, carried into the pack's own INDEX.md). `live.png` is the honest
 * exception: a plain load of `/map/`, no `state` param, against whatever
 * the grid is actually doing at capture time — the same convention the
 * existing `/` capture pack under capture/case-study/ uses.
 *
 * Run with: npx tsx scripts/capture-states.ts
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(ROOT, 'capture/case-study/map/step-3');
const PORT = 5199;
const BASE = `http://localhost:${PORT}`;

/** The six fixture states, reached via `?state=`. `live` is captured separately, below — see the module docs. */
const FIXTURE_STATES = ['curtailing', 'calm', 'degraded', 'stale', 'waiting', 'offline'];

/** Let the flow develop on screen before capturing — per the task's "about twenty seconds after load". */
const SETTLE_MS = 20_000;

function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      fetch(url)
        .then(() => resolve())
        .catch(() => {
          if (Date.now() > deadline) reject(new Error(`dev server did not answer within ${timeoutMs}ms`));
          else setTimeout(tryOnce, 300);
        });
    };
    tryOnce();
  });
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`Starting Vite dev server on port ${PORT}...`);
  const server: ChildProcess = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'pipe',
  });
  server.on('error', (err) => {
    console.error('Failed to start dev server:', err);
    process.exit(1);
  });

  try {
    await waitForServer(BASE);
    console.log('Dev server ready.');

    const browser = await chromium.launch();

    // Desktop: live first (plain load, no state param — whatever the grid
    // is actually doing), then the six fixture states.
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    console.log('Capturing live...');
    await desktop.goto(`${BASE}/map/`, { waitUntil: 'networkidle' });
    await desktop.waitForTimeout(SETTLE_MS);
    await desktop.screenshot({ path: join(OUT_DIR, 'live.png') });

    for (const state of FIXTURE_STATES) {
      const url = `${BASE}/map/?state=${state}&dev=1`;
      console.log(`Capturing ${state}...`);
      await desktop.goto(url, { waitUntil: 'networkidle' });
      await desktop.waitForTimeout(SETTLE_MS);
      await desktop.screenshot({ path: join(OUT_DIR, `${state}.png`) });
    }
    await desktop.close();

    // Mobile: curtailing only, for reference (Part C).
    const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
    console.log('Capturing mobile-curtailing...');
    await mobile.goto(`${BASE}/map/?state=curtailing&dev=1`, { waitUntil: 'networkidle' });
    await mobile.waitForTimeout(SETTLE_MS);
    await mobile.screenshot({ path: join(OUT_DIR, 'mobile-curtailing.png') });
    await mobile.close();

    await browser.close();
    console.log(`Wrote ${FIXTURE_STATES.length + 2} plates to ${OUT_DIR}`);
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
