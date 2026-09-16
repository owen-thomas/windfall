/**
 * Build src/map/data/farms.json — one location per wind farm tracked in
 * api/_lib/bmus.ts (76 farms, Windfall_Map_Spec.md §4.2 / step 2 Part B).
 *
 * Source: DESNZ Renewable Energy Planning Database (REPD), the quarterly
 * CSV extract published at
 *   https://www.gov.uk/government/publications/renewable-energy-planning-database-quarterly-extract
 * which carries X/Y in British National Grid (EPSG:27700) for every site,
 * including offshore. Converted to WGS84 here with proj4 (a dev-only
 * dependency — nothing new ships in the page bundle).
 *
 * Matching is two passes, per the plan:
 *
 * 1. Name-match. Every Scotland "Wind Onshore"/"Wind Offshore" REPD row is
 *    normalised (strip "wind farm", roman-numeral/"extension" suffixes,
 *    punctuation) and compared against each tracked farm's own normalised
 *    name. Rows at an identical coordinate are deduplicated first (REPD
 *    frequently carries a farm and its own near-duplicate re-registration
 *    at the exact same site). A farm left with exactly one distinct
 *    coordinate after that is auto-matched — 52 of the 76.
 *
 * 2. Hand-match. The remaining 24 farms are irreducibly ambiguous by name
 *    alone — REPD lists a farm and its extension as separate rows (use the
 *    parent, per the plan), REPD's development status lags what Elexon
 *    already tracks as live (Kennoxhead, Pencloe, North Kyle), or a single
 *    physical farm is split across two REPD rows with no shared parent
 *    (Robin Rigg's East/West arrays, Pogbie's two phases — centroid of
 *    both). HAND_MATCHES below is that table, keyed by farm name, each
 *    entry naming the REPD Ref ID(s) chosen and why. See DECISIONS.md 023
 *    for the full reasoning and the printed candidate lists it was read
 *    from.
 *
 * Run with: npx tsx scripts/build-farms.ts
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import proj4 from 'proj4';
import { SCOTTISH_WIND_BMUS } from '../api/_lib/bmus';

// EPSG:27700 (OSGB36 / British National Grid), Airy 1830 ellipsoid, with the
// standard OSGB36->WGS84 sT7 Helmert parameters — accurate to a few metres,
// well inside what a map marker needs.
proj4.defs(
  'EPSG:27700',
  '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 ' +
    '+ellps=airy +units=m +no_defs +towgs84=446.448,-125.157,542.060,0.1502,0.2470,0.8421,-20.4894',
);

function bngToLatLon(x: number, y: number): [number, number] {
  const [lon, lat] = proj4('EPSG:27700', 'EPSG:4326', [x, y]);
  return [round(lat, 5), round(lon, 5)];
}

function round(value: number, dp: number): number {
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
}

const FETCH_CACHE_PATH = join(tmpdir(), 'windfall-build-farms-repd-cache.csv');
const INDEX_PAGE_URL =
  'https://www.gov.uk/government/publications/renewable-energy-planning-database-quarterly-extract';
const OUTPUT_PATH = fileURLToPath(new URL('../src/map/data/farms.json', import.meta.url));

export interface FarmSite {
  farm: string;
  latLon: [number, number];
  offshore: boolean;
  repdRef?: string;
  /** Present only when the coordinate needed a hand decision — see the module docs above. */
  source?: string;
}

// --- REPD fetch + parse ----------------------------------------------------

