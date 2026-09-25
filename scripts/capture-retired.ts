/**
 * Retirement capture for the case study (25 September 2026): `/` (the
 * original dashboard) and `/flow` (the flow experiment), taken from the
 * deployed site just before /map replaces the index and /flow is removed —
 * so the process evidence survives the pages themselves.
 *
 * Captured from production, not a dev server, per the capture pack's own rule
 * (DECISIONS 269: "the capture pack comes from these deployed screens").
 * `index-curtailing-desktop.png` is reached via `?state=curtailing` and is a
 * fixture demonstration (DECISIONS 486's labelling rule); every other plate is
 * whatever the grid was doing at capture time.
 *
 * Run with: npx tsx scripts/capture-retired.ts
 */

import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(ROOT, 'capture/case-study/retired');
const BASE = 'https://www.windfall.scot';

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 375, height: 812 };

/** The dashboard settles once its feeds land; the flow needs time to develop on screen. */
const INDEX_SETTLE_MS = 8_000;
const FLOW_SETTLE_MS = 20_000;

interface Plate {
  file: string;
  path: string;
  viewport: { width: number; height: number };
  settleMs: number;
  fullPage: boolean;
  mobile?: boolean;
}

const PLATES: Plate[] = [
  { file: 'index-live-desktop.png', path: '/', viewport: DESKTOP, settleMs: INDEX_SETTLE_MS, fullPage: true },
  { file: 'index-live-mobile.png', path: '/', viewport: MOBILE, settleMs: INDEX_SETTLE_MS, fullPage: true, mobile: true },
  {
    file: 'index-curtailing-desktop.png',
    path: '/?state=curtailing',
    viewport: DESKTOP,
    settleMs: INDEX_SETTLE_MS,
    fullPage: true,
  },
  { file: 'flow-desktop.png', path: '/flow/', viewport: DESKTOP, settleMs: FLOW_SETTLE_MS, fullPage: false },
  { file: 'flow-mobile.png', path: '/flow/', viewport: MOBILE, settleMs: FLOW_SETTLE_MS, fullPage: false, mobile: true },
];

async function capture(browser: Browser, plate: Plate) {
  const context = await browser.newContext({
    viewport: plate.viewport,
    deviceScaleFactor: 2,
    isMobile: plate.mobile ?? false,
    hasTouch: plate.mobile ?? false,
  });
  const page = await context.newPage();
  await page.goto(`${BASE}${plate.path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(plate.settleMs);
  await page.screenshot({ path: join(OUT_DIR, plate.file), fullPage: plate.fullPage });
  await context.close();
  console.log(`  ${plate.file}`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    console.log(`Capturing ${BASE} into ${OUT_DIR}`);
    for (const plate of PLATES) await capture(browser, plate);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
