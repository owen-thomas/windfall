/**
 * Fetching the page's two feeds, grid and curtailment: cheap CDN reads,
 * requested together.
 *
 * Neither can fail the other, and neither can blank the screen: a rejection
 * becomes a transport error on that feed alone and the previous payload is
 * kept by the caller. The functions themselves always answer 200
 * (DECISIONS 004), so a rejection here means the network or the platform,
 * not an upstream. (The narration, a third and slower feed fetched on its
 * own, is archived: archive/narration, DECISIONS 043.)
 */
import type { CurtailmentResponse, GridResponse } from './types.js';

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
