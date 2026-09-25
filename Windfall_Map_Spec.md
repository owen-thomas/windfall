# Windfall Map Page — Implementation Plan

*Handover document for executing agents. Written 16 September 2026 from a review session with Owen. Owner: Owen Thomas. Sits alongside [Windfall_Project_Plan.md](Windfall_Project_Plan.md) (the product) and [Flow_Experiment_Spec.md](Flow_Experiment_Spec.md) (the generative visual). Where this document and either of those disagree, this one wins for the map page; both older documents still govern what they built.*

---

## 1. What this builds

One new page, `/map`, that merges the two things Windfall already has into the single screen the project plan always wanted:

- the **dashboard** at `/` (live data, honest states, narration, method note), and
- the **flow visual** at `/flow` (particles born at Scottish wind farms, spreading through Britain).

The page shows Britain as a flat white island on a cream ground, the Scotland–England border drawn across it as the bottleneck, live Scottish wind flowing from its real farm locations down through England, the Scotland and England generation mixes beside their countries, and the curtailment headline under the Scotland mix.

It is built as a separate page first. When it reaches the quality bar it replaces both `/` and `/flow`. Until then the existing pages are untouched.

### What Owen's sketch specifies (16 Sept 2026)

- Vector map of Britain: white island, cream page.
- The real Scotland–England border drawn. "This is the bottleneck."
- Live wind from every tracked farm location, flowing round Scotland and down through England.
- A figure at the border for how much wind crosses it (see §4.5 — deferred, needs a data spike).
- Scotland's mix to the right of Scotland; England's mix to the left, over the Irish Sea; wind coloured to match the flow (blue).
- The curtailment headline under the Scotland mix, right-hand side.

---

## 2. Decisions carried into this plan (do not revisit)

Recorded in [DECISIONS.md](DECISIONS.md) 021. Summarised here so the build does not reopen them.

| # | Decision | Consequence |
|---|---|---|
| 1 | **The map returns.** 008 rejected a map because "coastline is not data". The coastline is now the container for three things that are data: farm locations, the border, and the flow. 008's risk (a screen spent on coastline) is mitigated because the flow fills it. | Build the map. Log this as a reversal, not a drift. |
| 2 | **Light only.** Cream ground, white island, inky blue wind. No dark variant on the map page. | The fuel palette must be rebuilt for a light ground (§5.4). The flow's `LIGHT_PALETTE` is the starting point. |
| 3 | **Two mixes: Scotland and England.** The England region as published by Carbon Intensity. Not South England (reads as cherry-picked), not three regions (density), not a blended England and Wales figure. | Add `england` to the grid payload's regions. Wales is part of the drawn island the flow passes through, with no separate number. |
| 4 | **No England and Wales blend.** Tested 16 Sept: the GB mix is not a stable weighted sum of the country mixes across a day (implied Wales weight went negative; residuals up to 8 points), so weights cannot be read from the API. A fixed demand weight would buy 2–3 points of gas on an evening at the cost of a modelled number the method note would have to defend. | The bar is labelled **England** wherever it sits on the map. |
| 5 | **The flow shows Scottish wind only.** English and Welsh wind never appear as motion; they appear inside the England bar. | Copy must say so. Adding English offshore sources is a later slice. |
| 6 | **Separate page first.** `/map` alongside `/` and `/flow` until it is ready, then it replaces both. | Vite gains a third input. Nothing in `src/view` or `src/flow` may be broken for the existing pages during the build. |
| 7 | **Border spike deferred.** The border percentage is not built until the layout exists. But the spike must land *before* any significant change to how the wind is visualised, because the border reading may change what the flow has to show. | §4.5 and §6 step 6. |
| 8 | **Island drawn, not implied.** The spec's "GB shape never drawn" acceptance test is retired for this page. | Coast conformance and particle density no longer have to draw the silhouette; the field can be retuned looser (§5.3). Offshore farms can sit in the sea (§5.2). |

