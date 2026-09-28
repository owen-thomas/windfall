/**
 * The v2.0 capture pack: the map, now the index, in every state (Windfall_Map_Spec.md
 * step 7, "Capture pack updated with the map states").
 *
 * Captured from production, not a dev server, per the pack's own rule
 * (DECISIONS 269: "the capture pack comes from these deployed screens"). The
 * `live` plates are whatever the grid is doing at capture time; every other
 * state is a fixture reached via `?state=` and is labelled as one in INDEX.md
 * (DECISIONS 486). A fixture load shows the state toggle in the footer, as it
 * does for any visitor with `?state=`, so the plates keep it: it is the
 * on-screen sign that the reading is a fixture.
 *
 * Run with: npx tsx scripts/capture-map.ts [filter]
 * A filter keeps only the plates whose filename contains it.
 */

import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(ROOT, 'capture/case-study/map/v2.0');
const BASE = 'https://www.windfall.scot';

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 375, height: 812 };

/** Long enough for the entrance to finish and the flow to develop across the island. */
const SETTLE_MS = 20_000;

interface Plate {
  file: string;
  path: string;
  mobile?: boolean;
  /** Runs after the page settles, before the screenshot. */
  act?: (page: Page) => Promise<void>;
}

const FIXTURES = ['curtailing', 'calm', 'degraded', 'stale', 'waiting', 'offline'];

const PLATES: Plate[] = [
  { file: 'live-desktop.png', path: '/' },
  { file: 'live-mobile.png', path: '/', mobile: true },
  ...FIXTURES.map((state) => ({ file: `${state}-desktop.png`, path: `/?state=${state}` })),
  { file: 'curtailing-mobile.png', path: '/?state=curtailing', mobile: true },
  { file: 'calm-mobile.png', path: '/?state=calm', mobile: true },
  {
    file: 'curtailing-method-open-desktop.png',
    path: '/?state=curtailing',
    act: async (page) => {
      await page.click('.map-settlement__summary');
      await page.waitForTimeout(1_000);
    },
  },
  {
    file: 'curtailing-farm-selected-desktop.png',
    path: '/?state=curtailing',
    // A farm with some wind on the grid and some held back, so the plate shows
    // its thread picked out. The fixture's first farm, Seagreen, is fully held
    // back, and a farm with nothing on the grid has no particles to pick out (038).
    act: async (page) => {
      await page.click('.source-row[data-farm="Beatrice"]');
      await page.waitForTimeout(3_000);
    },
  },
];

async function capture(browser: Browser, plate: Plate) {
  const context = await browser.newContext({
    viewport: plate.mobile ? MOBILE : DESKTOP,
    deviceScaleFactor: 2,
    isMobile: plate.mobile ?? false,
    hasTouch: plate.mobile ?? false,
  });
  const page = await context.newPage();
  await page.goto(`${BASE}${plate.path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(SETTLE_MS);
  if (plate.act) await plate.act(page);
  // Desktop fits the viewport; the phone's single column runs long, so take all of it.
  await page.screenshot({ path: join(OUT_DIR, plate.file), fullPage: plate.mobile ?? false });
  await context.close();
  console.log(`  ${plate.file}`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    console.log(`Capturing ${BASE} into ${OUT_DIR}`);
    const filter = process.argv[2];
    for (const plate of PLATES.filter((p) => !filter || p.file.includes(filter))) await capture(browser, plate);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
