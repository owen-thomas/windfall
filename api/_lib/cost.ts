/**
 * What holding back Scotland's tracked wind has cost bill payers so far today
 * — an estimate (DECISIONS 052).
 *
 * Holding wind back costs the system twice, as NESO counts its constraint
 * costs: once in the bids accepted to turn the farms down, and again in the
 * offers accepted to replace the power they didn't make. Both reach bills
 * through the balancing charge (BSUoS).
 *
 *   net payments  Elexon's indicative BMU cashflows (EBOCF) for the tracked
 *                 units' accepted bids, per half hour: measured. Positive is
 *                 paid to a farm; some farms pay to be turned down (Moray East
 *                 about £30–45/MWh through September 2026), so the net can be
 *                 negative.
 *   replacement   the tracked units' bid volume flagged as a system action
 *                 (DISPTAV's "Tagged" share: taken for the network, not to
 *                 balance supply and demand — 93–96% of it through September
 *                 2026) — the energy that had to come from elsewhere — priced
 *                 at that half hour's flagged offers from generators outside
 *                 Scotland, each unit at its own average offer price (EBOCF ÷
 *                 DISPTAV), weighted by its flagged volume: a proxy. It isn't
 *                 the specific offers that replaced this wind; interconnector
 *                 trades outside the balancing mechanism aren't counted.
 *
 * DISPTAV splits each unit's accepted volume between four types (Original,
 * Original-Priced, Re-priced, Tagged) that sum to the whole. "Outside
 * Scotland" is every unit not in the two transmission loss factor zones the
 * tracked wind units mostly sit in, read from Elexon's registry each time, so
 * a new tariff year's values follow.
 *
 * Settlement data trails each half hour by 20–45 minutes and is revised in
 * later runs, so the figure runs to the last half hour Elexon has settled.
 */
import { SCOTTISH_WIND_SET } from './bmus.js';
import { fetchJson } from './http.js';
import { periodBounds } from '../../src/lib/settlement.js';
import type { CostToday } from '../../src/lib/types.js';

const BASE = 'https://data.elexon.co.uk/bmrs/api/v1/balancing/settlement/indicative';
const REGISTRY = 'https://data.elexon.co.uk/bmrs/api/v1/reference/bmunits/all';
/** Each day file is 1–2.5 MB; the default 8s is tight on a cold upstream. */
const TIMEOUT_MS = 15_000;

interface CashflowRow {
  settlementPeriod: number;
  nationalGridBmUnit: string | null;
  totalCashflow: number | null;
}

interface VolumeRow {
  settlementPeriod: number;
  nationalGridBmUnit: string | null;
  dataType: string;
  totalVolumeAccepted: number | null;
}

interface RegistryUnit {
  nationalGridBmUnit: string | null;
  transmissionLossFactor: string | null;
}

async function day<T>(kind: 'cashflows' | 'volumes', side: 'bid' | 'offer', date: string): Promise<T[]> {
  const body = await fetchJson<{ data?: T[] }>(`${BASE}/${kind}/all/${side}/${date}`, TIMEOUT_MS);
  return body.data ?? [];
}

/** Every unit in the loss factor zones most tracked wind units sit in: Scotland's two. */
async function scottishUnits(): Promise<Set<string>> {
  const registry = await fetchJson<RegistryUnit[]>(REGISTRY, TIMEOUT_MS);
  const zones = new Map<string, number>();
  for (const u of registry) {
    if (u.nationalGridBmUnit && SCOTTISH_WIND_SET.has(u.nationalGridBmUnit) && u.transmissionLossFactor) {
      zones.set(u.transmissionLossFactor, (zones.get(u.transmissionLossFactor) ?? 0) + 1);
    }
  }
  const scottish = new Set([...zones.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([z]) => z));
  return new Set(
    registry
      .filter((u) => u.nationalGridBmUnit && u.transmissionLossFactor && scottish.has(u.transmissionLossFactor))
      .map((u) => u.nationalGridBmUnit!)
  );
}

const key = (period: number, unit: string) => `${period}|${unit}`;

