# Windfall Map Page — The flow as electricity, the wind as wind

*Handover document for the executing agents. Written 5 October 2026 from a planning session with Owen. It answers the first backlog item in [Windfall_Project_Plan.md](Windfall_Project_Plan.md) §10, "Make clear the flow is electricity, not wind". It changes the map's flow (L3) and adds a wind layer beneath it. The text column, markers, inset, mix panels and the data behind the headline are untouched. Where this document and [Windfall_Map_Spec.md](Windfall_Map_Spec.md) or its 4b–4d successors disagree about the flow, this one wins.*

*The work is split into four streams, A to D, defined in §6. Each stream runs in its own session. Land each stage separately, stop at each gate and show Owen. Log every decision in DECISIONS.md as it is made.*

---

## 1. Overview

Two readers of the launch post took the flow's particle trails for the wind itself. The trails look like weather because they were tuned to: DECISIONS 049 made the flow move "the way wind does".

The fix has two parts, and they work as a pair:

1. **The electricity is drawn as electricity.** It follows the real transmission network as fixed lines with small arrows moving along them. It no longer drifts across the land as trails.
2. **The wind is drawn as wind, and only over the sea.** Live wind data drives soft, light grey trails across the grey ground, never over the land. This keeps the wind look the page was built around and puts it on the thing it actually depicts.

Together they give one visual rule: **trails are weather, lines are wires.** Grey wind blows over the sea, reaches the farms, and leaves them as blue electricity on the land.

## 2. Decisions already made (build to these — do not relitigate)

1. **Real transmission routes first.** The electricity follows the GB transmission network's real geometry from OpenStreetMap. If that looks too literal, metro (octilinear) or organic (smoothed) adjustment comes afterwards as a change to the same network data (§6, A4). Owen: "the most accurate approach to depicting it".
2. **Graph routing, not a field.** The network is a graph of substations and circuits, and power is routed along it. The particle field is not pulled toward the lines. A graph keeps the geometry exact, gives a natural place for bundles to merge and split (substations), and makes the metro and organic fallbacks cheap.
3. **Lines with arrows, from the references.** Solid lines with small same-colour arrows moving along them, and irregular breaks in the lines (§3).
4. **Wind on the ground only.** The wind layer draws outside the land mask, on the `#E7E7E9` ground. Never over the island.
5. **The particle system becomes the wind layer.** `src/flow/particles.ts` and its trail technique are kept and retargeted to live wind (stream C). The map's electricity no longer uses them once gate A4 passes.
6. **The border rule from DECISIONS 046 carries over.** The share of the on-grid power that crosses into England is the limit's share of the boundary's 6,800 MW maximum, as now. The method sentence about the limit stays true.
7. **Held-back power stays in Scotland.** As now (`heldFade.ts`), it is drawn in `#5B64FF` and never crosses the border.
8. **Seven swatches (DECISIONS 057) still hold.** Electricity is `#0A1299`, held back `#5B64FF`. The wind is `#FFFFFF` at partial opacity over the `#E7E7E9` ground, which reads as a lighter grey without adding an eighth colour.
9. **A legend line ships with it.** Something like "Blue lines: power from Scotland's wind farms on the grid · Grey: the wind now". Final wording in stream D, with Owen.

## 3. The references

Two images in `reference/` carry the electricity's look. `reference/` is git-ignored (third-party images, public repo), so a fresh worktree will not have it: read the images from Owen's main checkout. The earlier flow references (Design Week Highlights, Pin by you, Digital Art) now belong to the wind layer.

**`reference/Typography Pin.jpg`** — the marks.
- Thin, solid, smoothly curved lines running roughly parallel in a bundle.
- Small filled arrowheads in the line's own colour. On one line they are about one to two line-spacings apart. On neighbouring lines they are staggered, so they never form rows across the bundle.
- Breaks at irregular points. Some lines are nearly continuous; others become long dashes for a stretch.

**`reference/Design Maps Are.na.jpg`** (an ocean-currents chart) — the bundle.
- Lines held at a near-constant distance from their neighbours.
- Where flow comes together, lines end as they meet a neighbour; where it spreads apart, new lines start in the gaps. Spacing stays even while the bundle widens and narrows.

On the network this means each route is a bundle of evenly spaced parallel lines. Bundles merge at substations and split after them.

**Risk, stated plainly:** both images are weather and ocean charts, and streamline maps are a classic way to draw wind. The lines alone will not fix the confusion. What fixes it is the combination: arrows on fixed lines, land only, the visible contrast with the grey trails on the sea, and the legend line.

## 4. The electricity

### 4.1 Network data (OpenStreetMap)

