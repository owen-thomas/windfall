/**
 * Entrances on the map page (Owen): bars grow in from the left, and lists
 * (farm rows, mix legends) cascade in, each item a step after the one before.
 *
 * One mechanism for all of them: `data-enter` puts an element in its entering
 * look (map.css — faded, or a bar at scaleX(0)) with transitions off, and a
 * frame later the attribute comes off and the element's ordinary transitions
 * carry it to where it already is. `--enter-i` is the item's place in the
 * cascade, read by map.css as a delay.
 *
 * Entrances use transform and opacity only, never width, so they never fight
 * the width transitions that slide a bar to a new reading. Under
 * `prefers-reduced-motion` every duration and step is ~0 (tokens.css,
 * map.css), so the entering look is simply never seen.
 */
export function enter(elements: Iterable<HTMLElement>): void {
  const list = [...elements];
  if (list.length === 0) return;
  list.forEach((element, i) => {
    element.style.setProperty('--enter-i', String(i));
    element.setAttribute('data-enter', '');
  });
  // Two frames: the first commits the entering look (the element may have
  // only just been shown), the second releases it so the transition runs.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      for (const element of list) element.removeAttribute('data-enter');
    })
  );
}