/** Today's estimate so far, or null if Elexon has settled nothing of today yet. */
export async function fetchCostToday(date: string): Promise<CostToday | null> {
  const [bidCash, bidVol, offerCash, offerVol, scotland] = await Promise.all([
    day<CashflowRow>('cashflows', 'bid', date),
    day<VolumeRow>('volumes', 'bid', date),
    day<CashflowRow>('cashflows', 'offer', date),
    day<VolumeRow>('volumes', 'offer', date),
    scottishUnits(),
  ]);

  const net = new Map<number, number>();
  for (const r of bidCash) {
    if (!r.nationalGridBmUnit || !SCOTTISH_WIND_SET.has(r.nationalGridBmUnit)) continue;
    net.set(r.settlementPeriod, (net.get(r.settlementPeriod) ?? 0) + (r.totalCashflow ?? 0));
  }
  const periods = [...net.keys()];
  if (periods.length === 0) return null;

  // Held back, and the flagged part of it that had to be replaced. Bid
  // volumes are negative (energy below the declaration).
  const held = new Map<number, number>();
  const replaced = new Map<number, number>();
  for (const r of bidVol) {
    if (!r.nationalGridBmUnit || !SCOTTISH_WIND_SET.has(r.nationalGridBmUnit)) continue;
    const mwh = -(r.totalVolumeAccepted ?? 0);
    held.set(r.settlementPeriod, (held.get(r.settlementPeriod) ?? 0) + mwh);
    if (r.dataType === 'Tagged') replaced.set(r.settlementPeriod, (replaced.get(r.settlementPeriod) ?? 0) + mwh);
  }

  // Each offering unit's average price per half hour, and its flagged volume.
  const unitPounds = new Map<string, number>();
  for (const r of offerCash) {
    if (r.nationalGridBmUnit) unitPounds.set(key(r.settlementPeriod, r.nationalGridBmUnit), r.totalCashflow ?? 0);
  }
  const unitMWh = new Map<string, number>();
  const unitFlagged = new Map<string, number>();
  for (const r of offerVol) {
    if (!r.nationalGridBmUnit) continue;
    const k = key(r.settlementPeriod, r.nationalGridBmUnit);
    const mwh = r.totalVolumeAccepted ?? 0;
    unitMWh.set(k, (unitMWh.get(k) ?? 0) + mwh);
    if (r.dataType === 'Tagged' && !scotland.has(r.nationalGridBmUnit)) unitFlagged.set(k, (unitFlagged.get(k) ?? 0) + mwh);
  }
  // Per half hour: flagged-volume-weighted price of flagged offers outside Scotland.
  const pricePounds = new Map<number, number>();
  const priceMWh = new Map<number, number>();
  for (const [k, flagged] of unitFlagged) {
    const total = unitMWh.get(k) ?? 0;
    if (!(flagged > 0) || !(total > 0)) continue;
    const period = Number(k.split('|')[0]);
    pricePounds.set(period, (pricePounds.get(period) ?? 0) + ((unitPounds.get(k) ?? 0) / total) * flagged);
    priceMWh.set(period, (priceMWh.get(period) ?? 0) + flagged);
  }
  let dayPounds = 0;
  let dayMWh = 0;
  for (const [p, mwh] of priceMWh) {
    dayPounds += pricePounds.get(p) ?? 0;
    dayMWh += mwh;
  }
  // A half hour with no flagged offers outside Scotland takes the day's price so far.
  const dayPrice = dayMWh > 0 ? dayPounds / dayMWh : 0;

  let netPayments = 0;
  let replacement = 0;
  let heldBack = 0;
  for (const p of periods) {
    const offered = priceMWh.get(p) ?? 0;
    const price = offered > 0 ? (pricePounds.get(p) ?? 0) / offered : dayPrice;
    netPayments += net.get(p) ?? 0;
    replacement += Math.max(0, replaced.get(p) ?? 0) * Math.max(0, price);
    heldBack += Math.max(0, held.get(p) ?? 0);
  }

  const through = Math.max(...periods);
  return {
    date,
    throughPeriod: through,
    throughTime: periodBounds(date, through).end.toISOString(),
    estimatePounds: Math.round(netPayments + replacement),
    netPaymentsPounds: Math.round(netPayments),
    replacementPounds: Math.round(replacement),
    heldBackMWh: Math.round(heldBack),
  };
}
