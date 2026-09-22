/**
 * A region band: one place, one mix bar.
 *
 * North and south are drawn identically — same scale, same fuel sequence,
 * same type — so the only difference on screen is the data. That is the
 * argument: put the two bars one above the other and the fossil tail in the
 * south is visible before any number is read.
 *
 * Every segment exists from the start with a width of zero, so a fuel
 * appearing or vanishing is a width change rather than a node swap. The
 * phase 3 motion pass depends on that.
 */

import { el, setAttr, setText, setTextCrossfade, type View } from './dom';
import { FUEL_ORDER, orderMix } from '../lib/fuels';
import { formatIntensity, formatPct, fuelLabel } from '../lib/format';
import type { RegionState, RegionalState } from '../lib/types';
import { speaksOfNow, type AppState } from '../lib/state';

export interface BandSpec {
  side: 'north' | 'south';
  eyebrow: string;
  /** The fuel this band's reading leads with. */
  lead: 'wind' | 'gas';
  /**
   * Shown in the pending/failed states, before a real region name has
   * arrived from the payload. Explicit per spec (rather than derived from
   * `side`) because two specs can share a side but name a different place —
   * SOUTH (South England) and ENGLAND (England) both read `side: 'south'`.
   */
  placeholderName: string;
  /**
   * The caption asserts something about the constraint, so it has to follow
   * the constraint — including when the constraint is unreadable. On a calm
   * day the curtailment copy would simply be false; with Elexon down, both
   * the "held back" and the "coping" copy would be claims the page cannot
   * support. A screen that keeps asserting through its own outage is the
   * fastest way to lose a reader who is checking.
   */
  caption: {
    /** Present and past tense of the same claim; see DECISIONS 010. */
    constrained: { now: string; past: string };
    clear: { now: string; past: string };
    /** Tense-free: it describes the standing relation, not this half-hour. */
    unknown: string;
  };
  pick: (regions: RegionalState) => RegionState | null;
}

/**
 * A segment narrower than this cannot hold its own label without clipping at
 * the narrow end of the desktop range. Everything below it is still read in
 * full from the legend directly beneath the bar.
 */
const LABEL_THRESHOLD_PCT = 12;

export function bandView(spec: BandSpec): View {
  const place = el('h2', { class: 'band__place' });
  const reading = el('p', { class: 'band__reading' });
  const leadFigure = el('span', { class: 'band__lead' });
  const intensity = el('span', { class: 'band__intensity' });
  reading.append(leadFigure, el('span', { class: 'band__sep', text: '·' }), intensity);

  const segments = new Map<string, { seg: HTMLElement; label: HTMLElement }>();
  const bar = el('div', { class: 'mix', 'aria-hidden': 'true' });
  for (const fuel of FUEL_ORDER) {
    const label = el('span', { class: 'mix__label' });
    const seg = el('div', { class: 'mix__seg', 'data-fuel': fuel, style: 'flex-basis:0%' }, label);
    segments.set(fuel, { seg, label });
    bar.append(seg);
  }

  // The accessible reading of the bar: the same numbers as text. Rebuilt
  // only when its content actually changes (see legendKey below) — the 15s
  // render tick calls update() far more often than the mix does, and a
  // fresh set of nodes every tick would both churn the DOM and refire any
  // transition on the legend items for no reason.
  const legend = el('dl', { class: 'legend' });
  let legendKey = '';

  const note = el('p', { class: 'band__caption' });
  const foot = el('div', { class: 'band__foot' }, legend, note);

  const root = el(
    'section',
    { class: 'band', 'data-side': spec.side, 'data-state': 'ok' },
    el(
      'div',
      { class: 'band__head' },
      el(
        'div',
        { class: 'band__id' },
        el('p', { class: 'eyebrow', text: spec.eyebrow }),
        place
      ),
      reading
    ),
    bar,
    foot
  );

  return {
    el: root,
    update(state: AppState) {
      const region = state.grid?.regions ? spec.pick(state.grid.regions) : null;
      const now = state.curtailment?.now;
      if (!now) {
        setTextCrossfade(note, spec.caption.unknown);
      } else {
        const tense = speaksOfNow(state.curtailment?.fetchedAt, now.settlement, state.now)
          ? 'now'
          : 'past';
        setTextCrossfade(note, spec.caption[now.curtailedMW > 0 ? 'constrained' : 'clear'][tense]);
      }

      if (!region && state.pending) {
        setAttr(root, 'data-state', 'pending');
        setText(place, spec.placeholderName);
        setTextCrossfade(leadFigure, 'Reading');
        setTextCrossfade(intensity, 'Waiting for Carbon Intensity');
        for (const { seg, label } of segments.values()) {
          seg.style.flexBasis = '0%';
          setText(label, '');
        }
        if (legendKey !== '') {
          legend.replaceChildren();
          legendKey = '';
        }
        setAttr(foot, 'data-empty', 'true');
        return;
      }

      if (!region) {
        setAttr(root, 'data-state', 'failed');
        setText(place, spec.placeholderName);
        setTextCrossfade(leadFigure, 'No reading');
        setTextCrossfade(intensity, 'Carbon Intensity unavailable');
        for (const { seg, label } of segments.values()) {
          seg.style.flexBasis = '0%';
          setText(label, '');
        }
        if (legendKey !== '') {
          legend.replaceChildren();
          legendKey = '';
        }
        setAttr(foot, 'data-empty', 'true');
        return;
      }
      setAttr(foot, 'data-empty', null);

      setAttr(root, 'data-state', 'ok');
      setText(place, region.name);
      const leadPct = spec.lead === 'wind' ? region.windPct : region.gasPct;
      setTextCrossfade(leadFigure, `${formatPct(leadPct)} ${spec.lead}`);
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
    },
  };
}

