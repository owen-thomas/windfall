/**
 * The cost bar (DECISIONS 055): under the second headline ("So far today, that
 * will add about £10.51m to Great Britain's electricity bills."), the same size
 * as the share bar and built the same way, so the page reads as two claims,
 * each over its evidence.
 *
 * Not a share of anything, so not drawn like the share bar (Owen): a
 * timeline of the day, one column per half hour (48; 46 or 50 when the clocks
 * change), filling left to right as Elexon settles each one. A column's
 * height is what that half hour cost, the farms' payments (the held-back
 * blue) under the gas that replaced them (the mix panels' gas). Heights are
 * scaled to the day's dearest half hour so far, which reaches the share bar's
 * full height; when a dearer one lands, the rest shrink to make room. Slots
 * still to come are the pale track. Under it, the day's hours.
 *
 * The legend is the day's totals — "£1.81m to switch farms off", "£7.21m for
 * gas" — the settled figures the columns draw, adding up to the headline's
 * figure; the method says how far they run.
 *
 * Some farms pay to be turned down, so a half hour's net can fall to zero or
 * below. That column draws gas alone, and a day's negative net is said in
 * words in the legend.
 *
 * "Show method" under it opens the cost's half of the method: how wind that's
 * held back is paid for, and how the estimate is made. The share's half stays
 * under the first bar (views/settlement.ts).
 */

import { el, setAttr, setText, type View } from '../../view/dom';
import { formatPoundsCounter, formatTime } from '../../lib/format';
import { settlementAt } from '../../lib/settlement';
import type { AppState } from '../../lib/state';
import type { CostToday } from '../../lib/types';

function mechanism(): string {
  return (
    'The grid operator usually pays wind farms to switch off (a few pay to be switched off instead) ' +
    'and pays gas plants in England and Wales to make up the southern shortfall. Both are passed on ' +
    'through a charge on every electricity supplier in Great Britain.'
  );
}

function estimate(cost: CostToday): string {
  return (
    `The payments to the farms are Elexon’s settled figures, up to ${formatTime(cost.throughTime)} ` +
    '(the latest half hour with data). The gas is our estimate: the held-back energy priced at what ' +
    'the grid operator paid plants outside Scotland to turn up in the same half hour.'
  );
}

export function mapCostView(): View {
  function legendItem(kind: 'wind' | 'gas') {
    const figure = el('strong', { class: 'map-sources__figure' });
    const word = el('span');
    const item = el(
      'p',
      { class: `map-sources__label map-sources__label--${kind}` },
      el('span', { class: 'map-sources__swatch', 'aria-hidden': 'true' }),
      figure,
      word
    );
    return { item, figure, word };
  }
  const windLegend = legendItem('wind');
  const gasLegend = legendItem('gas');
  const labels = el('div', { class: 'map-sources__labels' }, windLegend.item, gasLegend.item);

  const columns = el('div', { class: 'cost-timeline', 'aria-hidden': 'true' });
  const slots: { wind: HTMLElement; gas: HTMLElement }[] = [];
  function setSlotCount(n: number) {
    if (slots.length === n) return;
    slots.length = 0;
    columns.replaceChildren();
    for (let i = 0; i < n; i++) {
      const wind = el('span', { class: 'cost-timeline__wind' });
      const gas = el('span', { class: 'cost-timeline__gas' });
      columns.append(el('span', { class: 'cost-timeline__slot' }, gas, wind));
      slots.push({ wind, gas });
    }
  }
  // The day's hours under it, at the quarter days (clock-change days shift by
  // an hour after 01:00; close enough for a guide).
  const hours = el(
    'div',
    { class: 'cost-timeline__hours', 'aria-hidden': 'true' },
    ...['00:00', '06:00', '12:00', '18:00', '24:00'].map((t) => el('span', { text: t }))
  );
  const bar = el('div', { class: 'cost-timeline__wrap' }, columns, hours);

  const mechanismP = el('p', { class: 'map-settlement__p', text: mechanism() });
  const estimateP = el('p', { class: 'map-settlement__p' });
  const body = el('div', { class: 'map-settlement__body', id: 'map-cost-method' }, mechanismP, estimateP);
  body.hidden = true;

  const toggleText = el('span', { class: 'map-toggle__text', text: 'Show method' });
  const toggle = el(
    'button',
    { class: 'map-sources__open', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'map-cost-method' },
    el('span', { class: 'map-toggle' }, toggleText)
  );
  toggle.addEventListener('click', () => {
    const open = body.hidden;
    body.hidden = !open;
    setAttr(toggle, 'aria-expanded', String(open));
    setText(toggleText, open ? 'Hide method' : 'Show method');
  });

  const foot = el('div', { class: 'map-sources__foot' }, toggle);
  const root = el('div', { class: 'map-sources map-cost', 'data-state': 'ok' }, labels, bar, foot, body);

  return {
    el: root,
    update(state: AppState) {
      const cost = state.cost?.cost;
      // The headline's own test (views/headline.ts hides the whole block too).
      if (!cost || cost.date !== settlementAt(state.now).date || !(cost.estimatePounds > 0)) return;

      const wind = cost.netPaymentsPounds;
      const gas = Math.max(0, cost.replacementPounds);

      setSlotCount(cost.periodsInDay);
      const byPeriod = new Map(cost.periods.map((p) => [p.period, p]));
      const peak = cost.periods.reduce(
        (max, p) => Math.max(max, Math.max(0, p.netPaymentsPounds) + Math.max(0, p.replacementPounds)),
        0
      );
      const h = (n: number) => (peak > 0 ? `${(Math.max(0, n) / peak) * 100}%` : '0%');
      slots.forEach((slot, i) => {
        const p = byPeriod.get(i + 1);
        slot.wind.style.height = h(p?.netPaymentsPounds ?? 0);
        slot.gas.style.height = h(p?.replacementPounds ?? 0);
      });

      setText(windLegend.figure, formatPoundsCounter(Math.abs(wind)));
      setText(windLegend.word, wind >= 0 ? ' to switch farms off' : ' paid by farms to be switched off');
      setText(gasLegend.figure, formatPoundsCounter(gas));
      setText(gasLegend.word, ' for gas');
      gasLegend.item.hidden = gas <= 0;

      setText(estimateP, estimate(cost));
    },
  };
}