Recommendations made in the session, to be confirmed visually rather than argued further: stacked bars over pie charts (§7.1); gas stays in the England bar, other secondary fuels may collapse to one muted band (§7.3).

---

## 3. Page anatomy

*Rewritten 17 Sept 2026 per DECISIONS 026. The earlier anatomy (two panels with headings, a constraint caption on the map, narration below) is superseded.*

Desktop is canonical. The island fills the viewport below the masthead with the information layer overlaid; the page scrolls to the method note and colophon.

```
┌──────────────────────────────────────────────────────────────────┐
│ Windfall ≈ Scotland wind tracker            Settlement period 24 │
│                                             12:00 to 12:30       │
│                                             ● Read 2 minutes ago │
│                                                                  │
│ At least 25% of Scotland's          ┌ ─ ┐ (Shetland inset)       │
│ tracked wind is currently      ╭────┤   ├──╮                     │
│ being held off the grid.      ╭╯  ∙  ∙  ∙  ╯                     │
│                               │ ∙  ∙   ∙ ∙╮      Scotland  0 g   │
│ ▓▓▓▓░░░░░░░░░░░░░░            ╰╮ ∙ ∙  ∙  ╯       ▓▓▓▓▓▓▓▓░░▒▒   │
│ 2,134 of the 8,400 MW           ╭╯≈≈border≈╮     Wind 67% · …    │
│ Scotland is making              │ ↓ ↓  ↓ ↓ │     Scotland is     │
│ Seagreen 887 MW · Moray West…  ╭╯  ↓ ↓ ↓  ╰╮    generating more  │
│                               ╭╯ ↓  ↓  ↓ ↓ ╰╮   than it can…     │
│ England  118 g                │ ↓ ↓ ↓  ↓ ↓ ↓ │                   │
│ ▓░░▒▒▒▒▒▒██                   ╰╮  ↓ ↓  ↓ ↓╭╯                    │
│ Wind 9% · Solar 25% · …        ╰──╮ ↓  ↓ ╭─╯                     │
│ England's demand is being         ╰──────╯                       │
│ met close to home, largely by gas…                               │
├──────────────────────────────────────────────────────────────────┤
│ ▸ How this number is worked out · source health · colophon      │
└──────────────────────────────────────────────────────────────────┘
```

Reading order for the landing stagger: headline 0, breakdown 1, Scotland 2, border 3, England 4.

**Layers, bottom to top:**

| Layer | Technology | Content |
|---|---|---|
| L0 ground | CSS | Cream page. |
| L1 island | Inline SVG | Great Britain filled white. Built from the ONS country polygons (England, Scotland, Wales) so the shape and the border come from one dataset. |
| L2 border | Inline SVG | The Scotland–England line, Solway to Berwick. Drawn as the bottleneck: weight and treatment change with constraint state (§7.4). |
| L3 flow | Canvas 2D | The existing particle system, sized to the map area, sources driven by live data. Alpha canvas over the SVG island, or the island drawn into the wash colour — decide in step 1 (§6). |
| L4 information | HTML | Masthead, headline with breakdown, two mixes with template captions, the border's hover/tap sentence, method note, colophon. No narration (026). Reuses the `src/view` modules wherever possible. |

**Alignment rule:** L1, L2 and L3 must share one projection. The canvas mask, the SVG path and every farm marker are produced by the same `Projection` from `src/flow/projection.ts`, fitted once to the map area and refitted on resize. Any drift between the drawn coast and the mask coast is a step 1 blocker.

**Mobile:** the island is portrait, so it fits a phone. The two mix panels and the headline stack below the map in reading order (Scotland, headline, border, England). Functional and legible, not the showcase, per the project plan.

---

## 4. Data

### 4.1 Geography: `scripts/build-gb-countries.ts` → `src/map/data/gb-countries.json`

Source: **ONS Open Geography, Countries (UK) boundaries, BUC (ultra-generalised) or BGC (generalised, clipped to coastline)**, requested as WGS84 GeoJSON from the ArcGIS REST endpoint. Open Government Licence. Keep England, Scotland and Wales; drop Northern Ireland; keep the mainland ring of each and drop islands (the current rule), so Skye, the Hebrides, Orkney, Shetland, Anglesey and Wight are excluded as before.

