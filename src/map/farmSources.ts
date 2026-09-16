/**
 * /map's sources, built from data (Windfall_Map_Spec.md §5.1/Part E) —
 * `farms.json` (scripts/build-farms.ts) joined to the live `farms` payload
 * (`CurtailmentNow.farms`, api/_lib/elexon.ts) by farm name.
 */
import type { Source } from '../flow/types';
import type { FarmNow } from '../lib/types';
import { DEFAULT_RATE_PARAMS, rateForMW, type RateParams } from './rate';
import farmsData from './data/farms.json';

export interface FarmSite {
  farm: string;
  latLon: [number, number];
  offshore: boolean;
  repdRef?: string;
  source?: string;
  /**
   * [lat, lon] where this farm's export cable comes ashore — step 3,
   * Windfall_Map_Spec.md Part A.4. Present for every farm not on the
   * mainland (the 7 offshore farms, plus the 2 island farms below).
   */
  landing?: [number, number];
  /** Citation for `landing` — see DECISIONS.md 024. */
  landingSource?: string;
  /** Name of the gb-countries.json `islands` ring this farm's `latLon` sits on — set only for Viking (Shetland Mainland) and Edinbane (Skye). */
  island?: string;
  /**
   * Short place-name for `landing`, for on-map captions (Windfall_Map_Spec.md
   * step 3b Part A, DECISIONS.md 025) — set only for the two island farms,
   * the only ones that can currently fall off a projection's fit and need
   * their landing named in a caption rather than just used as a coordinate.
   */
  landingName?: string;
}

export const FARM_SITES = farmsData as FarmSite[];

export type FarmMarkerState = 'declaring' | 'held-down' | 'silent';

/** A farm with no PN at the sampled instant is silent (§4.3's "blind" units); otherwise held down if any of its curtailment is nonzero, else plainly declaring. Never colour alone — see markers.ts's shape/hatch carriers. */
export function markerStateFor(now: FarmNow | undefined): FarmMarkerState {
  if (!now || now.unitsDeclaring === 0) return 'silent';
  if (now.curtailedMW > 0) return 'held-down';
  return 'declaring';
}

/**
 * True when a farm's own island isn't part of the current projection's fit
 * — the Shetland-inset rule (Windfall_Map_Spec.md step 3b Part A, DECISIONS
 * 025): a farm on an island that isn't drawn can't be born on land that
 * isn't there, so it degrades to emitting from its landing instead (see
 * `buildFarmSources` below). `availableIslands` omitted means every island
 * is in the fit (true-extent mode, and every non-`/map` caller) — nothing is
 * ever off-fit in that case. Written once here so the rule is generic over
 * any farm that names an `island`, not special-cased to Viking.
 */
export function isOffMainFit(site: FarmSite, availableIslands?: ReadonlySet<string>): boolean {
  return site.island !== undefined && availableIslands !== undefined && !availableIslands.has(site.island);
}

/**
 * One-line caption for a farm currently shown only in an inset, off the main
 * stage (Windfall_Map_Spec.md step 3b Part A.2/A.3): "the inset carries a
 * one-line label saying its output enters the mainland at [landing]."
 * Generic over any farm with a `landingName`, not a Viking-specific string.
 */
export function landingCaption(site: FarmSite): string {
  return `${site.farm}'s output enters the mainland at ${site.landingName ?? 'the mainland'}.`;
}

/**
 * One flow Source per tracked farm. `palette` is the farm's own name — see
 * palette.ts's `hueOffsetForChannel`, which hashes any channel string it
 * doesn't recognise from /flow's curated seven into a small, stable offset,
 * exactly what 76 farms need. Rates start at the floor; `applyFarmRates`
 * below fills them in on the first landing.
 *
 * A farm whose island is off the current fit (`isOffMainFit`) is built as
 * the spec's snap-with-connector fallback, done honestly: `latLon` is its
 * `landing` — the same point any ordinary mainland farm would sit at — with
 * no `offshore`/`islandName`, so `buildWorld` never tries to paint a
 * corridor to, or rasterize, land that this fit doesn't draw. It is a plain
 * mainland source, not a special case threaded through the field or the
 * mask (Windfall_Map_Spec.md step 3b Part A.2).
 */
export function buildFarmSources(
  sites: FarmSite[] = FARM_SITES,
  availableIslands?: ReadonlySet<string>,
): Source[] {
  return sites.map((site) => {
    if (isOffMainFit(site, availableIslands)) {
      return {
        id: site.farm,
        name: site.farm,
        latLon: site.landing!,
        type: 'wind',
        rate: DEFAULT_RATE_PARAMS.floor,
        palette: site.farm,
      };
    }
    return {
      id: site.farm,
      name: site.farm,
      latLon: site.latLon,
      type: 'wind',
      rate: DEFAULT_RATE_PARAMS.floor,
      palette: site.farm,
      offshore: site.offshore,
      landing: site.landing,
      islandName: site.island,
    };
  });
}

/**
 * Mutates every source's `rate` in place from a fresh `farms` landing —
 * call `ParticleSystem.refreshRates()` afterwards so the next spawn picks
 * it up (same "mutate then refresh" convention /flow's own per-source
 * sliders use — see controls.ts). A farm absent from `farmsNow` (a
 * degraded/offline/waiting fixture, which carries no curtailment payload at
 * all) reads as 0 MW instructed, i.e. the floor — not a stale, previously
 * fetched, still-declaring rate.
 */
export function applyFarmRates(
  sources: Source[],
  farmsNow: FarmNow[] | null | undefined,
  rateParams: RateParams = DEFAULT_RATE_PARAMS,
): void {
  const byFarm = new Map((farmsNow ?? []).map((f) => [f.farm, f]));
  for (const source of sources) {
    const now = byFarm.get(source.id);
    source.rate = rateForMW(now?.instructedMW ?? 0, now?.capacityMW ?? 0, rateParams);
  }
}
