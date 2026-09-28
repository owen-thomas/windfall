/**
 * GET /api/curtailment
 *
 * Scottish wind instructed off the system, on two clocks:
 *
 *   now     — MW currently instructed below declared output. Instantaneous,
 *             so it is honest at any point inside a period.
 *   settled — MWh over the last complete period. Only meaningful once the
 *             period has closed and every acceptance has landed.
 *
 * Both are floors. See DECISIONS.md 003 and 006, and _lib/elexon.ts for the
 * derivation itself.
 */

import type { CurtailmentResponse, SourceHealth } from '../src/lib/types.js';
import type { ApiRequest, ApiResponse } from './_lib/handler.js';
import {
  deriveNow,
  deriveSettled,
  fetchBOALF,
  fetchBOALFWindow,
  fetchPN,
  NotPublishedError,
  type BOALFItem,
} from './_lib/elexon.js';
import { SCOTTISH_WIND_IDS, TRACKED_CAPACITY_MW } from './_lib/bmus.js';
import { errorMessage, overallHealth, setCacheHeaders } from './_lib/http.js';
import { previousPeriod, settlementAt, type SettlementRef } from '../src/lib/settlement.js';

const METHOD_BASIS =
  'Instructed turn-downs of transmission-connected Scottish wind via the ' +
  'balancing mechanism: declared output (PN) minus accepted level (BOALF). ' +
  'Excludes self-curtailment, pre-adjusted declarations and ' +
  'distribution-connected units, so the figure is a floor. Per-farm output ' +
  'figures are declared output — a physical notification, not a metered ' +
  'reading — at the instant sampled.';

/**
 * How far back to look for the last period Elexon published, when the current
 * one hasn't been (DECISIONS 045). Twelve hours, asked for in batches of six
 * so a short gap costs one round of requests, not twenty-four.
 */
const FALLBACK_PERIODS = 24;
const FALLBACK_BATCH = 6;

type PNItems = Awaited<ReturnType<typeof fetchPN>>;

/**
 * The newest of the `FALLBACK_PERIODS` periods before `from` that Elexon has
 * published, with its PN. Throws if none has been, or if Elexon fails outright.
 */
async function lastPublished(from: SettlementRef): Promise<{ ref: SettlementRef; pn: PNItems }> {
  let ref = from;
  for (let asked = 0; asked < FALLBACK_PERIODS; asked += FALLBACK_BATCH) {
    const batch: SettlementRef[] = [];
    for (let i = 0; i < FALLBACK_BATCH; i++) batch.push((ref = previousPeriod(ref)));
    const results = await Promise.allSettled(batch.map((r) => fetchPN(r.date, r.period)));
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') return { ref: batch[i], pn: result.value };
      if (!(result.reason instanceof NotPublishedError)) throw result.reason;
    }
  }
  throw new NotPublishedError(`no PN published in the ${FALLBACK_PERIODS / 2} hours before period ${from.period}`);
}

/**
 * How far behind the clock BOALF's newest acceptance can be before the feed is
 * read as lagging rather than quiet. GB sees a few hundred acceptances a
 * half hour, so twenty minutes without one means Elexon has stopped publishing.
 */
const BOALF_LAG_TOLERANCE_MS = 20 * 60_000;

/** The last minute of a period: the latest instant a fallback reading can speak for. */
const FALLBACK_SAMPLE_BEFORE_END_MS = 60_000;

interface NowRead {
  ref: SettlementRef;
  pn: PNItems;
  boalf: BOALFItem[];
  sampledAt: Date;
  /** The reading is from before the current period; the page words it in the past tense. */
  fallback: boolean;
}

/**
 * The latest instant both feeds cover, and the reading there (DECISIONS 045).
 * Normally that is now. When Elexon hasn't published the current period's PN,
 * it is the end of the last period it has. And when BOALF stops short of that,
 * it is BOALF's last acceptance: a declared level read past it, with no
 * acceptance to set against it, would count wind that was held back as on
 * the grid.
 */
