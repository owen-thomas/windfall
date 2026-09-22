/**
 * Fetching the three functions — as two independent requests, not one.
 *
 * Grid and curtailment are cheap CDN reads; narration is, on a cache miss, a
 * live Anthropic call that can take several seconds (DECISIONS 018). The two
 * used to be awaited together in a single Promise.allSettled, which meant
 * the first visitor of every settlement period had their entire screen wait
 * on the model finishing a sentence. fetchCoreFeeds and fetchNarration are
 * now separate calls so the caller can render the moment each resolves —
 * the narration landing late is not a bug to hide, it is the
 * template-to-generated swap the narration view already designs for.
 *
 * Neither call can fail the other, and neither can blank the screen: a
 * rejection becomes a transport error on that feed alone and the previous
 * payload is kept by the caller. The functions themselves always answer 200
 * (DECISIONS 004), so a rejection here means the network or the platform,
 * not an upstream.
 */

import type { CurtailmentResponse, GridResponse, NarrationResponse, WindspeedResponse } from './types.js';
import { settlementAt } from './settlement.js';
import type { SouthernRegion } from './situation.js';

const TIMEOUT_MS = 10_000;

async function getJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(path, { signal: controller.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function reason(err: unknown): string {
  if (err instanceof Error) {
    return err.name === 'AbortError' ? 'timed out' : err.message;
  }
  return String(err);
}

export interface CoreFeeds {
  grid: GridResponse | null;
  gridError: string | null;
  curtailment: CurtailmentResponse | null;
  curtailmentError: string | null;
}

export async function fetchCoreFeeds(): Promise<CoreFeeds> {
  const [grid, curtailment] = await Promise.allSettled([
    getJson<GridResponse>('/api/grid'),
    getJson<CurtailmentResponse>('/api/curtailment'),
  ]);

  const feeds: CoreFeeds = { grid: null, gridError: null, curtailment: null, curtailmentError: null };
  if (grid.status === 'fulfilled') feeds.grid = grid.value;
  else feeds.gridError = reason(grid.reason);

  if (curtailment.status === 'fulfilled') feeds.curtailment = curtailment.value;
  else feeds.curtailmentError = reason(curtailment.reason);

  return feeds;
}

export interface NarrationFeed {
  narration: NarrationResponse | null;
  narrationError: string | null;
}

/**
 * `region` picks which southern region the server describes — South
 * England for `/` (the default), England for `/map` (Windfall_Map_Spec.md
 * step 3b Part B). It is part of the cache key on the server (api/narration.ts)
 * as well as the facts handed to the model, since one generated sentence
 * cannot serve two pages showing different regions.
 */
export async function fetchNarration(region: SouthernRegion = 'south-england'): Promise<NarrationFeed> {
  // Ask for narration by the period our own clock says is current. The
  // server treats date/period only as a cache key and a sanity bound (it
  // always generates against its own clock) — see api/narration.ts.
  const { date, period } = settlementAt();
  try {
    const narration = await getJson<NarrationResponse>(
      `/api/narration?date=${date}&period=${period}&region=${region}`
    );
    return { narration, narrationError: null };
  } catch (err) {
    return { narration: null, narrationError: reason(err) };
  }
}

export interface WindspeedFeed {
  windspeed: WindspeedResponse | null;
  windspeedError: string | null;
}

/**
 * Independent, like `fetchNarration` — the one new external dependency map
 * step 4c.5 adds. Open-Meteo has nothing to do with curtailment or the mix,
 * so it is fetched on its own, and a slow or dead weather API can never block
 * or blank the core feeds it shares a screen with (Windfall_Map_Spec_4c.md
 * §4c.5, DECISIONS 029).
 */
export async function fetchWindspeed(): Promise<WindspeedFeed> {
  try {
    const windspeed = await getJson<WindspeedResponse>('/api/windspeed');
    return { windspeed, windspeedError: null };
  } catch (err) {
    return { windspeed: null, windspeedError: reason(err) };
  }
}
