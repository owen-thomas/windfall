/**
 * The map's region band (Windfall_Map_Spec.md §3 Part A.4, DECISIONS 026):
 * region name and intensity on one line, the bar, a *visible* legend, then
 * one two-clause sentence — not `../../view/band.ts`'s eyebrow-topped
 * dashboard row with a visually-hidden legend, which `/` still uses
 * unchanged.
 *
 * The caption is the existing three-voice, tense-aware sentence from
 * ../../view/band.ts's SCOTLAND/ENGLAND specs (constrained/clear/unknown,
 * now/past) with a second clause appended stating the same lead-fuel share
 * and intensity the header line already shows, spelled out in prose — "67%
 * wind at 0 grams of carbon dioxide per kilowatt-hour" — so the sentence
 * reads as one complete two-clause statement rather than a caption sitting
 * under an unrelated stat line. Both clauses come from the same `region`
 * object the bar renders, so they cannot disagree with it (026's own rule:
 * "every figure in a sentence comes from the same payload as the bar above
 * it").
 *
 * 4d: the caption sits behind the method disclosure's own pattern — a native
 * `<details>`, "▶ Show summary" / "▼ Hide summary", closed on first load — at
 * every tier (Owen). Through 4c a phone took it off the screen entirely.
 *
 * Scotland's caption only, a third clause: "Average wind speed 14 km/h." —
 * the mean of whatever `state.windspeed` (map step 4c.5, Open-Meteo) answered
 * for, across every tracked farm's coordinate, not filtered to farms
 * currently declaring output. Windspeed is a reading of the weather at a
 * location, not of a farm's operating state, so a silent farm's own wind
 * still counts — the same reasoning `sources.ts`'s per-farm "≋ N km/h" already
 * applies row by row. Omitted entirely (never "0 km/h") while the feed hasn't
 * answered for anything yet, per the product's own no-guessing rule.
 */

import { el, setAttr, setText, setTextCrossfade, type View } from '../../view/dom';
import { FUEL_ORDER, orderMix } from '../../lib/fuels';
import { formatIntensity, formatIntensityWords, formatPct, formatWindspeed, fuelLabel } from '../../lib/format';
import type { CurtailmentNow, RegionState } from '../../lib/types';
import { speaksOfNow, type AppState } from '../../lib/state';
import type { BandSpec } from '../../view/band';

/**
 * Higher than ../../view/band.ts's dashboard threshold (12%): the map's
 * panels are much narrower than a full-width dashboard row, and with the
 * legend now visible underneath (spec Part A.4 — "legends are visible
 * again"), an inline bar label is a nice-to-have for the dominant fuel, not
 * the only place a smaller segment's figure is readable.
 */
const LABEL_THRESHOLD_PCT = 20;