Outputs, all in lat/lon like the existing `gb-mainland.json`:

- `island`: the union ring of the three mainland polygons (the drawn shape and the mask).
- `border`: the polyline shared by the Scotland and England rings.
- `countries`: the three rings separately, for the England label anchor and for any later per-country treatment.

Keep the existing Douglas-Peucker simplification in projected space and the spur-pruning pass (the Rhins of Galloway finding). Target the same ~1200 points for the island. **Verify** that the ONS mainland ring and the Natural Earth ring the flow was tuned against are close enough that the mask, distance field and divergent field behave the same; if not, the harness numbers get re-baselined in step 1, not later.

### 4.2 Farm locations: `api/_lib/farms.ts` (or `src/map/data/farms.json`)

The 112 tracked units in `api/_lib/bmus.ts` roll up to **76 farms** by the `farm` field. Each farm needs one location:

```ts
interface FarmSite {
  farm: string;            // exactly the `farm` string in bmus.ts
  latLon: [number, number];
  offshore: boolean;
  repdRef?: string;        // REPD Ref ID the coordinate was taken from
}
```

Source: **the Renewable Energy Planning Database (REPD)**, DESNZ, quarterly CSV, which carries X/Y (British National Grid) for every site above 150 kW including offshore. Convert BNG to WGS84 in the build script. Where a farm and its extension are separate REPD rows (Whitelee, Gordonbush, Clyde), use the parent site's coordinate. Membership is a static list, curated once, for the same reason the BMU list is (015): there is no location field in the Elexon registry.

A build script should do the name-matching first pass and print unmatched farms; the remainder are matched by hand. **Every farm must have a coordinate before step 2 ships**; a farm without one is a data bug, not a display fallback.

### 4.3 Curtailment payload: per-farm live output

`CurtailmentNow` gains a `farms` array. `deriveNow` in `api/_lib/elexon.ts` currently iterates only units with acceptances; it must also read the declared level for every tracked unit so the map has output for farms that are not being curtailed.

```ts
interface FarmNow {
  farm: string;
  capacityMW: number;
  declaredMW: number;    // sum of unit PN levels at sampledAt
  instructedMW: number;  // declaredMW − curtailedMW; what is actually flowing
  curtailedMW: number;
  unitsDeclaring: number; // units with a PN at the instant
  unitsCurtailed: number;
}
```

Honesty notes for copy: a PN is a **declaration** of intended output, not a metered reading. The label is "declared output", never "generating". `instructedMW` is the honest quantity to drive the flow, because it is what the grid has actually asked the farm to put out. Units with no PN at the instant are counted in `unitsDeclaring` so the method note can say how many farms the map is currently blind to.

Cost: PN is already fetched for all units every request; this is a derivation change only, no new upstream calls.

**Fixtures:** every scenario in `src/lib/scenarios.ts` must carry `farms`, built from a fresh live capture (`scripts/probe-api.ts` or a new capture script) and bent into shape the way the existing fixtures are (012). The `curtailing` fixture should hold down the farms that were really held down on the capture date, so the map's held-down markers are a true picture bent onto the settlement clock, not an invention.

### 4.4 Grid payload: England

`api/_lib/carbon.ts` normalises regions by name. Add `england: normaliseRegion(byName('England'))` to `RegionalState`. Keep the existing regions so `/` keeps working.

### 4.5 The border figure: deferred, with a named spike

Not built in steps 1–5. What the figure needs and does not have:

- Scottish wind splits three ways: used in Scotland, exported over B6, curtailed. "Not curtailed" is the first two together. The exported share needs either Scottish demand or the boundary flow. Neither is in the current payload and Scottish demand is not published live.
- Candidate source: **NESO Data Portal, Day Ahead Constraint Flows and Limits** (boundary flow and limit per half-hour, day-ahead). A forecast, not a measurement, so if used the copy must say "NESO expected". Rough scale for the design: B6 secure capability around 6.7 GW; Scottish demand roughly 2.5–4.5 GW; tracked wind capacity 13.1 GW.

