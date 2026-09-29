/**
 * GET /api/cost
 *
 * An estimate of what holding back Scotland's tracked wind has added to
 * energy bills so far today (London day), to the last half hour Elexon has
 * settled. See _lib/cost.ts and DECISIONS 052.
 */

import type { CostResponse } from '../src/lib/types.js';
import type { ApiRequest, ApiResponse } from './_lib/handler.js';
import { fetchCostToday } from './_lib/cost.js';
import { errorMessage, setCacheHeaders } from './_lib/http.js';
import { settlementAt } from '../src/lib/settlement.js';

export default async function handler(_req: ApiRequest, res: ApiResponse) {
  const body: CostResponse = { fetchedAt: new Date().toISOString(), health: 'ok', errors: [], cost: null };
  try {
    body.cost = await fetchCostToday(settlementAt(new Date()).date);
  } catch (err) {
    body.health = 'failed';
    body.errors.push(`cost: ${errorMessage(err)}`);
  }
  setCacheHeaders(res);
  return res.status(200).json(body);
}
