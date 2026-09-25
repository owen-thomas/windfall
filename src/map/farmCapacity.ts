/**
 * Every tracked farm's installed capacity, known without a live reading: the
 * same static BM unit list the curtailment endpoint tracks (api/_lib/bmus.ts,
 * the registry's `generationCapacity` per unit), summed per farm. It lets the
 * bar, its "13,105 MW installed" and the farm list stay on the page while a
 * reading is pending or unavailable (Owen) — capacity is the one thing about
 * the fleet that doesn't need Elexon to answer.
 */
import { SCOTTISH_WIND_BMUS } from '../../api/_lib/bmus';

export const FARM_CAPACITY_MW: ReadonlyMap<string, number> = (() => {
  const byFarm = new Map<string, number>();
  for (const unit of Object.values(SCOTTISH_WIND_BMUS)) {
    byFarm.set(unit.farm, (byFarm.get(unit.farm) ?? 0) + unit.capacityMW);
  }
  return byFarm;
})();

/** The whole tracked fleet's installed capacity, MW. */
export const INSTALLED_MW = [...FARM_CAPACITY_MW.values()].reduce((sum, mw) => sum + mw, 0);