export function mapBandView(spec: BandSpec): View {
  const place = el('h2', { class: 'map-band__place' });
  const intensity = el('span', { class: 'map-band__intensity' });
  const head = el('div', { class: 'map-band__head' }, place, intensity);

  const segments = new Map<string, { seg: HTMLElement; label: HTMLElement }>();
  const bar = el('div', { class: 'mix', 'aria-hidden': 'true' });
  for (const fuel of FUEL_ORDER) {
    const label = el('span', { class: 'mix__label' });
    const seg = el('div', { class: 'mix__seg', 'data-fuel': fuel, style: 'flex-basis:0%' }, label);
    segments.set(fuel, { seg, label });
    bar.append(seg);
  }

  const legend = el('dl', { class: 'legend' });
  let legendKey = '';

  const caption = el('p', { class: 'map-band__caption' });
  const toggleText = el('span', { class: 'map-toggle__text', text: 'Show summary' });
  const summary = el('summary', { class: 'map-band__summary' }, el('span', { class: 'map-toggle' }, toggleText));
  const more = el('details', { class: 'map-band__more' }, summary, caption);
  more.addEventListener('toggle', () => {
    setText(toggleText, more.open ? 'Hide summary' : 'Show summary');
  });

  const root = el('section', { class: 'map-band', 'data-side': spec.side, 'data-state': 'ok' }, head, bar, legend, more);

  return {
    el: root,
    update(state: AppState) {
      const region = state.grid?.regions ? spec.pick(state.grid.regions) : null;
      const now = state.curtailment?.now;

      if (!region && state.pending) {
        setAttr(root, 'data-state', 'pending');
        setText(place, spec.placeholderName);
        setTextCrossfade(intensity, 'Waiting for Carbon Intensity');
        for (const { seg, label } of segments.values()) {
          seg.style.flexBasis = '0%';
          setText(label, '');
        }
        if (legendKey !== '') {
          legend.replaceChildren();
          legendKey = '';
        }
        setTextCrossfade(caption, now ? unknownOrStateCaption(spec, now, state) : spec.caption.unknown);
        return;
      }

      if (!region) {
        setAttr(root, 'data-state', 'failed');
        setText(place, spec.placeholderName);
        setTextCrossfade(intensity, 'Carbon Intensity unavailable');
        for (const { seg, label } of segments.values()) {
          seg.style.flexBasis = '0%';
          setText(label, '');
        }
        if (legendKey !== '') {
          legend.replaceChildren();
          legendKey = '';
        }
        setTextCrossfade(caption, spec.caption.unknown);
        return;
      }

      setAttr(root, 'data-state', 'ok');
      setText(place, region.name);
      setTextCrossfade(intensity, formatIntensity(region.intensity.forecast ?? region.intensity.actual));

      const mix = orderMix(region.generationMix);
      for (const { fuel, perc } of mix) {
        const entry = segments.get(fuel);
        if (!entry) continue;
        entry.seg.style.flexBasis = `${perc}%`;
        setAttr(entry.seg, 'data-empty', perc === 0 ? 'true' : null);
        setText(entry.label, perc >= LABEL_THRESHOLD_PCT ? `${fuelLabel(fuel)} ${formatPct(perc)}` : '');
      }

      const shown = mix.filter((f) => f.perc > 0);
      const key = shown.map((f) => `${f.fuel}:${f.perc}`).join('|');
      if (key !== legendKey) {
        legend.replaceChildren(
          ...shown.map((f) =>
            el(
              'div',
              { class: 'legend__item' },
              el('dt', { 'data-fuel': f.fuel }, el('span', { class: 'legend__swatch' }), fuelLabel(f.fuel)),
              el('dd', { text: formatPct(f.perc) })
            )
          )
        );
        legendKey = key;
      }

      setTextCrossfade(caption, twoClauseCaption(spec, region, now, state));
    },
  };
}

/** The pending state can still have a curtailment reading even while the grid mix hasn't arrived; the caption's constraint clause is data it owns independently of the bar (../../view/band.ts's own pattern). */
function unknownOrStateCaption(
  spec: BandSpec,
  now: CurtailmentNow | null | undefined,
  state: AppState
): string {
  if (!now) return spec.caption.unknown;
  const tense = speaksOfNow(state.curtailment?.fetchedAt, now.settlement, state.now) ? 'now' : 'past';
  return spec.caption[now.curtailedMW > 0 ? 'constrained' : 'clear'][tense];
}

/** The mean of every farm coordinate the windspeed feed has answered for so far, or null while it has answered for none. */
function averageWindspeed(speeds: Record<string, number> | undefined): number | null {
  if (!speeds) return null;
  const values = Object.values(speeds);
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** The complete statement: for Scotland, the existing constraint-voice sentence, a second clause stating the bar's own lead-fuel share and intensity in prose (026), and a third giving the tracked fleet's average windspeed (4c.5); for England, one sentence of the two facts side by side (4d). */
function twoClauseCaption(
  spec: BandSpec,
  region: RegionState,
  now: CurtailmentNow | null | undefined,
  state: AppState
): string {
  const leadPct = spec.lead === 'wind' ? region.windPct : region.gasPct;
  const words = formatIntensityWords(region.intensity.forecast ?? region.intensity.actual);

  // England (4d): one sentence of fact, not cause. The old "gas plants across
  // England make up the difference" claimed the gas was *because* Scotland's
  // wind was held back, which the data can't show — only that both are true.
  // Likewise "largely by gas" wasn't true at 35%. So: the two facts, side by
  // side, and the reader draws the line.
  if (spec.lead === 'gas') {
    const past = now ? !speaksOfNow(state.curtailment?.fetchedAt, now.settlement, state.now) : false;
    const coming = past ? 'was coming' : 'is coming';
    const share = `${formatPct(leadPct)} of England’s power ${coming} from gas, at ${words}.`;
    if (!now) return `${spec.caption.unknown} ${share}`;
    if (now.curtailedMW <= 0) return share[0].toUpperCase() + share.slice(1);
    return `While Scotland’s wind ${past ? 'was' : 'is'} held back, ${share}`;
  }

  const first = unknownOrStateCaption(spec, now, state);
  const second = `${formatPct(leadPct)} ${spec.lead} at ${words}.`;

  const avg = averageWindspeed(state.windspeed?.speeds);
  if (avg === null) return `${first} ${second}`;
  return `${first} ${second} Average wind speed ${formatWindspeed(avg)}.`;
}
