/**
 * Builds the social sharing image, public/og.png, from the real page — so the
 * type, palette, farm markers and flow are exactly what a visitor sees, not a
 * separate illustration kept in step by hand.
 *
 * Evergreen by design: the live headline ("At least 38% …") would be stale
 * within the half hour, so the image carries the site's title and a line on
 * what it shows instead, and no figures. The map is the `curtailing` fixture
 * (a mix of farms on the grid and held back), with the flow given time to
 * develop. The bar, list, footer and panels are hidden for the capture only.
 *
 * 1200×630 at 2× (2400×1260); index.html's og:image dimensions match.
 *
 * Run with: npx tsx scripts/build-og.ts
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'public/og.png');
const PORT = 5198;
const BASE = `http://localhost:${PORT}`;
const FLOW_SETTLE_MS = 16_000;

const CSS = `
  .map-sources, .map-settlement, .map-foot, .toggle, .panel, .map__inset-box { display: none !important; }
  /* Thumbnail scale: the title has to read at a few hundred pixels wide. */
  .map-headline__sentence { font-size: 3.5rem !important; line-height: 1.08 !important; max-width: 30rem; }
  .og-sub {
    margin: 1.25rem 0 0;
    max-width: 26rem;
    font-family: var(--font-body);
    font-size: 1.25rem;
    font-weight: var(--wt-light, 300);
    line-height: 1.4;
    color: var(--text-primary);
  }
  .og-key {
    display: flex;
    gap: 1.5rem;
    margin: 1.75rem 0 0;
    font-family: var(--font-display);
    font-size: 1rem;
    color: var(--text-primary);
  }
  .og-key span { display: inline-flex; align-items: center; gap: 0.5rem; }
  .og-key i { display: inline-block; width: 0.8rem; height: 0.8rem; border-radius: 50%; }
`;

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
  const server: ChildProcess = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  try {
    await waitForServer(BASE);
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
    await page.goto(`${BASE}/?state=curtailing`, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: CSS });
    await page.evaluate(() => {
      const h1 = document.querySelector('.map-headline__sentence');
      if (!h1) throw new Error('headline not found');
      h1.textContent = 'Scotland’s wind, switched off.';
      const sub = document.createElement('p');
      sub.className = 'og-sub';
      sub.textContent = 'How much of Scotland’s wind is held back from the grid, every half hour.';
      const key = document.createElement('p');
      key.className = 'og-key';
      key.innerHTML =
        '<span><i style="background:var(--bar-on)"></i>On the grid</span>' +
        '<span><i style="background:var(--bar-off);box-shadow:inset 0 0 0 1.5px var(--held-text)"></i>Held back</span>';
      h1.after(sub, key);
    });
    await page.waitForTimeout(FLOW_SETTLE_MS);
    await page.screenshot({ path: OUT });
    await browser.close();
    console.log(`Wrote ${OUT}`);
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
