/**
 * The Scotland–England border, extended to meet the drawn coast at both ends
 * (Windfall_Map_Spec_4c.md §4c.1 / §6, DECISIONS 029).
 *
 * The border data stops where its source does — at the head of the Solway on
 * the west and a kilometre or so short of the North Sea on the east — while the
 * coastline the page draws is a coarse simplification of the real one. Left as
 * is, the line floats 10 km (about 7px at 1440) off the west coast. 4c makes it
 * a plain divider drawn coast to coast, so each end is joined to the nearest
 * point of the coast ring, if there is one close enough to be the same place.
 *
 * The join is the *nearest point*, not the end segment carried on to the coast.
 * Carrying the end segment on was tried first: the Solway end wanders between
 * 24 km and 60 km depending on how many points the direction is read from,
 * because the last stretch of the source line is a staircase. The nearest point
 * on the ring does not depend on any of that.
 */

type LatLon = [number, number];

/** Kilometres per degree of latitude — accurate enough for a distance cut-off at these scales. */
const KM_PER_DEG = 111.2;

/** Do not join an end to a coast further than this: past it the nearest coast is a different place, not the same one drawn coarsely. */
const DEFAULT_MAX_JOIN_KM = 15;

/** Below this the end already reads as touching the coast; adding a point would only add a kink. */
const MIN_JOIN_KM = 0.3;

/** Nearest point on a closed ring to `p`, with its distance in km (planar, longitude scaled by cos latitude). */
function nearestOnRing(p: LatLon, ring: LatLon[]): { point: LatLon; km: number } {
  const k = Math.cos((p[0] * Math.PI) / 180);
  let best = { point: p, km: Infinity };
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const ax = (a[1] - p[1]) * k;
    const ay = a[0] - p[0];
    const sx = (b[1] - a[1]) * k;
    const sy = b[0] - a[0];
    const len2 = sx * sx + sy * sy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * sx + ay * sy) / len2));
    const dx = ax + t * sx;
    const dy = ay + t * sy;
    const km = Math.hypot(dx, dy) * KM_PER_DEG;
    if (km < best.km) best = { point: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], km };
  }
  return best;
}

/** `line` with each end joined to the nearest point of `ring` when that point is within `maxJoinKm`. The input is not modified. */
export function extendToCoast(line: LatLon[], ring: LatLon[], maxJoinKm = DEFAULT_MAX_JOIN_KM): LatLon[] {
  if (line.length < 2) return line;
  const start = nearestOnRing(line[0], ring);
  const end = nearestOnRing(line[line.length - 1], ring);
  const out = line.slice();
  if (start.km > MIN_JOIN_KM && start.km <= maxJoinKm) out.unshift(start.point);
  if (end.km > MIN_JOIN_KM && end.km <= maxJoinKm) out.push(end.point);
  return out;
}
