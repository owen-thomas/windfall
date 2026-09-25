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
 */

import { el, setAttr, setText, setTextCrossfade, type View } from '../../view/dom';
import { enter } from '../enter';
import { FUEL_ORDER, orderMix } from '../../lib/fuels';
import { formatIntensity, formatIntensityWords, formatPct, fuelLabel } from '../../lib/format';
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
  /** The first mix has landed and played its entrance. */
  let arrived = false;

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
        setTextCrossfade(intensity, 'Waiting for carbon intensity');
        for (const { seg, label } of segments.values()) {
          seg.style.flexBasis = '0%';
          setText(label, '');
        }
        if (legendKey !== '') {
          legend.replaceChildren();
          legendKey = '';
        }
        setTextCrossfade(caption, now ? unknownOrStateCaption(spec, now, state) : unknownCaption(spec));
        return;
      }

      if (!region) {
        setAttr(root, 'data-state', 'failed');
        setText(place, spec.placeholderName);
        setTextCrossfade(intensity, 'Carbon intensity unavailable');
        for (const { seg, label } of segments.values()) {
          seg.style.flexBasis = '0%';
          setText(label, '');
        }
        if (legendKey !== '') {
          legend.replaceChildren();
          legendKey = '';
        }
        setTextCrossfade(caption, unknownCaption(spec));
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

      // Arrival: the bar grows in from the left and the legend cascades in
      // after it. Later readings slide the segments instead (flex-basis
      // transitions, app.css).
      if (!arrived) {
        arrived = true;
        enter([bar]);
        enter([...legend.children] as HTMLElement[]);
      }

      setTextCrossfade(caption, twoClauseCaption(spec, region, now, state));
    },
  };
}

/**
 * The caption for when the constraint can't be read. /map's own wording of
 * ../../view/band.ts's `unknown` line (which `/` keeps): contractions and
 * "half hour", as the rest of the page is written (4d, Owen).
 */
function unknownCaption(spec: BandSpec): string {
  // England's `unknown` ("English demand leans on gas whenever northern wind
  // can't reach it") is the cause-and-effect claim 4d took out of its main
  // sentence, so /map says only what it can't read.
  if (spec.lead === 'gas') return 'England’s grid mix can’t be read this half hour.';
  return spec.caption.unknown.replace(/cannot/g, 'can’t').replace(/half-hour/g, 'half hour');
}

/** The pending state can still have a curtailment reading even while the grid mix hasn't arrived; the caption's constraint clause is data it owns independently of the bar (../../view/band.ts's own pattern). */
function unknownOrStateCaption(
  spec: BandSpec,
  now: CurtailmentNow | null | undefined,
  state: AppState
): string {
  if (!now) return unknownCaption(spec);
  const tense = speaksOfNow(state.curtailment?.fetchedAt, now.settlement, state.now) ? 'now' : 'past';
  return spec.caption[now.curtailedMW > 0 ? 'constrained' : 'clear'][tense];
}

/** The complete statement: for Scotland, the existing constraint-voice sentence, and a second clause stating the bar's own lead-fuel share and intensity in prose (026); for England, one sentence of the two facts side by side (4d). */
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
    // No curtailment reading: the mix alone, no claim about Scotland's wind.
    if (!now) return share[0].toUpperCase() + share.slice(1);
    if (now.curtailedMW <= 0) return share[0].toUpperCase() + share.slice(1);
    return `While Scotland’s wind ${past ? 'was' : 'is'} held back, ${share}`;
  }

  const first = unknownOrStateCaption(spec, now, state);
  const second = `${formatPct(leadPct)} ${spec.lead} at ${words}.`;
  return `${first} ${second}`;
}