export const NORTH: BandSpec = {
  side: 'north',
  eyebrow: 'The wind is here',
  lead: 'wind',
  placeholderName: 'Scotland',
  caption: {
    constrained: {
      now: 'Scotland is generating more than it can use, and more than the network can carry away.',
      past: 'Scotland was generating more than it could use, and more than the network could carry away.',
    },
    // Reworded post-4c (DECISIONS 030): keyed on the same `curtailedMW <= 0`
    // as the map's on-grid headline, so the two never disagreed — but paired
    // with a headline now reading "100% on the grid", "generating less than
    // the network can carry" read as a caveat pulling against that claim
    // rather than the reason for it. Landed on a subject/verb echo of its own
    // constrained sibling above ("Scotland is generating more/less than…"),
    // "wind" specific (this page's mechanism is wind curtailment, not
    // generation broadly) and "south" kept (not "network capacity" alone):
    // this page's whole argument is one specific link, not a generic limit.
    // Shared with `/` via the SCOTLAND alias below. `past` exists for the
    // same reason every caption's does — the settlement-period-closed gap
    // 031 shrank but did not remove — and is not a present-tense claim
    // wearing a past-tense label: see 010/016/017.
    clear: {
      now: 'Scotland is generating less wind than the southbound network can carry.',
      past: 'Scotland was generating less wind than the southbound network could carry.',
    },
    unknown: 'How much of this reaches the south cannot be read this half-hour.',
  },
  pick: (r) => r.scotland ?? r.northScotland,
};

/**
 * The map's Scotland band (Windfall_Map_Spec.md Part C.1, step 3) — "as
 * NORTH today", per the plan: literally the same spec, not a rewrite,
 * because `/map` wants the identical claim `/` already makes about the
 * north. Aliased rather than duplicated so the two pages can't drift.
 */
export const SCOTLAND: BandSpec = NORTH;

/**
 * The map's England band. Reads the `england` region (added to
 * RegionalState/carbon.ts alongside this) rather than South England — see
 * DECISIONS 021's reasoning for the map showing all of England, not a
 * sub-region. Three voices, matching SOUTH's own pattern but named for the
 * whole country the map actually draws.
 */
export const ENGLAND: BandSpec = {
  side: 'south',
  eyebrow: 'The demand is here',
  lead: 'gas',
  placeholderName: 'England',
  caption: {
    constrained: {
      now: 'With the northern wind held back, gas plants across England make up the difference.',
      past: 'With the northern wind held back, gas plants across England made up the difference.',
    },
    clear: {
      now: 'English demand is being met close to home, largely by gas.',
      past: 'English demand was being met close to home, largely by gas.',
    },
    unknown: 'English demand leans on gas whenever northern wind cannot reach it.',
  },
  pick: (r) => r.england,
};

export const SOUTH: BandSpec = {
  side: 'south',
  eyebrow: 'The demand is here',
  lead: 'gas',
  placeholderName: 'South England',
  caption: {
    constrained: {
      now: 'With the northern wind held back, gas plants in the south make up the difference.',
      past: 'With the northern wind held back, gas plants in the south made up the difference.',
    },
    clear: {
      now: 'Southern demand is being met close to home, largely by gas.',
      past: 'Southern demand was being met close to home, largely by gas.',
    },
    unknown: 'Southern demand leans on gas whenever northern wind cannot reach it.',
  },
  pick: (r) => r.southEngland ?? r.southEastEngland,
};
