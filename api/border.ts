/**
 * GET /api/border
 *
 * How much the Scotland–England border can carry this week, from NESO's
 * published limits (see _lib/neso.ts, DECISIONS 046). A limit, not a flow:
 * no live or outturn flow across the border is published.
 */

import type { BorderResponse } from '../src/lib/types.js';
import type { ApiRequest, ApiResponse } from './_lib/handler.js';
import { fetchBorderLimit } from './_lib/neso.js';
import { errorMessage, setCacheHeaders } from './_lib/http.js';

export default async function handler(_req: ApiRequest, res: ApiResponse) {
  const body: BorderResponse = { fetchedAt: new Date().toISOString(), health: 'ok', errors: [], border: null };
  try {
    body.border = await fetchBorderLimit();
  } catch (err) {
    body.health = 'failed';
    body.errors.push(`border: ${errorMessage(err)}`);
  }
  setCacheHeaders(res);
  return res.status(200).json(body);
}