**Spike (step 6, before any flow refinement):** confirm the dataset exposes B6 by name, its cadence and publication lag, CKAN datastore access without a key, and the shape of a half-hour's row. Decide the framing: "how full is the pipe" (flow ÷ limit) is likely more honest and more legible than "share of wind crossing". Exit criteria and the fallback (no border figure, the existing constraint sentence stays) are logged as a decision before the spike starts.

Until then the border carries the existing three-state constraint copy from `src/view/constraint.ts` and no percentage.

---

## 5. The flow, adapted

Everything in `src/flow` stays as the engine. The changes are to inputs and framing, per the spec's scalability contract.

### 5.1 Sources become data

`buildWorld` and `ParticleSystem` currently import the `SOURCES` constant. They must take `Source[]` as a parameter (the `/flow` page passes the fictional seven; `/map` passes farms). A `Source` is built per farm from `farms.json` plus the live `FarmNow`:

- `rate` derives from `instructedMW` through one named function (`rateForMW`), with a floor so a farm at low output still shows a thread, and a cap so Seagreen does not drown the map. Both ends are `FieldParams`-style knobs exposed in the control panel.
- On every refresh landing, rates step to the new values and `refreshRates()` runs. Emission rate is texture, not a figure, so it may ease over up to `--dur-slow`; the figure on screen never tweens (020).
- `palette` channel: one hue family. Keep the per-source hue offset mechanism but reduce or zero the spread; the map has 76 sources and a rainbow is the failure mode the references warn against.

### 5.2 Offshore farms sit in the sea

Most curtailed capacity is offshore (Seagreen, Moray East and West, Beatrice, Neart na Gaoithe). Today they snap to the coast, which misplaces the subject. Two options, decide in step 2 with a live check:

- **Corridor (preferred):** extend the raster mask with a capsule from each offshore source to its nearest coast point, width about twice `steerThreshold`. The divergent field's BFS seeds from source cells and treats corridor cells as interior, so particles are born at sea and land where the cable does. Risk: the corridor reads as a channel in the water. Mitigation: no wash/stroke difference over the sea; the drawn island is what says "land".
- **Fallback:** marker at the true location, emission at the snapped coast point, a hairline connector between them.

### 5.3 Retune for a drawn island

With the shape drawn, coast conformance (2i) and density-driven fill (2g) stop being responsible for the silhouette. Expect to loosen conformance, lower particle count, and let the interior breathe. **This retune waits for step 6**, after the border spike (decision 7). Step 1–5 ship on the current tuned defaults with the light palette.

### 5.4 Palette

Start from `LIGHT_PALETTE` (cream `233,229,220`, hue 216). The page's `--fuel-wind` token must be the same hue family as the flow's stroke, and the rest of the fuel palette is redrawn for a light ground in the foundations pass (§6 step 4). Curtailed stays "wind, extinguished": a desaturated wind hue plus the hatch, never a warning colour.

### 5.5 Held-down farms on the map

We know which farms are being held down right now. Minimum: a farm marker whose state (declaring, held down, silent) is visible without colour alone. Candidate stronger treatment, to explore in step 6 and not before: the curtailed share of a farm's declared output is emitted and dies within a short radius, so a held-down farm visibly sputters. Log whichever is chosen with the motion honesty rules from 020.

### 5.6 Reduced motion and performance

`prefers-reduced-motion: reduce`: run the simulation off-screen for a fixed number of steps at load and on each landing, paint one long-exposure frame, and stop. Static but complete, per the project plan. Performance target unchanged: 60fps at the default count on a mid-range laptop, with the information layer in DOM so it costs the canvas nothing.

---

## 6. Build order and gates

Same discipline as before: each step lands separately, stop and show at each gate, log decisions as they are made.

