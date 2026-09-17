/**
 * The map's headline (Windfall_Map_Spec.md §3 Part A.2, DECISIONS 026):
 * one sentence, the largest type on the page, the page's whole argument —
 * not `../../view/headline.ts`'s three-part eyebrow/figure/predicate stack,
 * which `/` still uses unchanged.
 *
 * The percentage is curtailed output over *declared* output for the tracked
 * farms at the sampled instant — the share of the wind Scotland is making,
 * not the share of installed capacity (026's own reasoning: capacity counts
 * every farm idle for lack of wind, which understates the share on a windy
 * day). `declaredMW` is the sum of `curtailment.now.farms[].declaredMW` —
 * the same field the breakdown line and the bar below both read, so the
 * headline, the bar and the line can never disagree (§4.3). Rounding is
 * always down (formatPctFloor, format.ts) — 003's floor framing applied to
 * the display, not just the derivation.
 */

import { clear, el, setAttr, setText, setTextCrossfade, type View } from '../../view/dom';
import { formatMW, formatMWh, formatPctFloor, formatPeriodSpan, joinList } from '../../lib/format';
import type { CurtailedUnit, CurtailmentResponse } from '../../lib/types';
import { speaksOfNow, type AppState } from '../../lib/state';

/** Farms below this share of the headline are folded into "and others" — same threshold ../../view/headline.ts uses. */
const NAMED_FARMS = 4;

export function mapHeadlineView(): View {
  const lead = el('span', { class: 'map-headline__lead' });
  const figure = el('strong', { class: 'map-headline__figure' });
  const tail = el('span', { class: 'map-headline__tail' });
  const sentence = el(
    'p',
    { class: 'map-headline__sentence', id: 'map-headline-sentence' },
    lead,
    figure,
    tail
  );

  const shareFill = el('div', { class: 'share__fill' });
  const shareBar = el('div', { class: 'share', 'aria-hidden': 'true' }, shareFill);
  const breakdown = el('p', { class: 'map-headline__breakdown' });
  const farms = el('p', { class: 'headline__farms' });

  const root = el(
    'section',
    { class: 'map-headline', 'data-state': 'ok', 'aria-labelledby': 'map-headline-sentence' },
    sentence,
    el('div', { class: 'map-headline__evidence' }, shareBar, breakdown, farms)
  );

  return {
    el: root,
    update(state: AppState) {
      const data = state.curtailment;
      const present = speaksOfNow(data?.fetchedAt, data?.now?.settlement, state.now);

      if (!data?.now && state.pending) {
        setAttr(root, 'data-state', 'pending');
        setTextCrossfade(lead, '');
        setTextCrossfade(figure, 'Reading.');
        setTextCrossfade(
          tail,
          ' Windfall is asking Elexon what is being held down this half-hour. Nothing is claimed ' +
            'until it answers.'
        );
        shareFill.style.width = '0%';
        setText(breakdown, '');
        setText(farms, '');
        return;
      }

      if (!data || !data.now) {
        setAttr(root, 'data-state', 'failed');
        setTextCrossfade(lead, '');
        setTextCrossfade(figure, 'Unavailable.');
        setTextCrossfade(
          tail,
          state.curtailmentError
            ? ' Windfall could not reach its own reading of the balancing mechanism.'
            : ' Elexon’s balancing data did not answer this time. The generation mix above is unaffected.'
        );
        shareFill.style.width = '0%';
        setText(breakdown, '');
        setText(farms, '');
        return;
      }

      const { curtailedMW, units, farms: farmsNow } = data.now;
      const declaredMW = farmsNow.reduce((sum, f) => sum + f.declaredMW, 0);

      if (curtailedMW <= 0) {
        setAttr(root, 'data-state', 'none');
        setTextCrossfade(lead, '');
        setTextCrossfade(figure, 'None');
        setTextCrossfade(
          tail,
          present
            ? " of Scotland's tracked wind is currently being held off the grid."
            : " of Scotland's tracked wind was being held off the grid when this was last read."
        );
        shareFill.style.width = '0%';
        setText(breakdown, `0 of the ${formatMW(declaredMW)} Scotland is making.`);
        setText(farms, '');
        return;
      }

      setAttr(root, 'data-state', 'curtailing');
      const pct = declaredMW > 0 ? (curtailedMW / declaredMW) * 100 : 0;
      setTextCrossfade(lead, 'At least ');
      setTextCrossfade(figure, formatPctFloor(pct));
      setTextCrossfade(
        tail,
        present
          ? " of Scotland's tracked wind is currently being held off the grid."
          : " of Scotland's tracked wind was being held off the grid when this was last read."
      );

      shareFill.style.width = `${Math.min(100, pct)}%`;
      // Spec's exact phrasing (026): "{curtailed} of the {declared} MW
      // Scotland is making" — the first figure is bare (curtailedMW,
      // formatted without its own unit) because the second figure's "MW"
      // covers both, the same construction the decision's own example uses.
      setText(
        breakdown,
        `${Math.round(curtailedMW).toLocaleString('en-GB')} of the ${formatMW(declaredMW)} Scotland is making.`
      );

      clear(farms);
      farms.append(...farmNodes(units));
    },
  };
}

/** Roll units up to the farms people have heard of — mirrors ../../view/headline.ts's own rollup. */
function byFarm(units: CurtailedUnit[]): { farm: string; mw: number }[] {
  const totals = new Map<string, number>();
  for (const unit of units) {
    totals.set(unit.farm, (totals.get(unit.farm) ?? 0) + unit.curtailedMW);
  }
  return [...totals.entries()]
    .map(([farm, mw]) => ({ farm, mw }))
    .sort((a, b) => b.mw - a.mw);
}

function farmNodes(units: CurtailedUnit[]): Node[] {
  const farms = byFarm(units);
  if (farms.length === 0) return [];

  const named = farms.slice(0, NAMED_FARMS);
  const rest = farms.slice(NAMED_FARMS);
  const nodes: Node[] = [];

  named.forEach((entry, index) => {
    if (index > 0) nodes.push(el('span', { class: 'farms__sep', text: '·' }));
    nodes.push(
      el(
        'span',
        { class: 'farms__item' },
        el('span', { class: 'farms__name', text: entry.farm }),
        el('span', { class: 'farms__mw', text: formatMW(entry.mw) })
      )
    );
  });

  if (rest.length > 0) {
    nodes.push(el('span', { class: 'farms__sep', text: '·' }));
    const names = rest.map((r) => r.farm);
    nodes.push(
      el('span', {
        class: 'farms__rest',
        text:
          names.length <= 3
            ? joinList(names)
            : `and ${names.length} more, ${joinList(names.slice(0, 2))} among them`,
      })
    );
  }
  return nodes;
}

/** Exposed for the method note (main.ts) and the swatch plate — the same settled-period line ../../view/headline.ts used to show on-screen, moved to the method note per 026. */
export function settledLine(data: CurtailmentResponse | null): string {
  if (!data?.settled) return '';
  const { curtailedMWh, settlement } = data.settled;
  const span = formatPeriodSpan(settlement.periodStart, settlement.periodEnd);
  if (curtailedMWh <= 0) return `Nothing in the last complete half-hour either, ${span}.`;
  return `${formatMWh(curtailedMWh)} over the last complete half-hour, ${span}.`;
}
