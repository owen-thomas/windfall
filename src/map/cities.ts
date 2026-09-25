/**
 * Destinations for the map's flow under `baseFieldMode: 'targets'`: the
 * wind heads for where people are. Weighted by population — a proxy for
 * demand that is easy to source and to explain, not a claim that a farm's
 * power reaches a particular city (the grid pools it).
 *
 * PROTOTYPE FIGURES — check before this ships. Populations are built-up
 * areas, rounded to the nearest thousand and taken from memory, not a
 * fetched table: ONS 2011 Census built-up areas for England and Wales
 * (Greater London, West Midlands, Greater Manchester, West Yorkshire,
 * Liverpool, Tyneside, Bristol, Cardiff) and NRS 2016 settlements for
 * Scotland (Greater Glasgow, Edinburgh). Southampton is the ONS built-up
 * area *subdivision*, not South Hampshire (~856k, which folds in
 * Portsmouth) — the whole conurbation pinned on one point would overstate
 * Southampton. Plymouth, Southampton and Norwich are there to carry flow
 * into the south-west, south coast and East Anglia, which the ten big
 * cities leave nearly empty. Only the ratios between them matter to the
 * flow.
 */
import type { Target } from '../flow/world';

export const CITIES: Target[] = [
  { id: 'london', name: 'London', latLon: [51.507, -0.128], weight: 9_787_000 },
  { id: 'manchester', name: 'Manchester', latLon: [53.48, -2.242], weight: 2_553_000 },
  { id: 'birmingham', name: 'Birmingham', latLon: [52.486, -1.89], weight: 2_441_000 },
  { id: 'leeds', name: 'Leeds', latLon: [53.8, -1.549], weight: 1_778_000 },
  { id: 'glasgow', name: 'Glasgow', latLon: [55.864, -4.252], weight: 985_000 },
  { id: 'liverpool', name: 'Liverpool', latLon: [53.408, -2.991], weight: 864_000 },
  { id: 'newcastle', name: 'Newcastle', latLon: [54.978, -1.617], weight: 775_000 },
  { id: 'bristol', name: 'Bristol', latLon: [51.455, -2.588], weight: 617_000 },
  { id: 'edinburgh', name: 'Edinburgh', latLon: [55.953, -3.188], weight: 512_000 },
  { id: 'cardiff', name: 'Cardiff', latLon: [51.481, -3.179], weight: 447_000 },
  { id: 'plymouth', name: 'Plymouth', latLon: [50.375, -4.143], weight: 260_000 },
  { id: 'southampton', name: 'Southampton', latLon: [50.909, -1.404], weight: 254_000 },
  { id: 'norwich', name: 'Norwich', latLon: [52.63, 1.297], weight: 213_000 },
];