**Step 1 — Geometry and composition skeleton.**
`map/index.html` and `src/map/main.ts` wired into Vite. `build-gb-countries.ts` produces the island and border. SVG island and border drawn from the shared projection; canvas mask aligned to it; the seven fictional sources still driving the flow in the light palette. Information layer as labelled placeholder boxes in the sketch's positions with real copy lengths. Mobile stack roughed in.
*Gate:* screenshot review with Owen of composition and proportions. Coast-to-mask alignment checked at 1x and 2x DPR. This is the earliest point at which the pie-versus-bar and left-versus-right questions can be judged against the real island (§7).

*Gate 1 outcome (16 Sept 2026, Owen):* passed on geometry and alignment (DECISIONS 022). Composition corrections carried into step 2: the island fills the viewport beneath the masthead and the information layer sits over it, so the page scrolls for narration, method note and colophon; the border must be the most visible line on the map, with the constraint caption moved off the land; the England panel stays on the left, exact position to be tried in two places and judged at gate 2. Bars confirmed over pies. Mobile refinement is deferred to step 4.

**Step 2 — Real farms, real output.**
`farms.json` complete for all 76 farms. Payload gains `farms`. Sources built from data; rates live; offshore decision made (§5.2); farm markers with state. Fixtures carry `farms`.
*Gate:* the `curtailing` fixture shows held-down farms where they really were; the sum of `farms[].curtailedMW` equals the headline MW; no farm is missing a coordinate.

*Gate 2 outcome (16 Sept 2026, Owen):* passed on data and containment (DECISIONS 023). Corrections carried into step 3: **islands are drawn** (Shetland, Orkney, the Hebrides, Skye, Mull, Islay, Arran, Anglesey, Wight and the rest above an area threshold), which retires the mainland-only rule in §4.1; island farms (Viking on Shetland, Edinbane on Skye) reach the mainland through corridors that follow their real export-cable landings rather than nearest-coast snapping; Shetland is tried in the true projection extent first, with a conventional inset as the fallback if the mainland shrinks too far. The England panel is narrowed and kept in the Irish Sea; the constraint caption moves to the Solway side of the border. The curtailing fixture was re-derived against all 112 units (2,050 MW), which also changed the `/` fixture and dates the capture pack's curtailing screenshot; fix at step 7.

**Step 3 — Information layer for real.**
`bandView` with new `SCOTLAND` and `ENGLAND` specs; `headlineView`, `mastheadView`, `narrationView`, `colophonView` and the method note placed; a `borderView` carrying the constraint copy on the border; state toggle and keyboard cycler working on `/map`; the tense and freshness rules (010, 017, 019) inherited untouched.
*Gate:* all seven states reachable at `/map?state=…` and each reads honestly; the method note names the farm coverage and the "declared output" caveat.

*Gate 3 outcome (16 Sept 2026, Owen):* passed on function (DECISIONS 024): all seven states live through the real view modules, seventeen islands drawn, every non-mainland farm routed to a sourced cable landing. Decisions: **the Shetland inset is the default**, with Viking's particles emitted from its Noss Head landing so the flow stays honest; the true-extent mode stays behind its toggle. Two corrections before step 4: the narration (client template and server prompt) must describe the England region on the map page rather than South England, since one screen cannot carry two gas figures for England; and the seven states are exported at 1440×900 as Figma reference plates. Panel size, position, and bar legibility are carried into step 4 as foundations questions rather than patched.

**Step 4 — Foundations pass (the Figma moment).**
Type, colour on cream, sizes, spacing. Take screenshots of the real page in three states into Figma, set the foundations over real proportions, and bring them back as `tokens-light.css` (a separate token file so `/` keeps its dark tokens until replacement). The fuel palette is redrawn here. Figma is for the static layers; the flow is judged in the browser.
*Gate:* Owen signs off the foundations; the capture pack gets a before/after.

**Step 5 — Content refinement.**
Information density, copy edits, the secondary fuels decision (§7.3), the England label placement, narration length against the new layout.
*Gate:* a read-through of every state's copy for truth, not just tone.