async function fetchRepdCsv(): Promise<string> {
  if (existsSync(FETCH_CACHE_PATH)) {
    console.log(`Using cached REPD CSV at ${FETCH_CACHE_PATH}`);
    return readFileSync(FETCH_CACHE_PATH, 'latin1');
  }

  console.log(`Fetching ${INDEX_PAGE_URL} to find the current quarterly CSV...`);
  const indexRes = await fetch(INDEX_PAGE_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!indexRes.ok) throw new Error(`REPD index page fetch failed: ${indexRes.status}`);
  const indexHtml = await indexRes.text();
  const match = indexHtml.match(/https:\/\/assets\.publishing\.service\.gov\.uk\/media\/[^"]+\.csv/);
  if (!match) throw new Error('Could not find a .csv asset link on the REPD publication page');
  const csvUrl = match[0];
  console.log(`Downloading ${csvUrl} ...`);
  const csvRes = await fetch(csvUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!csvRes.ok) throw new Error(`REPD CSV fetch failed: ${csvRes.status}`);
  const buf = await csvRes.arrayBuffer();
  // REPD's CSV is published as ISO-8859-1 (it carries a handful of
  // non-ASCII characters, e.g. site names with accents) — decode it as
  // such rather than assuming UTF-8, then cache the decoded text.
  const text = new TextDecoder('latin1').decode(buf);
  writeFileSync(FETCH_CACHE_PATH, text);
  return text;
}

/** Minimal quoted-CSV parser — handles embedded commas and doubled quotes, which is all this file uses. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === '\r') {
      // skip
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

interface RepdRow {
  ref: string;
  site: string;
  status: string;
  tech: string;
  capacityMW: number;
  x: number;
  y: number;
}

function loadRepdRows(csvText: string): RepdRow[] {
  const rows = parseCsv(csvText);
  const header = rows[0];
  const idx = (name: string) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`REPD CSV missing expected column "${name}"`);
    return i;
  };
  const iSite = idx('Site Name');
  const iStatus = idx('Development Status (short)');
  const iTech = idx('Technology Type');
  const iCountry = idx('Country');
  const iRef = idx('Ref ID');
  const iX = idx('X-coordinate');
  const iY = idx('Y-coordinate');
  const iCap = idx('Installed Capacity (MWelec)');

  const out: RepdRow[] = [];
  for (const r of rows.slice(1)) {
    if (r[iCountry] !== 'Scotland') continue;
    if (!/^wind (onshore|offshore)$/i.test((r[iTech] || '').trim())) continue;
    const x = Number(r[iX]);
    const y = Number(r[iY]);
    if (!x || !y) continue;
    out.push({
      ref: r[iRef],
      site: r[iSite].trim(),
      status: r[iStatus],
      tech: r[iTech],
      capacityMW: parseFloat(r[iCap]) || 0,
      x,
      y,
    });
  }
  return out;
}

/** Normalise a REPD site name or a bmus.ts farm name onto the same key for comparison. */
function normalise(name: string): string {
  return name
    .toLowerCase()
    .replace(/[’‘']/g, '')
    .replace(/wind\s*farm/g, '')
    .replace(/\bextension\b|\bext\b|\bii\b|\biii\b|\biv\b|\bphase\s*\d+\b|repowering|repower/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- Hand-matches (see the module docs above and DECISIONS 023) -----------

interface HandMatch {
  /** One REPD Ref ID, or two to centroid-average (Robin Rigg's East/West arrays, Pogbie's two phases). */
  refs: [string] | [string, string];
  source: string;
}

const HAND_MATCHES: Record<string, HandMatch> = {
  'Aberdeen Offshore': {
    refs: ['2505'],
    source:
      "REPD's site name is 'European Offshore Wind Deployment Centre (EOWDC) (Aberdeen Bay - " +
      "Demonstration site)' — not name-matchable against 'Aberdeen Offshore'; matched by capacity " +
      '(96.8 MW REPD vs 99 MW registered) and being the only Scottish offshore site near Aberdeen.',
  },
  "A’Chruach": {
    refs: ['4331'],
    source:
      "REPD splits this into 'A'Chruach (Phase 1)' (Operational, 48.3 MW) and 'A'Chruach (Phase 2)' " +
      '(Planning Permission Expired, 4MW, unbuilt) — the built phase is used.',
  },
  Beinneun: {
    refs: ['3787'],
    source:
      "Parent 'Beinneun' (Operational, 85 MW) used over 'Beinneun Windfarm Extension' (23.8 MW) per " +
      "the extension rule — both share the exact same coordinate. A third row, 'Beinneun II' " +
      '(136.8 MW, Application Submitted), is a separate unbuilt proposal at a different site.',
  },
  'Crystal Rig': {
    refs: ['3114'],
    source: "Parent 'Crystal Rig Phase 1' (62.5 MW) used over 'Crystal Rig Extension II' (20.7 MW).",
  },
  Dorenell: {
    refs: ['4244'],
    source:
      "'Dorenell Wind Farm (Previously Site A and B Scaut Hill)' (Operational, 177 MW) is the built " +
      "site. 'Dorenell Wind Farm (extension)' (Abandoned) shares its exact coordinate; 'Dorenell " +
      "Extension Wind Farm' (Application Submitted, 476.6 MW) is a separate, larger, unbuilt proposal.",
  },
  'Dun Law': {
    refs: ['3579'],
    source:
      "The only tracked BM unit for this farm is registered as 'Dun Law Ext' (DNLWW-1, 29.75 MW), " +
      "matching REPD's 'Dun Law Extension' (29.8 MW) almost exactly — the parent 'Dun Law' site " +
      '(17.2 MW) is not transmission-connected and not part of this tracked farm, so the extension\'s ' +
      'own coordinate is used rather than the usual parent rule.',
  },
  Gordonbush: {
    refs: ['3662'],
    source: "Parent 'Gordonbush' (70 MW) used over 'Gordonbush (extension)' (47 MW) per the extension rule.",
  },
  'Hadyard Hill': {
    refs: ['3109'],
    source: "Parent 'Hadyard Hill' (Operational, 120 MW) used; the extension row is Application Withdrawn.",
  },
  'Hagshaw Hill': {
    refs: ['3301'],
    source:
      "Four REPD rows share this name; the plain, non-extension, non-repowering 'Hagshaw Hill Wind " +
      "Farm' row is used per the extension rule, even though REPD's own capacity for it (7.8 MW) " +
      'looks stale against the tracked unit (30.258 MW) — its coordinate is the original site either way.',
  },
  Harestanes: {
    refs: ['4119'],
    source: "Parent 'Harestanes' (Operational, 136 MW) used; the extension row is Application Refused.",
  },
  'Keith Hill': {
    refs: ['4516'],
    source:
      "REPD has two 'Keith Hill' rows; the Operational one (4.5 MW) matches the tracked unit's " +
      "capacity exactly. The other (25 MW, status 'Revised') is excluded.",
  },
  Kennoxhead: {
    refs: ['4385'],
    source:
      "REPD status is 'Under Construction', not yet Operational — but Elexon already tracks this " +
      'unit (KENNW-1, 60 MW) as live, so the status lags reality. Its Extension (Phase 2) row is excluded.',
  },
  Kilgallioch: {
    refs: ['4386'],
    source: "Parent 'Kilgallioch wind farm' (Operational, 239 MW) used over the Under Construction extension.",
  },
  Limekiln: {
    refs: ['6005'],
    source:
      'Three REPD rows share this name; the Operational, non-extension row is used. A duplicate ' +
      "'Revised'-status row at a near-identical coordinate and the Extension row are excluded.",
  },
  Lochluichart: {
    refs: ['4123'],
    source: "Parent 'Lochluichart' (Operational, 51 MW) used over 'Lochluichart (Extension)' (18 MW).",
  },
  Millennium: {
    refs: ['4682'],
    source:
      "The plain-named, non-extension 'Millennium Windfarm' row is used; 'Millennium Extension' and " +
      "'Millennium Extension II' are excluded, as is the unbuilt 'Millennium South'/'Millennium East' " +
      'proposal at a different coordinate.',
  },
  'North Kyle': {
    refs: ['6607'],
    source:
      "'North Kyle Energy Project' (Under Construction, 205.8 MW) matches the tracked units' combined " +
      "212 MW almost exactly — REPD's status lags reality, as with Kennoxhead. 'Kyle Windfarm' " +
      "(Application Refused) and 'Breezy Hill, North Kyle Forest Estate' (a separate, smaller, unbuilt " +
      'proposal) are excluded.',
  },
  Pencloe: {
    refs: ['4480'],
    source:
      "'Pencloe Wind Farm' (Under Construction, 81 MW) matches the tracked unit's 81 MW exactly — " +
      'status again lags reality. Its extension row is excluded.',
  },
  Pogbie: {
    refs: ['4434', '5637'],
    source:
      "No single REPD row covers the whole farm — 'Pogbie Wind Farm 1' and 'Pogbie Wind Farm 2' " +
      '(both Operational, adjacent) are its two phases. Centroid of both used.',
  },
  'Robin Rigg': {
    refs: ['2496', '2497'],
    source:
      'One physical offshore wind farm, consented and built as two separate REPD rows (East and West ' +
      'arrays, both Operational). Centroid of both used.',
  },
  'Sandy Knowe': {
    refs: ['6703'],
    source:
      "REPD has two 'Revised'-status duplicates plus this Operational row (81.6 MW) at a near-identical " +
      'coordinate to one of them, plus a separate Extension row. The Operational row is used.',
  },
  Sanquhar: {
    refs: ['4441'],
    source:
      "'Sanquhar Community Windfarm' (Operational, 32.4 MW) matches the tracked unit's 32.08 MW almost " +
      "exactly. REPD's 'Sanquhar 2 Community Wind Farm' (308 MW, Under Construction) is a distinct, " +
      'much larger, separate development at a different site and is not this farm.',
  },
  Whitelee: {
    refs: ['3489'],
    source: "Parent 'Whitelee' (Operational, 322 MW) used over both extension phases, per the extension rule.",
  },
  'Windy Standard': {
    refs: ['4431'],
    source:
      "The tracked unit (WISTW-2) is registered as 'Brockloch Rig II' — REPD's 'Brochloch Rig (formerly " +
      "Windy Standard II)' row is the one whose name and site match it. 'Brochloch Rig 1 (formerly Windy " +
      "Standard)' and two further Brochloch Rig repowering/phase rows are different, unmatched sites.",
  },
};

// --- Matching ---------------------------------------------------------------

interface Candidate {
  ref: string;
  site: string;
  tech: string;
  x: number;
  y: number;
}

function dedupeByCoordinate(rows: RepdRow[]): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const r of rows) {
    const key = `${r.x},${r.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ref: r.ref, site: r.site, tech: r.tech, x: r.x, y: r.y });
  }
  return out;
}

async function main() {
  const csvText = await fetchRepdCsv();
  const repdRows = loadRepdRows(csvText);
  const byRef = new Map(repdRows.map((r) => [r.ref, r]));
  console.log(`Loaded ${repdRows.length} Scotland wind rows from REPD.`);

  const farmNames = [...new Set(Object.values(SCOTTISH_WIND_BMUS).map((u) => u.farm))].sort();
  console.log(`${farmNames.length} farms to place (from api/_lib/bmus.ts).`);

  const sites: FarmSite[] = [];
  const unresolved: string[] = [];

  for (const farm of farmNames) {
    const hand = HAND_MATCHES[farm];
    if (hand) {
      const rows = hand.refs.map((ref) => {
        const row = byRef.get(ref);
        if (!row) throw new Error(`Hand-match for "${farm}" names REPD ref ${ref}, not found in this extract`);
        return row;
      });
      const x = rows.reduce((sum, r) => sum + r.x, 0) / rows.length;
      const y = rows.reduce((sum, r) => sum + r.y, 0) / rows.length;
      sites.push({
        farm,
        latLon: bngToLatLon(x, y),
        offshore: /offshore/i.test(rows[0].tech),
        repdRef: hand.refs.join('+'),
        source: hand.source,
      });
      continue;
    }

    const nf = normalise(farm);
    let candidateRows = repdRows.filter((r) => normalise(r.site) === nf);
    if (candidateRows.length === 0) {
      candidateRows = repdRows.filter((r) => normalise(r.site).includes(nf) || nf.includes(normalise(r.site)));
    }
    const candidates = dedupeByCoordinate(candidateRows);

    if (candidates.length === 1) {
      const c = candidates[0];
      sites.push({
        farm,
        latLon: bngToLatLon(c.x, c.y),
        offshore: /offshore/i.test(c.tech),
        repdRef: c.ref,
      });
    } else {
      unresolved.push(farm);
      console.warn(
        `[build-farms] "${farm}": ${candidates.length} distinct-coordinate candidates and no ` +
          `HAND_MATCHES entry — ${candidates.map((c) => `${c.ref} ${c.site}`).join(' | ') || '(none found)'}`,
      );
    }
  }

  if (unresolved.length > 0) {
    throw new Error(
      `${unresolved.length} farm(s) matched neither by name nor by hand: ${unresolved.join(', ')}. ` +
        'Add each to HAND_MATCHES above with the REPD Ref ID(s) to use.',
    );
  }

  sites.sort((a, b) => a.farm.localeCompare(b.farm));
  const autoMatched = sites.filter((s) => !s.source).length;
  console.log(`Resolved all ${sites.length} farms: ${autoMatched} auto-matched, ${sites.length - autoMatched} hand-matched.`);
  console.log(`Offshore: ${sites.filter((s) => s.offshore).length}, onshore: ${sites.filter((s) => !s.offshore).length}.`);

  writeFileSync(OUTPUT_PATH, JSON.stringify(sites, null, 2) + '\n');
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
