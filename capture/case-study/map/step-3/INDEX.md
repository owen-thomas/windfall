# /map reference plates — step 3b

Captured 2026-09-16 from a local dev server (`npx tsx scripts/capture-states.ts`), against the
step 3b correction pass (DECISIONS 025): the Shetland inset as the default extent, and the
narration describing England rather than South England.

**These are pre-foundations plates on provisional light tokens** — DM Sans, the current
placeholder spacing and sizing, `tokens-light.css`'s current values. Step 4 ("the Figma moment")
redraws type, colour and spacing over real proportions; nothing here should be read as a finished
design. Panel size, position and bar legibility are foundations questions carried into step 4,
per DECISIONS 024/025 — not fixed in this pass.

Every state screenshot below is a **fixture demonstration**, not a captured live transition,
except `live.png` — per DECISIONS 020's labelling rule, the same one the existing `/`
case-study pack under `capture/case-study/` follows.

## Desktop, 1440×900

Each captured ~20s after load so the flow has developed, via `scripts/capture-states.ts`.

| File | State | Provenance |
|---|---|---|
| `live.png` | Whatever the grid is actually doing at capture time | **Genuine live reading** — no `?state=` param |
| `curtailing.png` | A windy evening, 2.0 GW held down | Fixture (`?state=curtailing`) |
| `calm.png` | A still day, nothing curtailed | Fixture (`?state=calm`) |
| `degraded.png` | Elexon unreachable; the generation mix still renders | Fixture (`?state=degraded`) |
| `stale.png` | Nothing refreshed for 47 minutes | Fixture (`?state=stale`) |
| `waiting.png` | Pre-first-fetch: the page has asked nothing yet | Fixture (`?state=waiting`) |
| `offline.png` | The client can't reach its own functions | Fixture (`?state=offline`) |

Every plate shows the Shetland inset (top left) — DECISIONS 025's default — with Viking's marker
and its "output enters the mainland at Noss Head" caption; the main stage carries no Shetland
cells (Skye still does — see the debug-layer check in DECISIONS 025).

A known, pre-existing property of the particle system, not introduced by this pass: on
`waiting`/`offline` (rate zeroed on landing, per DECISIONS 024's Part C.6), particles already
alive at the moment the rate drops to zero keep animating until they age out naturally rather
than vanishing on the frame the rate changes — `refreshRates()`'s own docs say this is
deliberate ("call after mutating a rate... so the *next spawn* picks it up," not existing ones).
Twenty seconds after a fresh load is long enough for a visible amount of that decay to still be
on screen in `waiting.png`/`offline.png`. Retuning that decay window is field-tuning territory
(step 6), not this pass's.

## Mobile, 375×812 (reference only)

| File | State |
|---|---|
| `mobile-curtailing.png` | `?state=curtailing`, for reference — no mobile refinement in this pass (deferred to step 4/5 per the plan) |

The narration text visibly runs under the map on this capture — expected and untouched here;
mobile stacking is step 4/5's own work, not this pass's.
