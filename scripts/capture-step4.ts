/**
 * Gate capture for map step 4 (Windfall_Map_Spec.md §6, DECISIONS 027):
 * the seven states, the swatch plate, the border tooltip in its three
 * reveal modes, the method note expanded, and the card-vs-wash panel pair.
 * Mirrors scripts/capture-states.ts's own approach (a throwaway Vite dev
 * server + a real Chromium, since the Claude Browser pane used for day-to-
 * day preview work has no screenshot-to-disk primitive) but scoped to this
 * step's specific gate list rather than the seven-state reference plates
 * alone.
 *
 * Run with: npx tsx scripts/capture-step4.ts
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(ROOT, 'capture/case-study/map/step-4');
const PORT = 5198;
const BASE = `http://localhost:${PORT}`;

const FIXTURE_STATES = ['curtailing', 'calm', 'degraded', 'stale', 'waiting', 'offline'];
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
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    console.log('Capturing live...');
    await page.goto(`${BASE}/map/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: join(OUT_DIR, 'live.png') });

    for (const state of FIXTURE_STATES) {
      console.log(`Capturing ${state}...`);
      await page.goto(`${BASE}/map/?state=${state}&dev=1`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(SETTLE_MS);
      await page.screenshot({ path: join(OUT_DIR, `${state}.png`) });
    }

    // Card vs wash (Part B.3, DECISIONS 027) — captured on the curtailing
    // fixture, which has the fullest panel set on screen.
    console.log('Capturing panel treatment pair...');
    await page.goto(`${BASE}/map/?state=curtailing&dev=1`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: join(OUT_DIR, 'panels-wash.png') });
    await page.keyboard.press('c');
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT_DIR, 'panels-card.png') });
    await page.keyboard.press('c'); // back to wash before continuing

    // Method note expanded.
    console.log('Capturing method note expanded...');
    await page.click('.method__summary');
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT_DIR, 'method-note-expanded.png') });

    // Border tooltip: hover, tap/click, keyboard focus (Part A.5).
    console.log('Capturing border tooltip — hover...');
    await page.goto(`${BASE}/map/?state=curtailing&dev=1`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(SETTLE_MS);
    await page.hover('.map__border-hit');
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT_DIR, 'border-tooltip-hover.png') });

    console.log('Capturing border tooltip — tap...');
    await page.goto(`${BASE}/map/?state=curtailing&dev=1`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(SETTLE_MS);
    await page.click('.map__border-hit');
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT_DIR, 'border-tooltip-tap.png') });

    console.log('Capturing border tooltip — keyboard focus...');
    await page.goto(`${BASE}/map/?state=curtailing&dev=1`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(SETTLE_MS);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT_DIR, 'border-tooltip-focus.png') });

    await page.close();

    // Swatch plate — full page, since it scrolls.
    console.log('Capturing swatch plate...');
    const platePage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await platePage.goto(`${BASE}/map/?plate=tokens`, { waitUntil: 'networkidle' });
    await platePage.waitForTimeout(500);
    await platePage.screenshot({ path: join(OUT_DIR, 'swatch-plate.png'), fullPage: true });
    await platePage.close();

    await browser.close();
    console.log(`Wrote plates to ${OUT_DIR}`);
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