async function readNow(current: SettlementRef, at: Date): Promise<NowRead> {
  let ref = current;
  let pn: PNItems;
  let sampledAt = at;
  try {
    pn = await fetchPN(current.date, current.period);
  } catch (err) {
    if (!(err instanceof NotPublishedError)) throw err;
    ({ ref, pn } = await lastPublished(current));
    sampledAt = new Date(Date.parse(ref.periodEnd) - FALLBACK_SAMPLE_BEFORE_END_MS);
  }

  let { items: boalf, publishedTo } = await fetchBOALFWindow(ref.date, ref.period);
  if (publishedTo === null) {
    throw new NotPublishedError(`no BOALF published around ${ref.date} period ${ref.period}`);
  }
  if (sampledAt.getTime() - publishedTo > BOALF_LAG_TOLERANCE_MS) {
    sampledAt = new Date(publishedTo);
    const earlier = settlementAt(sampledAt);
    if (earlier.date !== ref.date || earlier.period !== ref.period) {
      ref = earlier;
      [pn, { items: boalf }] = await Promise.all([
        fetchPN(ref.date, ref.period),
        fetchBOALFWindow(ref.date, ref.period),
      ]);
    }
  }

  const fallback = ref.date !== current.date || ref.period !== current.period;
  return { ref, pn, boalf, sampledAt, fallback };
}

export default async function handler(_req: ApiRequest, res: ApiResponse) {
  const current = settlementAt(new Date());

  // `now` first, because a fallback moves `settled` back with it: settled is
  // always the period before the one `now` reads.
  const [nowData] = await Promise.allSettled([readNow(current, new Date())]);

  const nowRef = nowData.status === 'fulfilled' ? nowData.value.ref : current;
  const settled = previousPeriod(nowRef);
  const [settledData] = await Promise.allSettled([
    Promise.all([fetchPN(settled.date, settled.period), fetchBOALF(settled.date, settled.period)]),
  ]);

  const errors: string[] = [];
  const health = (result: PromiseSettledResult<unknown>, label: string): SourceHealth => {
    if (result.status === 'fulfilled') return 'ok';
    errors.push(`${label}: ${errorMessage(result.reason)}`);
    return 'failed';
  };

  let nowHealth = health(nowData, 'now');
  const settledHealth = health(settledData, 'settled');
  if (nowData.status === 'fulfilled' && nowData.value.fallback) {
    // Answering, but behind: the footer says "Elexon partly answering".
    nowHealth = 'partial';
    errors.push(`now: period ${current.period} not published; showing period ${nowRef.period}`);
  }

  const body: CurtailmentResponse = {
    fetchedAt: new Date().toISOString(),
    health: {
      overall: overallHealth([nowHealth, settledHealth]),
      now: nowHealth,
      settled: settledHealth,
    },
    errors,
    now: null,
    settled: null,
    method: {
      basis: METHOD_BASIS,
      unitsTracked: SCOTTISH_WIND_IDS.length,
      capacityMW: TRACKED_CAPACITY_MW,
    },
  };

  if (nowData.status === 'fulfilled') {
    const { ref, pn, boalf, sampledAt } = nowData.value;
    const { curtailedMW, units, farms } = deriveNow(pn, boalf, sampledAt);
    body.now = {
      settlement: ref,
      sampledAt: sampledAt.toISOString(),
      curtailedMW,
      unitsCurtailed: units.length,
      units,
      farms,
    };
  }

  if (settledData.status === 'fulfilled') {
    const [pn, boalf] = settledData.value;
    const derived = deriveSettled(
      pn,
      boalf,
      new Date(settled.periodStart),
      new Date(settled.periodEnd)
    );
    body.settled = { settlement: settled, ...derived };
  }

  setCacheHeaders(res);
  return res.status(200).json(body);
}
