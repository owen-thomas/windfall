/**
 * GET /api/windspeed
 *
 * Current windspeed at every tracked farm, from Open-Meteo — free, no key,
 * km/h by lat/lon, and it accepts batched coordinate lists (map step 4c.5,
 * Windfall_Map_Spec_4c.md §4c.5, DECISIONS 029). One call for all 76 farms:
 * simpler and cheaper than lazy-loading per row, and it makes the source
 * list's "and N more…" instant rather than waiting on a second round of
 * fetches once it opens.
 *
 * Open-Meteo returns one location object per coordinate pair, in request
 * order — response[i] is farms[i]. That ordering is trusted rather than
 * matched back by lat/lon, since floating-point round-tripping through a
 * query string is not a safe equality check. A single bad coordinate degrades
 * to a missing entry for that farm (never a guess); a response that isn't the
 * array shape expected, or the fetch itself failing, degrades the whole
 * route to `health: 'failed'` with an empty `speeds` — the client already
 * treats "no entry for this farm" and "the whole feed is down" identically
 * (no clause on the row), so failing shut here costs nothing.
 */

import type { ApiRequest, ApiResponse } from './_lib/handler.js';
import type { WindspeedResponse } from '../src/lib/types.js';
import { fetchJson, setCacheHeaders } from './_lib/http.js';
import farms from '../src/map/data/farms.json';

interface FarmSite {
  farm: string;
  // A plain array, not a [number, number] tuple: that's what TS infers from
  // the JSON literal (farms.json has no type annotations to narrow it), and
  // an `as` cast can't narrow an array to a tuple without going through
  // `unknown` first. Indexing [0]/[1] below works the same either way.
  latLon: number[];
}

interface OpenMeteoLocation {
  current?: { wind_speed_10m?: number };
}

const FARM_SITES = farms as FarmSite[];

function openMeteoUrl(sites: FarmSite[]): string {
  const lat = sites.map((s) => s.latLon[0]).join(',');
  const lon = sites.map((s) => s.latLon[1]).join(',');
  return (
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lat}&longitude=${lon}&current=wind_speed_10m&wind_speed_unit=kmh`
  );
}

export default async function handler(_req: ApiRequest, res: ApiResponse) {
  const body: WindspeedResponse = {
    fetchedAt: new Date().toISOString(),
    health: 'failed',
    errors: [],
    speeds: {},
  };

  try {
    const locations = await fetchJson<unknown>(openMeteoUrl(FARM_SITES));
    if (!Array.isArray(locations) || locations.length !== FARM_SITES.length) {
      body.errors.push(
        `unexpected response shape from Open-Meteo (expected an array of ${FARM_SITES.length})`
      );
    } else {
      FARM_SITES.forEach((site, i) => {
        const speed = (locations[i] as OpenMeteoLocation | undefined)?.current?.wind_speed_10m;
        if (typeof speed === 'number' && Number.isFinite(speed)) {
          body.speeds[site.farm] = speed;
        }
      });
      const answered = Object.keys(body.speeds).length;
      body.health = answered === FARM_SITES.length ? 'ok' : answered > 0 ? 'partial' : 'failed';
      if (answered < FARM_SITES.length) {
        body.errors.push(`${FARM_SITES.length - answered} of ${FARM_SITES.length} farms had no usable reading`);
      }
    }
  } catch (err) {
    body.errors.push(err instanceof Error ? err.message : String(err));
  }

  setCacheHeaders(res);
  return res.status(200).json(body);
}
