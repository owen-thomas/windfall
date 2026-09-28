# Case study capture pack

Assembled 2026-07-28, against `v1.0` ([f47746a](https://github.com/owen-thomas/windfall/commit/f47746a)), the commit live at
[windfall.scot](https://windfall.scot) when this pack was built. Extended 2026-09-28 with the map, which replaced the
dashboard as the site in `v2.0`: see [map/v2.0/](#mapv20--the-map-as-shipped-in-every-state) below.

**[DECISIONS.md](../../DECISIONS.md) is the primary source.** It carries the reasoning —
what was tried, what was rejected, and why — for everything summarised here. This pack is
the visual evidence for that reasoning, not a replacement for it. Two entries govern how
everything below must be read:

> **DECISIONS 269:** "the capture pack comes from these deployed screens" — every state
> screenshot below is captured from the live production site, not a local dev server.

> **DECISIONS 486:** "Any capture used in the case study that was produced via the state
> toggle rather than a live rollover must be labelled as a fixture demonstration, not a
> captured live transition." Applied below wherever it's relevant — see the transition
> recording.

---

## states/ — all seven reachable states, plus true live (v1.0, the dashboard)

*The original dashboard at `/`, retired in `v2.0` (DECISIONS 043). The map's states are in
[map/v2.0/](#mapv20--the-map-as-shipped-in-every-state).*

Captured at 1440×900 from `https://windfall.scot` on 2026-07-28. Six of the seven are
reached via `?state=<name>` — production-shipped fixtures per DECISIONS 012 and 269,
specifically because four of the five original states (calm, degraded, stale, waiting)
cannot be summoned from the real grid on demand.

| File | State | Provenance |
|---|---|---|
| `live.png` | Whatever the grid is actually doing at capture time | **Genuine live reading** — no `?state=` param |
| `curtailing.png` | A windy evening, 1.8 GW held down | Fixture (`?state=curtailing`) |
| `calm.png` | A still day, nothing curtailed — a first-class state, not an edge case | Fixture (`?state=calm`) |
| `degraded.png` | Elexon unreachable; the generation mix still renders | Fixture (`?state=degraded`) |
| `stale.png` | Nothing refreshed for 47 minutes, a settlement period has closed | Fixture (`?state=stale`) |
| `waiting.png` | Pre-first-fetch: the page has asked nothing yet (DECISIONS 016) | Fixture (`?state=waiting`) |
| `offline.png` | The client can't reach its own functions — nothing to degrade to | Fixture (`?state=offline`) |

`live.png` is the only one of these that is not a fixture — it's an honest capture of
whatever period the grid happened to be in on the day this pack was built.

---

## before-after-016/ — a real regression, reproduced

DECISIONS 016 ("`Has not answered yet` is a state, and the page was skipping it")
documents a real bug: `main.ts` rendered synchronously with empty feeds before the first
fetch was issued, so *empty-and-untried* looked identical to *tried-and-failed* on every
cold load. Rather than describe this from memory, both sides were reproduced from the
actual git history under identical synthetic conditions — every `/api/*` response delayed
5 seconds, screenshot taken 500ms after navigation, on a local dev server:

| File | Commit | What it shows |
|---|---|---|
| `before-cold-load.png` | [`746ac08`](https://github.com/owen-thomas/windfall/commit/746ac08) (parent of the fix) | Three confident false claims — "not reaching its data sources," "unavailable," "no reading arrived" — asserted about a fetch that simply hadn't resolved yet |
| `after-cold-load.png` | [`b1f0c44`](https://github.com/owen-thomas/windfall/commit/b1f0c44) (the fix, and everything since) | The same synthetic delay, same capture point: a neutral "Reading… Windfall is asking Elexon what is being held down this half-hour. Nothing is claimed until it answers." |

Same delay, same timing, same viewport — the only variable is the commit.

---

## transition-demo/ — the arrival crossfade

`waiting-to-curtailing.webm` (5.3s, 1440×900).

**This is a fixture demonstration, not a captured live transition — see DECISIONS 486.**
It was produced by loading `?state=waiting&dev=1` (the honest pre-fetch state) and then
clicking the toggle to `curtailing`. `main.ts`'s `selectScenario()` clears feeds to
empty-and-pending before applying the new scenario (DECISIONS 020, point 4), so the switch
plays out as a genuine arrival choreography — the same staggered per-field crossfade
(`--stagger-step`, north → headline → constraint → south → narration) a first-time visitor
actually sees — rather than a hard cut between two fixtures' numbers.

It is **not** a recording of a live settlement-period rollover or curtailment engaging;
those moments were explicitly ruled out as toggle-driven captures by the same DECISIONS
entry, precisely because presenting a synthetic juxtaposition as the real event would be
the same failure DECISIONS 013/014 exist to avoid.

---

## narrate-eval-log.txt — the prompt-iteration log

Output of `npm run narrate:eval`, which DECISIONS 019 names directly as "the phase 2
prompt-iteration log": it runs the same `situationOf → buildPrompt → generate → validate`
path `api/narration.ts` uses, against the three fixtures that have anything to narrate
(`curtailing`, `calm`, `degraded`).

**This run is a dry run.** No `ANTHROPIC_API_KEY` is configured for this deployment (a
deliberate choice — see the narration slot's deterministic-template fallback), so the log
shows the exact facts and constructed prompt for each fixture but stops short of a model
call. Re-running with a key appends the generated text, its word count against the
40–70 word band, and the validator's pass/fail verdict (hallucinated-figure check,
second-person ban, exclamation-mark ban) for each fixture.

---

## retired/ — `/` and `/flow` on the day they were retired

Captured from `https://www.windfall.scot` on 2026-09-25 (retina, 2×), just before `/map`
replaced the index and `/flow` was removed — the last record of both pages as they were
deployed. Script: `scripts/capture-retired.ts`.

| File | Page | Provenance |
|---|---|---|
| `index-live-desktop.png` | `/`, the original dashboard, 1440×900, full page | **Genuine live reading** |
| `index-live-mobile.png` | `/`, 375×812, full page | **Genuine live reading** |
| `index-curtailing-desktop.png` | `/`, 1440×900, full page | Fixture (`?state=curtailing`) |
| `flow-desktop.png` | `/flow`, the flow experiment, 1440×900, after 20s | Its fictional seven sources, as shipped |
| `flow-mobile.png` | `/flow`, 375×812, after 20s | Its fictional seven sources, as shipped |

---

## map/v2.0/ — the map, as shipped, in every state

Captured from `https://www.windfall.scot` on 2026-09-28 at 11:17–11:22 BST (settlement period 23), retina 2×,
against [`3048deb`](https://github.com/owen-thomas/windfall/commit/3048deb). Desktop plates are 1440×900 (the page fits
the viewport); phone plates are 375 wide, full page. Each plate waits 20 seconds after load so the entrance has finished
and the flow has spread across the island. Script: `scripts/capture-map.ts` (`npx tsx scripts/capture-map.ts [filter]`
to re-take plates whose filename contains the filter).

A `?state=` load shows the state toggle in the footer, as it does for any visitor who uses one, so the fixture plates
keep it: it is the on-screen sign that the reading is a fixture (DECISIONS 486).

| File | State | Provenance |
|---|---|---|
| `live-desktop.png` | 44% held back, 1,265 MW of 2,873 MW declared | **Genuine live reading**, no `?state=` |
| `live-mobile.png` | The same half hour on a phone | **Genuine live reading** |
| `curtailing-desktop.png` | A windy evening, 2.0 GW held down | Fixture (`?state=curtailing`) |
| `curtailing-mobile.png` | The same, on a phone | Fixture (`?state=curtailing`) |
| `curtailing-method-open-desktop.png` | "Show method" open: the page's one explanation | Fixture (`?state=curtailing`), toggle clicked |
| `curtailing-farm-selected-desktop.png` | Beatrice selected: its marker ringed, its thread picked out, the rest of the wind dimmed | Fixture (`?state=curtailing`), row clicked |
| `calm-desktop.png` | Nothing held back: "100% … is currently on the grid" | Fixture (`?state=calm`) |
| `calm-mobile.png` | The same, on a phone | Fixture (`?state=calm`) |
| `degraded-desktop.png` | Elexon down: bar and list kept, every farm unknown, the mix unaffected (042) | Fixture (`?state=degraded`) |
| `stale-desktop.png` | A reading 47 minutes old, in the past tense | Fixture (`?state=stale`) |
| `waiting-desktop.png` | Before the first answer: the page claims nothing | Fixture (`?state=waiting`) |
| `offline-desktop.png` | The page can't reach its own functions | Fixture (`?state=offline`) |

The selected farm is Beatrice rather than the list's first farm: in the fixture Seagreen is fully held back, and a farm
with nothing on the grid has no particles to pick out (038).

**Not captured: the Elexon fallback (DECISIONS 045).** On the morning of 28 September Elexon stopped publishing for
several hours, and the site read "100% … on the grid" over 0 MW until 044 and 045 were deployed. No plate was taken of
the fallback while it was live ("At least 36% … was held back from the grid between 05:30 and 06:00"), and there is no
fixture for it. A local screenshot of it exists only in that session's transcript, not in this pack.

The earlier map plates (`map/step-3/`, `map/step-4/`, `map/step-4b/`) are the build's gate captures, taken as each
step was reviewed, and are kept as process evidence.

---

## What's not in this pack

- **Real generated narration examples** — blocked on the dry-run limitation above.
- **A live rollover or curtailment-engaging recording** — per DECISIONS 486, capturing
  these honestly means waiting for the actual settlement-period event on the deployed
  site, not staging one.
- **Cross-browser (WebKit/Safari) screenshots** — attempted separately; the iOS Simulator
  panel crashed and stopped retrying. The states/ captures above are all Chromium.
