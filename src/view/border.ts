/**
 * The border caption: the constraint's copy, at the border's own position
 * on the map (Windfall_Map_Spec.md Part C.3, step 3).
 *
 * `/`'s constraintView is a horizontal rule spanning the paradox chain — it
 * carries the flow-marks motion from DECISIONS 020 and a `data-flow-density`
 * custom property that only makes sense against that rule geometry. The
 * map's border caption is a point-anchored panel instead (see DECISIONS 023
 * for why: North Sea/Solway, with a leader back to the drawn border line),
 * so this is a separate, lighter view rather than a reuse of constraintView
 * wholesale. What *is* reused, verbatim, is the three-state copy and the
 * tense/state selection logic — the two pages must never describe the same
 * constraint differently, so the strings live once, in constraint.ts.
 *
 * The flow-marks treatment itself (020's kill criterion, scoped to `/`'s
 * rule) is out of scope here — Windfall_Map_Spec.md §7.4 defers the
 * border's final treatment to step 6, after the border spike.
 */
import { CLEAR, CONSTRAINED, UNKNOWN } from './constraint';
import { el, setAttr, setTextCrossfade, type View } from './dom';
import { speaksOfNow, type AppState } from '../lib/state';

export function borderView(): View {
  const body = el('p', { class: 'border-caption__body' });
  const root = el(
    'div',
    { class: 'map__border-caption', 'data-state': 'unknown' },
    el('p', { class: 'eyebrow', text: 'The constraint' }),
    body
  );

  return {
    el: root,
    update(state: AppState) {
      const now = state.curtailment?.now;
      if (!now) {
        setAttr(root, 'data-state', 'unknown');
        setTextCrossfade(body, UNKNOWN);
        return;
      }
      const constrained = now.curtailedMW > 0;
      const tense = speaksOfNow(state.curtailment?.fetchedAt, now.settlement, state.now) ? 'now' : 'past';
      setAttr(root, 'data-state', constrained ? 'constrained' : 'clear');
      setTextCrossfade(body, constrained ? CONSTRAINED[tense] : CLEAR[tense]);
    },
  };
}
