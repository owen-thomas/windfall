/**
 * NESO data portal — how much the Scotland–England border (boundary B6,
 * `SCOTEX` in NESO's constraint data) can carry.
 *
 * There is no published live or outturn flow across the border (checked
 * 2026-09-28, see DECISIONS 046), so the page shows the limit, not the flow.
 * Two NESO datasets, in order of preference:
 *
 *   1. 24 Months Ahead Constraint Limits — a planned limit per boundary per
 *      week, updated monthly. NESO doesn't define its week numbers; they read
 *      as ISO weeks (week 40 of 2026 starts Monday 28 September), except that
 *      a year runs 52 → 1 with no week 53. Each monthly file starts a few
 *      weeks after it is published, so for part of every month the current
 *      week isn't in it.
 *   2. Day Ahead Constraint Flows and Limits — a half-hourly limit set at day
 *      ahead, weekdays only, so days behind. When (1) has no row for this
 *      week, the latest day's limits are averaged and dated.
 *
 * Its `Flow_MW` is deliberately unused: it runs over the limit in 38% of
 * 2026's half hours, so it is a pre-constraint forecast, not a flow.
 */
import { fetchJson } from './http.js';
import type { BorderLimit } from '../../src/lib/types.js';

const API = 'https://api.neso.energy/api/3/action/datastore_search';
const PLANNED_RESOURCE = '3c359e33-3dac-4bdd-87d1-efbf4cbc2f07';
const DAY_AHEAD_RESOURCE = '38a18ec1-9e40-465d-93fb-301e80fd1352';

/**
 * The border's maximum capacity, MW: NESO's Operational Transparency Forum,
 * "Transparency | Network Congestion", Max. Capacity for B6 (SCOTEX) — 6,800
 * in the 19 June 2024, 17 December 2025 and 22 July 2026 decks (p. 26 of the
 * last). NESO's ETYS gives a boundary capability of 6.7 GW; the operational
 * figure is the one the limits are set against.
 */
export const BORDER_MAX_MW = 6800;

interface Datastore<T> {
  result: { records: T[] };
}

/** ISO week-numbering year and week of a date. */
function isoWeek(at: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return { year: d.getUTCFullYear(), week: Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7) };
}

/** Monday and Sunday of an ISO week, YYYY-MM-DD. */
function weekDates(year: number, week: number): { from: string; to: string } {
  const jan4 = Date.UTC(year, 0, 4);
  const jan4Day = new Date(jan4).getUTCDay() || 7;
  const monday = jan4 - (jan4Day - 1) * 86_400_000 + (week - 1) * 7 * 86_400_000;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: iso(monday), to: iso(monday + 6 * 86_400_000) };
}

async function plannedLimit(at: Date): Promise<BorderLimit | null> {
  const { year, week } = isoWeek(at);
  const filters = encodeURIComponent(JSON.stringify({ YEAR: year, 'Week No': week }));
  const body = await fetchJson<Datastore<{ SCOTEX: number | string | null }>>(
    `${API}?resource_id=${PLANNED_RESOURCE}&filters=${filters}&limit=1`
  );
  const value = Number(body.result.records[0]?.SCOTEX);
  if (!Number.isFinite(value) || value <= 0) return null;
  const { from, to } = weekDates(year, week);
  return { limitMW: value, maxMW: BORDER_MAX_MW, basis: 'planned-week', from, to };
}

async function latestDayAheadLimit(): Promise<BorderLimit | null> {
  const filters = encodeURIComponent(JSON.stringify({ 'Constraint Group': 'SCOTEX' }));
  const body = await fetchJson<Datastore<{ 'Date_ Time GMT_BST': string; Limit_MW: number | string | null }>>(
    `${API}?resource_id=${DAY_AHEAD_RESOURCE}&filters=${filters}` +
      `&sort=${encodeURIComponent('"Date_ Time GMT_BST" desc')}&limit=50`
  );
  const rows = body.result.records.filter((r) => Number.isFinite(Number(r.Limit_MW)));
  if (rows.length === 0) return null;
  const day = rows[0]['Date_ Time GMT_BST'].slice(0, 10);
  const limits = rows.filter((r) => r['Date_ Time GMT_BST'].startsWith(day)).map((r) => Number(r.Limit_MW));
  const mean = limits.reduce((s, v) => s + v, 0) / limits.length;
  return { limitMW: Math.round(mean / 50) * 50, maxMW: BORDER_MAX_MW, basis: 'day-ahead', from: day, to: day };
}

/** This week's planned border limit, else the latest day-ahead one. Throws only if both fail. */
export async function fetchBorderLimit(at: Date = new Date()): Promise<BorderLimit> {
  const planned = await plannedLimit(at).catch(() => null);
  if (planned) return planned;
  const dayAhead = await latestDayAheadLimit();
  if (dayAhead) return dayAhead;
  throw new Error('NESO published no border limit for this week or any recent day');
}
