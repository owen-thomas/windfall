# Windfall Map Page — Step 4c: the positive reframe, source list, windspeed, passive border

*Handover document for the executing agent. Written 21 September 2026 from a review of the [Windfall Figma file](https://www.figma.com/design/U0SX1DLul7zwXW59uuF0xl/Windfall?node-id=49-747) with Owen — the **Desktop HD** frame, node `49:747`, is the reference picture for this step. Sits under [Windfall_Map_Spec_4b.md](Windfall_Map_Spec_4b.md): 4b put the page on a 12-column grid, flipped its composition and applied the navy palette. 4c changes what the page **says and does** — it turns the headline from a negative frame ("held off the grid") to a positive one ("on the grid"), rebuilds the farm list into an interactive, always-present source panel with per-farm windspeed, consolidates every explanation into one disclosure, and makes the border a passive divider. Where this document and 4b disagree, this one wins. The flow engine, geometry, islands, projection and data payload are untouched (§8).*

*Log every decision in DECISIONS.md as it is made, as the earlier steps did. Land each stage separately; stop and show at each gate.*

---

## 1. The reference frame, read plainly

The Desktop HD frame (`49:747`) shows, left to right:

- **Masthead** top-left: `Windfall ≈ Scotland wind energy tracker` (navy Eczar), unchanged.
- **Headline** (Eczar, largest type): *"Up to **84%** of Scotland's tracked wind is currently on the grid."* — the figure is now the **share on the grid**, not the megawatts held off.
- **The breakdown bar**: a solid navy bar labelled `10,971 of 13,105 MW`, filled to ~84%, with a **disclosure chevron** on its right.
- **The source list** directly under the bar: two columns, each row = coloured dot • **farm name** • `≈ 34 km/h` • a **mini-bar** • `887 MW`.
- **The settlement-period row** in its own box: `Settlement period 31 · 15:00 to 15:30 · ● Read 6 minutes ago`, with its **own disclosure chevron**. The placeholder line beneath it ("Rewrite to explain how this number is worked out and why it's curtailed…") is Owen's note for the consolidated, rewritten explanation.
- **Byline** bottom-left: `Built by Owen Thomas  ✺  owenthomas.work`.
- **Map**: Shetland inset moved to the **top-right, above** the Scotland panel; the Scotland/England **border** drawn as a plain dark line across the land border; Scotland and England mix panels as in 4b.

## 2. Decisions already made (build to these — do not relitigate)

1. **Positive frame.** The headline states the share of Scotland's tracked wind currently **on the grid**, where on-grid = instructed output = `declaredMW − curtailedMW`, over **declared** output (not capacity — same reasoning as 026/4b).
2. **No "Up to"; floor the figure.** Drop the "Up to" hedge. State the percentage plainly and round it **down** (`formatPctFloor`), so the bare number can never overstate how much wind is getting through — the same conservative principle the old "at least" framing used, applied to the new headline number. The frame's "84%" therefore reads **"83%"**; a fully-clear half-hour reads a true **"100%"**. The substantive caveat (Windfall counts only instructed turn-downs, so real curtailment may be higher and the true on-grid share a little lower) lives in the settlement-period disclosure (§7), **not** the headline.
3. **The breakdown bar** shows `{onGridMW} of {declaredMW} MW`, filled to the on-grid share. Both numbers and the fill come from the same payload as the headline, so they cannot disagree.
4. **Per-farm mini-bar = that farm's on-grid share** (`instructedMW / declaredMW`), the same quantity the big bar shows for Scotland as a whole. The bar alone carries it — **no percentage figure** in the row.
5. **Source list = top 8 tracked farms by declared output**, both columns together, with a **"View all"** affordance revealing the rest. Sort is stable (by declared output), not by curtailment, so rows don't reshuffle each refresh.
6. **Two disclosures, distinct jobs:**
   - **The bar's chevron** toggles the **source list**. Open by default on desktop; **collapsed by default on mobile** (density). Native `<details>` with the bar row as `<summary>`; set the initial `open` state from a `matchMedia` check at load.
   - **The settlement-period chevron** toggles the **one consolidated explanation** (§7): how the number is worked out + the constraint/curtailment note, rewritten concise. This replaces the current separate `method` `<details>` and the border tooltip.
7. **Select-to-highlight.** Each source row is a button (hover, selected, keyboard-navigable, whole-row hit target). Selecting a farm highlights it **on the map** — its marker and its flow particles — and dims the rest of the wind so the selection reads; clicking anywhere else resets. Single-select.
8. **Border is passive.** No hit area, label, tooltip or overlay. A plain line in the display-ink dark blue (`--text-primary`), extended so it meets the island's coast on **both** ends. Its explanation lives only in the settlement disclosure.
9. **Windspeed** is a new feed: **Open-Meteo** (free, no key, km/h by lat/lon, batchable), one cached server route for all farm coordinates, shown in each source row as `≈ N km/h`, always visible. **Shipped as a follow-on (§4c.5)** after the main run — it is the one new external dependency and is independent of everything else.
10. **Colours** are re-matched to the Desktop HD frame (§3).

## 3. Palette — match Desktop HD

The 4b tokens were sampled from earlier frames; re-match them to `49:747`. Read the exact fills from Figma rather than eyeballing the PNG: the **cloud Figma connector works** (the "official Figma MCP" server — `get_screenshot`/`get_design_context` on `fileKey U0SX1DLul7zwXW59uuF0xl`, `nodeId 49:747`); the desktop-bridge Figma tools error on this file, and `get_variable_defs` is empty (the file uses raw fills), so read fills off the mix-bar and legend nodes via `get_design_context`, or sample the returned screenshot.

Update in [`src/styles/tokens-light.css`](src/styles/tokens-light.css): every `--fuel-*` (both the Scotland set — wind/solar/nuclear — and the fuller England set — wind/solar/nuclear/biomass/imports/gas), `--text-primary` (display ink), and any of `--fuel-wind`/`--wind-live`/`--bar-*` that drift from the frame. Keep them as tokens. **Re-run the DECISIONS 027 WCAG AA contrast check** and confirm on the `?plate=tokens` swatch plate ([`src/map/swatchPlate.ts`](src/map/swatchPlate.ts)) before moving on.

*Gate:* the swatch plate matches the frame's fuels and ink; every text/swatch pair clears AA (or the disclosed 027 exceptions are re-confirmed).

---

## 4. Build order

Each stage lands separately, with a gate. Files named are the starting points, not an exhaustive list. Stages 4c.1–4c.4 are the main run; **4c.5 (windspeed) is a follow-on**, shipped after them — the source rows render without the `≈ N km/h` clause until it lands.

### 4c.1 — Palette + quick wins
Low-risk changes, grouped:

- **Palette:** §3.
- **Byline:** `Built by Owen Thomas  ✺  owenthomas.work` — the separator is the `✺` glyph (U+273A, sixteen-pointed asterisk), with clear space each side (set the spacing in CSS on the separator rather than relying on collapsed literal spaces), and the domain a link in `--link`. Set in [`src/map/main.ts`](src/map/main.ts) where the byline text is currently set (it overrides `colophonView`'s default), and/or [`src/view/colophon.ts`](src/view/colophon.ts).
- **Shetland box** ([`src/map/main.ts`](src/map/main.ts) `insetBox`, [`src/map/map.css`](src/map/map.css) `.map__inset-*`): move it **above** the Scotland mix inside the Scotland panel (swap the order of `scotlandBand.el` and `insetBox`); remove the box outline/background (`.map__inset-box` border + background); remove the "…output enters the mainland at…" caption (drop `landingCaption` rendering in `drawInset`, and the `.map__inset-captions` block); restyle the "Shetland" label (`.map__inset-label`) to Eczar (`--font-display`) **regular**, **16px**, colour `--text-primary`, and remove the centred muted treatment.
- **Colophon squares** ([`src/view/colophon.ts`](src/view/colophon.ts), [`src/map/map.css`](src/map/map.css) `.map-foot .sources`): remove the coloured `source__mark` before "Carbon Intensity" and "Elexon Insights" on /map (the health state is still carried by the status word beside each — "answering" etc. — so nothing is lost). Tighten the gap between the two source rows, and add clear space between them and the byline.
- **Border → passive** (§6): do it here since it is now a deletion, not a feature. Remove `borderHit`, `borderLabel`, `borderOverlay`, the tooltip (`borderView`) and all the pointer/tap/focus handling in [`src/map/main.ts`](src/map/main.ts); restyle `.map__border-line` to `stroke: var(--text-primary)` at full opacity and extend `BORDER_LINE` at both ends so the drawn line reaches the coastline on the west and east. The constraint sentence it used to show is rehomed in 4c.4 — until then, leave the existing `method__map-constraint` line in the method note.

*Gate:* screenshot at 1440 matches the frame's palette, byline, Shetland treatment, footer and border; nothing interactive remains on the border.

### 4c.2 — Headline: the positive reframe + the bar
[`src/map/views/headline.ts`](src/map/views/headline.ts), [`src/map/map.css`](src/map/map.css) `.map-headline .share`.

Rewrite the headline's figure and states:

- **Curtailing / normal:** `{pct}% of Scotland's tracked wind is currently on the grid.` where `pct = formatPctFloor(instructedMW / declaredMW * 100)`, `instructedMW = declaredMW − curtailedMW`. The `{pct}` is the large, heavy figure (the current `.map-headline__figure`). Past-tense variant when the reading is stale: `…was on the grid when this was last read.`
- **Fully clear (`curtailedMW <= 0`):** `100% of Scotland's tracked wind is currently on the grid.`
- **Pending / failed:** keep the existing "Reading." / "Unavailable." treatments and their sentences.
- **The bar:** label `{formatMW(instructedMW)} of {formatMW(declaredMW)}` (e.g. `10,971 of 13,105 MW`); fill width = the on-grid share. Update the visually-hidden screen-reader sentence to match ("`{onGrid} of the {declared} MW Scotland is making is on the grid.`"). Keep the aria-hidden bar / labelled-sentence pattern.

The bar keeps its solid navy treatment from 4b; it gains the disclosure chevron in 4c.3.

*Gate:* every fixture state (`?state=`) reads correctly and honestly — clear day says 100%, a constrained day floors the share, stale reads past-tense, pending/failed unchanged. Numbers in the sentence, the bar label and the bar fill all agree.

### 4c.3 — Source list + select-to-highlight + the bar disclosure
New view module [`src/map/views/sources.ts`](src/map/views/sources.ts); wiring in [`src/map/main.ts`](src/map/main.ts); [`src/flow/particles.ts`](src/flow/particles.ts) and [`src/map/markers.ts`](src/map/markers.ts) for the highlight.

- **Move the farm list out of `headline.ts`** (the current `farmNodes`, which shows only *curtailed* farms) into the new module. The new list shows **all tracked farms** from `curtailment.now.farms`, **top 8 by `declaredMW`**, two columns. Each row: a coloured dot, the farm name, `≈ {windspeed} km/h` (the 4c.5 follow-on fills this; render the row without it until then), a **mini-bar** filled to `instructedMW / declaredMW`, and `{formatMW(declaredMW)}`. A **"View all"** control reveals the remaining farms (same row shape).
  - *Confirm with Owen:* the row's MW figure is **declared** output (the farm's size this half-hour), with the bar showing its on-grid share. If he wants on-grid MW there instead, swap the figure — the bar still shows the share either way.
- **The bar disclosure:** wrap the bar (summary) + this list (content) in a native `<details>`. Initial `open` state from `matchMedia('(min-width: 1280px)')` at load — open on desktop, collapsed on mobile. Style the chevron as in the frame.
- **Interactive rows:** each row is a `<button>` (or `role="button"`, tabindex, Enter/Space) with hover and **selected** states (filled dot + row tint), whole-row hit target.
- **Highlight on the map:** add `ParticleSystem.setHighlightSource(farmId | null)` — in `render()`, particles whose source resolves to `farmId` draw in a new **`--highlight`** blue; while a selection is active, all other wind particles render at reduced opacity so the selection reads. Mirror on the markers: a `data-highlight` attribute on the selected farm's marker (bright `--highlight`), the rest dimmed, styled in `map.css`. Selecting a row calls both; a document-level click outside the list (and Escape) clears the selection and resets. Single-select.
  - *`--highlight` value:* pick a vivid azure that separates cleanly from `--wind-live` against the dimmed field — propose one, confirm with Owen. Dimming the rest is what makes a blue-on-blue highlight legible; keep that behaviour even if the exact hue changes.

*Gate:* on desktop the list is open and reads as interactive; selecting a farm lights its marker and its flow and dims the rest; clicking away resets; keyboard works; on mobile the list is collapsed behind the bar and expands on tap. Honesty rules from 4c.2 still hold.

### 4c.4 — The consolidated settlement disclosure + rewritten copy
[`src/map/main.ts`](src/map/main.ts), [`src/view/colophon.ts`](src/view/colophon.ts) / the method note, [`src/map/map.css`](src/map/map.css).

- **One disclosure** hangs off the settlement-period row (its chevron). Into it goes, rewritten and concise: (a) how the on-grid number is worked out and why it is conservative (instructed turn-downs only → a floor on curtailment → the true on-grid share may be a little lower), and (b) the constraint/border explanation (what the Scotland–England transmission limit is and why wind is turned down). Fold in the still-true lines from the current method note (`method__basis`, `method__coverage`, the floor/parity paragraphs, the settled-MWh line, the blind-farms count) where they belong; drop what the reframe makes redundant.
- **Retire** the separate `method` `<details>` in the text column and the border tooltip's sentence — this disclosure is the single home for all of it.
- **Write the copy with Owen's voice:** draft it through the **`owen-thomas-work:house-style`** and **`design:ux-copy`** skills, then show Owen for sign-off before finalising. It must stay comprehensible to a general reader and keep every honesty caveat.

*Gate:* Owen signs off the rewritten copy; the disclosure holds one coherent explanation; no explanation is duplicated elsewhere; screen-reader path to the constraint sentence is preserved.

### 4c.5 — Windspeed feed *(follow-on — ship after the main run)*
The one new external dependency, independent of everything above. Until it lands, the source rows built in 4c.3 simply omit the `≈ N km/h` clause. New route [`api/windspeed.ts`](api/windspeed.ts); client wiring in [`src/lib/client.ts`](src/lib/client.ts); consumed by `sources.ts`.

- **Route:** batch-call Open-Meteo once for all farm coordinates — `GET https://api.open-meteo.com/v1/forecast?latitude={a,b,…}&longitude={x,y,…}&current=wind_speed_10m&wind_speed_unit=kmh` (Open-Meteo accepts comma-separated coordinate lists and returns an array). Return `{ [farm]: kmh }`. Coordinates come from [`src/map/data/farms.json`](src/map/data/farms.json) (`latLon`). Use `fetchJson` and `setCacheHeaders` from [`api/_lib/http.ts`](api/_lib/http.ts); always answer 200 with a health flag, like the other routes.
  - Fetching **all 76 in the one cached call** is simpler and cheaper than lazy-loading, and makes "View all" instant — prefer it over shown-plus-lazy.
- **Client:** add `fetchWindspeed()` as an **independent** call (like `fetchNarration`), so a slow or failed weather feed can never block or blank the core feeds. Land it into the source rows when it resolves.
- **Degradation:** a farm with no windspeed (feed down, or a coordinate Open-Meteo can't serve) renders its row **without** the `≈ N km/h` clause — never a zero or a guess.

*Gate:* windspeeds render in km/h in every shown row and on "View all"; the response is CDN-cached; killing the feed degrades the rows gracefully and leaves everything else intact.

---

## 5. Layout notes across breakpoints

The 4b grid, tiers and map sizing are unchanged. New elements inherit them:

- The **source list** sits in the left text column (two sub-columns within it on desktop; it may drop to one sub-column on mobile — match the frame's stacked behaviour). Collapsed behind the bar on mobile (§4c.3).
- The **settlement disclosure** opens within the text column; it must not shift the map cell (the map rebuilds on stage-size change via the existing `ResizeObserver`, so an expanding disclosure under the map when stacked is fine, but avoid it forcing a map rebuild on every toggle — expand within the text band, not between text and map).
- **Selected-source highlight** is purely a paint change (particle colours, marker attributes) — no relayout, no rebuild.

## 6. The border, precisely

Today the border carries a visible line (`.map__border-line`), a wider transparent hit path (`borderHit`), an always-on "The constraint" label, a hover/tap/focus tooltip (`borderView`) and a good deal of pointer logic in `main.ts`. 4c removes all of it except the line. The line becomes `--text-primary` dark blue at full opacity, and `BORDER_LINE` is extended at both ends so it visually meets the coastline (the frame runs it coast to coast). Nothing about the border is focusable, hoverable or clickable. The constraint's meaning is explained in the settlement disclosure (§4c.5), and stays in the method-note text until that stage lands.

## 7. Copy: the one explanation

The consolidated disclosure is the page's only long-form text. It must:

- Lead with the plain reading of the headline: what "{83}% on the grid" means and that Windfall's figure is deliberately conservative.
- Explain the constraint in one or two sentences a general reader gets: the transmission network between Scotland and England has a limit; when Scotland makes more than can travel south, wind is instructed to turn down.
- Keep the existing verification/parity facts (the floor vs. widely-cited figures, the independent-tracker check) if they still read as honest under the new frame — trim hard.
- Be drafted in Owen's voice (`owen-thomas-work:house-style`) with `design:ux-copy` discipline, and signed off by Owen.

## 8. Out of scope (unchanged from the parent specs)

The **flow field tuning** — Owen will provide the tuned wind treatment as a preset JSON from `/flow` (the `h` panel's "Copy current as JSON"); apply it separately, do not tune by eye here. The drawn-island retune (parent §5.3); geometry, islands, the Shetland inset projection logic; farm sources, marker mechanics and the data payload shape; the seven fixture states and the honesty rules (extended, not replaced, by §4c.2); `/` and `/flow` (light tokens stay scoped to `/map`). 4c touches copy, the headline/bar framing, the source list and its interaction, the windspeed feed, the border's removal-of-interactivity, and palette values only.

## 9. Acceptance criteria

1. Headline states the **on-grid share**, floored, no "Up to"; a clear half-hour reads 100%; the bar reads `{onGrid} of {declared} MW` and its fill, sentence and figure all agree.
2. The source list shows the **top 8 tracked farms by declared output**, two columns, each with a dot, name, windspeed, on-grid mini-bar and MW, plus a working **"View all"**.
3. The **bar's chevron** toggles the list (open desktop, collapsed mobile); the **settlement chevron** toggles the single consolidated explanation.
4. **Selecting a source** highlights its marker and its flow in `--highlight` blue and dims the rest; clicking away or Escape resets; the interaction is keyboard-accessible.
5. **Windspeed** (the 4c.5 follow-on) renders in km/h in every row, from a cached Open-Meteo route fetched independently of the core feeds, and degrades gracefully when unavailable.
6. The **border** is a passive dark-blue line meeting the coast at both ends — nothing interactive.
7. **Shetland** sits above the Scotland mix, no outline, no caption, label in 16px Eczar regular navy; the **colophon** has no coloured source squares and correct spacing; the **byline** links to owenthomas.work.
8. The **palette** matches Desktop HD and clears AA (or re-confirmed exceptions).
9. All seven fixture states still hold under the new frame; the consolidated copy is signed off by Owen.
10. DECISIONS.md updated for: the positive reframe + floor rounding, the source list + select-to-highlight, the windspeed feed, the two disclosures, the border's simplification, and the palette re-match.

## 10. Open items to confirm with Owen before/while building

- **Windspeed source** (the 4c.5 follow-on) — Open-Meteo assumed (free, no key, km/h). Confirm, or name a preferred provider.
- **Source-row MW** — declared output (assumed) vs on-grid MW. The mini-bar is the on-grid share regardless.
- **`--highlight` hue** — propose a vivid azure; confirm. Dimming the rest of the field stays regardless of the exact value.
- **Exact fuel/ink hexes** — read from `49:747`; confirm the swatch plate against the frame with Owen at the 4c.1 gate.
