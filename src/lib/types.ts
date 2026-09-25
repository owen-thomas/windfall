/**
 * Wire types shared between the serverless functions and the client.
 *
 * Two rules govern these shapes:
 *
 * 1. Every response carries `fetchedAt`. Staleness is computed from that
 *    field, never from when the client received the response — a CDN hit
 *    can be minutes old, and inside the stale-while-revalidate window it
 *    can be older still. The payload timestamp is the only honest clock.
 *
 * 2. Upstream failure is data, not an HTTP status. The functions return 200
 *    with health flags and whatever they managed to fetch, so one dead
 *    source cannot poison a cacheable response or blank a working element.
 */

import type { SettlementRef } from './settlement.js';

export type SourceHealth = 'ok' | 'partial' | 'failed';

export interface Fuel {
  fuel: string;
  perc: number;
}

export interface Intensity {
  forecast: number | null;
  actual: number | null;
  index: string | null;
}

export interface RegionState {
  regionId: number;
  name: string;
  intensity: Intensity;
  generationMix: Fuel[];
  windPct: number;
  gasPct: number;
}

export interface NationalState {
  intensity: Intensity;
  generationMix: Fuel[];
  windPct: number;
  gasPct: number;
}

export interface ForecastPoint {
  from: string;
  to: string;
  forecast: number | null;
  index: string | null;
}

/** The regions the paradox needs: wind in the north, gas in the south. */
export interface RegionalState {
  scotland: RegionState | null;
  northScotland: RegionState | null;
  southScotland: RegionState | null;
  southEngland: RegionState | null;
  southEastEngland: RegionState | null;
  /**
   * England as a whole, published directly by Carbon Intensity (regionid 15)
   * — the map page's England mix (Windfall_Map_Spec.md §2, decision 3 in
   * DECISIONS 021: not South England, which reads as cherry-picked, and not
   * a modelled England-and-Wales blend, which 021 found isn't a stable
   * weighted sum of the published country figures). `/` keeps using
   * `southEngland`/`southEastEngland`; this is additive.
   */
  england: RegionState | null;
}

export interface GridResponse {
  fetchedAt: string;
  settlement: SettlementRef;
  health: {
    overall: SourceHealth;
    national: SourceHealth;
    regional: SourceHealth;
    forecast: SourceHealth;
  };
  errors: string[];
  national: NationalState | null;
  regions: RegionalState | null;
  forecast: ForecastPoint[] | null;
}

export interface CurtailedUnit {
  id: string;
  name: string;
  farm: string;
  capacityMW: number;
  /** Instantaneous shortfall: declared level minus instructed level, MW. */
  curtailedMW: number;
}

export interface CurtailedFarm {
  farm: string;
  name: string;
  curtailedMWh: number;
}

/**
 * Per-farm instantaneous output, rolled up from every tracked unit at that
 * farm — not only units with an acceptance. `declaredMW` is a declaration
 * (physical notification), not a metered reading; the map's per-farm figures
 * are honest only if copy never calls this "generating" (Windfall_Map_Spec.md
 * §4.3). `instructedMW` is `declaredMW − curtailedMW`: what the farm is
 * actually being allowed to put out, and the honest quantity to drive the
 * flow visual with. Units with no PN at the sampled instant are excluded
 * from `declaredMW` and counted only in `unitsDeclaring`.
 */
export interface FarmNow {
  farm: string;
  capacityMW: number;
  declaredMW: number;
  instructedMW: number;
  curtailedMW: number;
  unitsDeclaring: number;
  unitsCurtailed: number;
}

/**
 * Instantaneous curtailment. MW is a true "right now" measurement — it does
 * not accumulate, so it carries no mid-period undercount.
 */
export interface CurtailmentNow {
  settlement: SettlementRef;
  /** Instant the levels were sampled at. */
  sampledAt: string;
  curtailedMW: number;
  unitsCurtailed: number;
  units: CurtailedUnit[];
  /** Every tracked farm's declared/instructed/curtailed output at `sampledAt` — see FarmNow's own docs. */
  farms: FarmNow[];
}

/**
 * Settled curtailment for the last complete period. MWh only becomes
 * meaningful once the period has closed and all acceptances have landed.
 */
export interface CurtailmentSettled {
  settlement: SettlementRef;
  curtailedMWh: number;
  unitsCurtailed: number;
  farms: CurtailedFarm[];
}

export interface CurtailmentResponse {
  fetchedAt: string;
  health: {
    overall: SourceHealth;
    now: SourceHealth;
    settled: SourceHealth;
  };
  errors: string[];
  now: CurtailmentNow | null;
  settled: CurtailmentSettled | null;
  /** Provenance for the method note. The figure is a floor, and says so. */
  method: {
    basis: string;
    unitsTracked: number;
    capacityMW: number;
  };
}
