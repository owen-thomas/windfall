/**
 * Gate check for step 2 (Windfall_Map_Spec.md Part B): every farm in
 * api/_lib/bmus.ts must have a src/map/data/farms.json entry with a
 * coordinate, and every farms.json entry must name a real tracked farm. A
 * farm without a coordinate is a data bug, not a display fallback, so this
 * exits non-zero rather than warning.
 *
 * Run with: npx tsx scripts/check-farms.ts (wired to `npm run farms:check`).
 */
import { SCOTTISH_WIND_BMUS } from '../api/_lib/bmus';
import farms from '../src/map/data/farms.json';

function isFiniteLatLon(latLon: unknown): latLon is [number, number] {
  return (
    Array.isArray(latLon) &&
    latLon.length === 2 &&
    latLon.every((n) => typeof n === 'number' && Number.isFinite(n))
  );
}

function main() {
  const bmuFarms = new Set(Object.values(SCOTTISH_WIND_BMUS).map((u) => u.farm));
  const farmEntries = new Map(farms.map((f) => [f.farm, f]));

  const problems: string[] = [];

  for (const farm of bmuFarms) {
    const entry = farmEntries.get(farm);
    if (!entry) {
      problems.push(`"${farm}" is tracked in bmus.ts but has no farms.json entry.`);
      continue;
    }
    if (!isFiniteLatLon(entry.latLon)) {
      problems.push(`"${farm}"'s farms.json entry has no valid [lat, lon] coordinate.`);
    }
  }

  for (const entry of farms) {
    if (!bmuFarms.has(entry.farm)) {
      problems.push(`farms.json names "${entry.farm}", which is not a farm tracked in bmus.ts.`);
    }
  }

  if (problems.length > 0) {
    console.error(`farms:check FAILED — ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  console.log(`farms:check PASSED — ${bmuFarms.size} tracked farms, all with a farms.json coordinate.`);
}

main();