Checked on 5 October 2026 with an Overpass query (`way["power"~"^(line|cable)$"]` with a 275/400 kV `voltage`, inside GB):

- About 8,500 ways: 4,933 at 400 kV, 3,401 at 275 kV, plus mixed tags; 7,560 overhead lines and 975 cables.
- About a quarter carry `circuits` and `operator` tags.
- Named routes are present, for example `Beauly-Denny Power Line`.
- **The Western HVDC Link is present** (`voltage=600000`), but a query restricted to the GB land area misses its undersea section. **Query by bounding box, not by country area,** so subsea cables come through.
- **Voltage threshold by country.** In Scotland, 132 kV is transmission (SSEN and SP Energy Networks); in England, transmission starts at 275 kV. Take ≥132 kV north of the border and ≥275 kV south of it. This is accurate and brings the network close to the farms.
- **Exclude** interconnectors to other countries and the dense urban cable networks (London's 275/400 kV cables) that would read as noise at map scale. Log what is excluded and why.
- **Licence:** ODbL. The colophon gains "© OpenStreetMap contributors".

The build script (A1) fetches once and commits a simplified network to `src/flow/data/gb-grid.json`. The grid changes slowly. Re-running the script is a manual refresh, dated in the file, not a live call.

### 4.2 Simplifying the network

The raw ways are far too detailed for a phone-width map. In projected space:

1. Join ways into a graph. Snap endpoints within a small tolerance, and take nodes from `power=substation` where they exist.
2. Merge parallel circuits that share a corridor into one edge with a circuit count (towers often carry two circuits, and separate routes often run side by side).
3. Remove degree-2 nodes, so edges run substation to substation.
4. Simplify each edge's geometry with the existing Douglas-Peucker in projected space.

Keep the circuit count on each edge: the routing model uses it.

### 4.3 Routing model

**What is real and what is modelled.** The geometry is real. How much power is on each circuit is not: no live per-circuit flow is published, and not even the border flow is (DECISIONS 046). The split is a stated model, and the method disclosure says so in one sentence (draft in D, with Owen).

1. **Farms join the network.** Each onshore farm connects to its nearest suitable substation, drawn as a short spur. Offshore and island farms come in along their sourced landings from DECISIONS 024 (export cable to landing, then landing to substation).
2. **Power travels south** along shortest paths through the graph. Where there are parallel routes, at the border above all (the west routes, the east routes, the Western HVDC link), power splits in proportion to circuit count. Log the split rule.
3. **Power drains away on the way.** Demand nodes take a share at each step, weighted by population near them. `src/map/cities.ts` already has population weights, marked "prototype figures, check before this ships". Check those figures before relying on them. Power therefore thins to the south, which also answers the reader who asked why the flow thins in the south-east.
4. **The border limit (046)** decides how much of the on-grid power continues into England. The rest drains to Scottish demand.
5. **Held-back power** is drawn from its farm along the farm's spur and nearby network in `#5B64FF`, and ends before the border, as `heldFade.ts` does now.

The model is rebuilt with the world, on each reading and when the limit changes, as the shared field is now.

### 4.4 Rendering

- **One line per X MW.** Each edge's MW sets how many parallel lines its bundle has, quantised. X is chosen so the busiest edge (the border crossing) carries no more than about a dozen lines at phone width. Expect X somewhere around 250–500 MW. Every generating farm gets at least one line on its spur, so small farms still appear. Log X and the minimum-one rule.
- **Line order through substations.** Each line is one route from farm to demand. Where routes share an edge, they take lanes, and the lanes keep a consistent order through substations so bundles do not cross themselves. This is the metro-map line-ordering problem. A heuristic (order lanes by the direction each route leaves in) is enough to start. **This is the hard part of the build.**
- **Arrows** travel along each line at constant speed in css px/s, scaled for screen size as the flow's speed is now. Each line gets its own phase offset, so the arrows stagger. Arrow size and spacing are knobs.
- **Breaks.** Irregular, seeded per line id, so they stay put across rebuilds. The breaks stay still while the arrows move through them. Whether an arrow is hidden inside a gap is a knob, hidden by default.
- **Drawing cost.** The lines are drawn once to an offscreen canvas, rebuilt only when the model is rebuilt. Each frame redraws the arrows only.
- **Reduced motion.** Lines and arrows are drawn still. Unlike the current flow, this treatment reads without animation.
- **Selection.** Selecting a farm (the current `--highlight` behaviour) lights that farm's routes and dims the rest.
- **Dev panel** (`controls.ts`, behind `?dev`): MW per line, lane spacing, arrow size, spacing and speed, break frequency and length, arrows hidden in gaps, and the geometry mode (literal / metro / organic) once A4 adds them.

## 5. The wind

- **Data:** Open-Meteo's forecast API, current `wind_speed_10m` and `wind_direction_10m`, on a coarse grid (about 12 × 15 points) over the stage's bounding box, in one multi-location request. Free, no key. A new `api/wind.ts` beside `grid.ts`, using `_lib/http.ts` and `setCacheHeaders`, cached for about an hour (the data updates hourly). It returns u/v components and a fetched-at time.
- **Field:** interpolated between the grid points on the client into a direction and speed field.
- **Particles:** the existing system, fed from that field, masked to the ground outside the land (the inverse of the land mask). Far fewer particles than the electricity has lines, long soft trails (low `washAlpha`), `#FFFFFF` at partial opacity. Speed follows wind speed, the opposite of the electricity's constant speed.
- **Layering:** its own canvas beneath the electricity and the island. It can update at half rate on phones.
- **Scenario presets (`?state=`):** live wind does not match a stored scenario. Either store a wind snapshot with each scenario, or hide the layer in presets. Decide in C and log it.
- **Reduced motion:** short static streaks along the field, not moving particles.
- **Shetland inset:** no wind inside it, to start with.
- **Failure:** if `/api/wind` fails, the layer is not drawn. The ground stays plain and nothing else changes.

Prevailing south-westerlies mean the wind will usually blow north-east while the electricity runs south. That contrast helps separate them.

## 6. Streams and gates

### Stream A — the electricity on the real network

- **A1. Network data.** A script in `scripts/` (alongside `export-map-svg.ts`) that runs the Overpass query (§4.1), simplifies the network (§4.2) and writes `src/flow/data/gb-grid.json`. **Gate A1:** a still image of the bare network drawn over the map, at desktop and phone width, before any routing or animation. This picture answers Owen's question of whether it's "too literal".
- **A2. Routing model.** Farms onto the network, the split at the border, demand draining, the 046 limit, held-back routes, MW per edge (§4.3). Checked with numbers: on-grid MW in equals MW drained plus MW still in flow at every node, and the border flux equals the limit's share.
- **A3. Renderer.** Bundles, lane order, arrows, breaks, offscreen cache, dev knobs (§4.4). The particle flow stays reachable behind a dev flag until A4 passes, for comparison. **Gate A3:** live on the map in the curtailing and calm fixtures, desktop and phone.
- **A4. Owen's call.** Keep it literal, or add metro snapping (edges to 0°/45°/90° with rounded corners) or organic smoothing (heavier simplification plus curve fitting). Both are post-processing on `gb-grid.json` edges. A mix may win: literal where routes are few and well known (central belt to the border), looser across England's denser network.

### Stream B — tuning the electricity

Folded into A4 for now. If A4 picks metro or organic, B is that work. If not, B is not needed.

### Stream C — the wind layer

`api/wind.ts`, the field, the particle system retargeted, the sea-only mask, presets, reduced motion, failure (§5). Can run in parallel with A2–A3 once A1 has passed, since it touches different files apart from `main.ts`. **Gate C:** the wind layer on its own, over the current page.

### Stream D — the two together

Tune the two layers against each other: contrast, density, how the grey wind meets each offshore farm marker, phone performance with both running, reduced motion. Legend line and method sentence with Owen. Colophon credit for OpenStreetMap and Open-Meteo. DECISIONS entries: superseding 049 for the map's flow, and recording the routing model. Update the case-study capture. **Gate D:** the finished page, shown to Owen. Ideally also to one of the two readers who raised it.

## 7. Open questions

- The per-line MW (X), once A3 shows it at phone width.
- Whether spurs from farms are drawn at the same weight as the network, or lighter.
- Whether offshore export cables, drawn as blue lines over the grey sea, sit comfortably next to the wind layer or need the wind to clear around them.
- Wind snapshot or hidden wind in scenario presets (§5).
- Whether the held-back lines should later carry more gap than line ("power that never arrives"). Not for the first build: it gives the breaks a meaning they don't otherwise have.

## 8. Risks

- **Too literal.** England's network is dense, and the page could read as a wiring diagram. Gate A1 is there to catch this before anything else is built.
- **Lane ordering** takes longer than expected. Fallback: allow crossings at substations and hide them under a small node mark.
- **The model is mistaken for measurement.** Mitigated by the method sentence and by not labelling individual circuits with MW.
- **OSM gaps.** Missing or mis-tagged sections break routes. The A1 script prints disconnected components so they are fixed by hand (snapping, or a hand-added edge with a note) before A2.
- **Two moving layers compete.** The wind is kept soft and sparse, and stream D tunes the balance.