**Step 6 — Border spike, then flow refinement.**
Spike per §4.5, logged as a decision with exit criteria before it starts. Then, and only then: form, density, speed and behaviour of the wind; the drawn-island retune (§5.3); held-down treatment (§5.5); harness metrics re-baselined for the new mask. If the spike passes, the border figure is designed and built here.
*Gate:* harness run clean; a live check on a constrained evening captured for the case study.

**Step 7 — Replace and ship.**
`/map` becomes `/`; `/flow` retired from navigation (kept in the repo behind `noindex` as the experiment record). OG image redrawn. Capture pack updated with the map states. DECISIONS.md current. Tag v2.0.

---

## 7. Open questions, and where each gets resolved

| Question | Recommendation going in | Resolved at |
|---|---|---|
| 7.1 Pie charts or stacked bars for the mixes | Bars: same scale, fixed fuel order, fossil tail comparable, animation already built (008). A pie explored in Figma only if the bars fail on the island. | Step 1 gate, confirmed step 4 |
| 7.2 Canvas over SVG, or island painted into the canvas wash | Canvas over SVG keeps the island crisp and the flow's wash technique unchanged; test that an alpha canvas wash reads correctly on a non-uniform ground. | Step 1 |
| 7.3 Secondary fuels (solar, nuclear, biomass, imports) | Gas must stay: it is the substitution half of the paradox. The rest may collapse to one muted band unless they earn their place on the day. No non-wind sources on the map. | Step 5 |
| 7.4 Border treatment by state | Weight and mark density scale with constraint state, inheriting the flow-marks logic and kill criterion from 020. | Step 3 draft, step 6 final |
| 7.5 Curtailed farms: marker only, or sputtering emission | Marker first; sputter explored in step 6. | Step 6 |
| 7.6 Offshore: corridor or snap-with-connector | Corridor. | Step 2 |
| 7.7 England label sits over the Irish Sea as sketched | Fine, labelled England. If it reads as "Wales" in the gate review, move it east over the Midlands. | Step 1 |
| 7.8 Where the settled MWh line goes | Under the headline as now (009). | Step 3 |

---

## 8. Acceptance criteria for the page

1. The island, the border and every farm marker are drawn from one projection; no visible drift between the SVG coast and the flow's containment at any tested viewport.
2. All 76 farms have a coordinate; each tracked unit's declared and instructed output is in the payload and the map reflects it within one refresh.
3. Scotland and England mixes shown from the published regions, wind in the same hue as the flow, gas visible in England.
4. The headline curtailment figure and its states are unchanged in meaning from `/`; every honesty rule in 003, 010, 016, 017, 019 and 020 holds on `/map`.
5. All seven fixture states reachable and honest.
6. The flow shows Scottish wind only and the page says so.
7. No border percentage is shown until the spike has passed and the framing is logged.
8. Reduced motion renders a complete static frame. 60fps at default settings.
9. Desktop canonical; mobile stacks and stays legible.
10. DECISIONS.md and the capture pack current at each gate.

---

## 9. Risks

- **Mask and drawn coast disagree.** Mitigated by the single-projection rule and the step 1 alignment check.
- **76 sources overwhelm the field tuning built for seven.** Expected; the rate function's floor and cap are the first lever, the step 6 retune is the second. Do not retune the field in steps 1–5.
- **Offshore corridors look like canals.** Fallback named in §5.2.
- **Farm coordinate curation drags.** Script the REPD match; budget a half day of hand-matching; ship nothing in step 2 with a farm missing.
- **The border figure never gets an honest source.** Then the border carries words, not a percentage, and that is the plan working (007's fallback pattern).
- **Scope creep to a dashboard.** The one-screen rule stands. The map is one argument with more geography, not more panels.

---

## 10. What this plan does not change

The curtailment derivation and its floor framing. CDN caching and the settlement-period narration cache. The narration prompt, validator and fallback. The honesty rules on tense, freshness and the pre-first-fetch state. The state fixtures as the capture mechanism. Vanilla TypeScript, no framework.
