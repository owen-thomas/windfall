import { buildDensityField, type DensityField } from './densityField';
import {
  DEFAULT_FIELD_PARAMS,
  sampleField,
  type FieldParams,
  type ParticleTraits,
} from './field';
import type { RasterMask } from './mask';
import type { World } from './world';
import { resolveStrokeColor, resolveStrokeWidth, type Palette } from './palette';

export interface MaskClampResult {
  /** The last sample along the segment confirmed inside the mask. */
  x: number;
  y: number;
  /** True if any sample along the segment fell outside the mask. */
  left: boolean;
}

/**
 * Ring search outward from (x, y) for the nearest inside-the-mask pixel,
 * within a small radius. Only ever called when a particle's *starting*
 * position for the frame is already outside — a residual escape from a
 * previous frame's sub-pixel gap (see clampToMask's docs) — so this is
 * rare, and the radius is small enough that the cost doesn't matter when
 * it does run.
 */
function findNearestInside(
  x: number,
  y: number,
  mask: RasterMask,
  maxRadius = 8,
): { x: number; y: number } | null {
  for (let r = 1; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // ring only
        const nx = x + dx;
        const ny = y + dy;
        if (mask.isInside(nx, ny)) return { x: nx, y: ny };
      }
    }
  }
  return null;
}

/**
 * Walk (x0,y0)-(x1,y1) at ~1 device-px resolution and return the last
 * inside-the-mask sample, plus whether the segment left the mask at all.
 * This is the shared primitive behind both the mechanical containment
 * check (`segmentLeavesMask`, unchanged behaviour) and the step 2a rescue
 * in `ParticleSystem.step` below, which needs the actual clamp point, not
 * just a yes/no.
 *
 * 2 samples/px: a diagonal coastline is a pixel staircase, and a segment
 * crossing it at a shallow angle can graze a step between once-per-px
 * samples even when both endpoints test inside. That means, rarely, a
 * particle's committed position can itself already be outside at the
 * start of the *next* frame — this function's own walk would find no
 * inside sample at all in that case (t=0 already fails) and, left
 * unhandled, the particle would freeze there, unable to make forward
 * progress, racking up strikes without moving until it hits the strike
 * limit. `findNearestInside` recovers from that starting condition
 * directly, rather than only ever depending on it not occurring.
 */
export function clampToMask(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  mask: RasterMask,
): MaskClampResult {
  if (!mask.isInside(x0, y0)) {
    const recovered = findNearestInside(x0, y0, mask);
    if (recovered) return { x: recovered.x, y: recovered.y, left: true };
    // No inside pixel within range — should be unreachable in practice
    // (it would mean the particle is deep outside GB entirely). Hold
    // position rather than propagate a point neither call site can use.
    return { x: x0, y: y0, left: true };
  }

  const length = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(2, Math.ceil(length * 2));
  let lastX = x0;
  let lastY = y0;
  let left = false;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const px = x0 + (x1 - x0) * t;
    const py = y0 + (y1 - y0) * t;
    if (!mask.isInside(px, py)) {
      left = true;
      break;
    }
    lastX = px;
    lastY = py;
  }
  return { x: lastX, y: lastY, left };
}

/**
 * True if any point along the segment falls outside the mask. Exported so
 * the containment verification check can hold the exact same rendered-line
 * standard the runtime enforces, rather than a looser approximation of it.
 */
export function segmentLeavesMask(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  mask: RasterMask,
): boolean {
  return clampToMask(x0, y0, x1, y1, mask).left;
}

/**
 * Project a heading onto the local coastline tangent, discarding its
 * component along the distance-field gradient (the normal axis). Used for
 * the step 2a rescue: "glide, not scrape" — a shallow graze becomes a
 * smooth deflection along the boundary rather than a bounce off it. Same
 * containment guarantee as reflecting would give (the outward component is
 * gone either way), but no visible kink.
 */
function projectOntoTangent(hx: number, hy: number, gx: number, gy: number): [number, number] {
  if (gx === 0 && gy === 0) return [hx, hy];
  const dot = hx * gx + hy * gy;
  const tx = hx - dot * gx;
  const ty = hy - dot * gy;
  const len = Math.hypot(tx, ty);
  if (len < 1e-6) {
    // Heading was ~exactly along the normal (a dead-on approach) — the
    // projection is degenerate. Slide along the gradient's own
    // perpendicular so a straight-in approach still glides rather than
    // stalling; which of the two tangents is arbitrary here since neither
    // was already favoured.
    return [-gy, gx];
  }
  return [tx / len, ty / len];
}

// --- Step 2a: rescue instead of kill ---------------------------------------
// A particle is killed for grazing the coast only after this many
// consecutive strikes (see `strikes` below), not on the first one.
// Containment doesn't depend on this number at all — every clamp is
// already forced inside before it's ever drawn — so it's purely a "give up,
// this particle seems stuck" threshold, not a containment mechanism. Harness
// runs at 16 and 40 both still showed the large majority of all deaths as
// strike-outs: a real coastal glide along a jagged, raster-staircased
// stretch, or through Scotland's narrow, fjord-like west coast, can
// legitimately re-graze on most frames for well over a second while making
// genuine (if slow) progress. Raised until consecutive strikes essentially
// never trip this on their own — the TRAPPED_* checkpoint below now does
// the actual "genuinely stuck" job, by measuring real net displacement
// rather than an unbroken run of single-frame grazes, so this is a pure
// last-resort backstop for a pathological run of consecutive strikes even
// the trapped check hasn't caught yet.
const STRIKE_LIMIT = 200;
// After a clamp, nudge this many device px further inward (along the SDF
// gradient) than the literal last-inside sample, when that nudge itself
// tests inside. Without it, the clamped point sits exactly on the
// waterline, and the raster coastline's stair-step artefacts can trigger
// another graze on the very next frame from pure tangential motion alone.
// Raised from a first guess of 1.5px, which was still inside the raster's
// own staircase amplitude (mask.ts's morphological closing handles gaps up
// to ~1-1.5px) and so didn't reliably clear it.
const CLAMP_NUDGE_PX = 2;

// --- Step 2e (stall): a genuine southern terminator -------------------------
// driftScale (from field.ts) below this, sustained for STALL_DURATION
// seconds, counts as "slowed to a stop in the far south" — the spec's
// third death condition. Gated on the field's position-based decay, not on
// a particle's own effective speed, so a particle that merely drew a slow
// personal speed jitter early in Scotland isn't mistaken for one that has
// genuinely run out of road.
const STALL_DRIFT_SCALE = 0.2;
const STALL_DURATION = 1.5; // seconds

// --- Trapped detector --------------------------------------------------------
// A general, geometry-agnostic backstop for the failure mode strike-
// counting alone can miss: a particle oscillating back and forth in a
// tight coastal pocket (a sea loch, a narrow strait like Kyle of Lochalsh)
// can go clean-graze-clean-graze indefinitely without ever stringing
// together enough *consecutive* strikes to hit STRIKE_LIMIT, while making
// almost no net progress. Rather than hand-tune steering weights against
// every such pocket individually, check actual net displacement over a
// rolling window directly — "genuinely stopped getting anywhere" is a
// simpler, more robust signal than any specific force balance.
const TRAPPED_CHECK_INTERVAL = 1.2; // seconds between displacement checks
// Device px of net progress required per interval, at the default speed of
// 90 — step() scales it by style.speed / 90, so a deliberately slow flow
// isn't read as a stuck one.
const TRAPPED_MIN_DISPLACEMENT = 25;
// How many *consecutive* failed windows (measured from the same anchor —
// the anchor only advances on a passing check, see the step() logic below)
// before a particle is actually declared trapped. Originally 1 (any single
// slow window was instant death), which measured "was this particular
// 1.2s window slow" rather than "has this particle stopped getting
// anywhere" — a harness instrumentation pass (2j retune follow-up) found
// individual windows fail ~14% of the time even for healthy particles
// (turns, wave troughs, coast-conform maneuvers all legitimately dip net
// progress below TRAPPED_MIN_DISPLACEMENT for one window), and with a
// ~4.9s median lifespan giving each particle only ~4 windows to get
// unlucky in, that one-strike gate alone explained the bulk of the
// system's death volume (76.5% of deaths attributed to 'trapped') without
// most of those particles ever being genuinely stuck. Requiring several
// in a row — mirroring STRIKE_LIMIT's own "consecutive" framing just
// above — makes the anchor-retention already in the check logic actually
// do its job: a real oscillation keeps failing from the same anchor and
// still gets caught quickly, while an ordinary particle that has one slow
// window gets a fair chance to prove it next window.
//
// A harness sweep (3000 particles, 60s, post density-gradient-bug fix)
// picked 3 over 2: streak=2 still leaves 'trapped' as the second-largest
// death cause (26.8% of deaths); streak=3 pushes it down to a genuine
// backstop share (5.6%), for only a small further lifespan/coverage move
// (p50 7.48s -> 8.90s, coverage 91.3% -> 90.5%, both within noise).
//
// Important, and not fully resolved by this change: fixing the early-death
// bug means particles now survive roughly 2x as long (p50 4.87s -> 8.90s),
// and totalStrikeEvents / particle-second — the "is steering failing"
// guard-rail — rose alongside it (6.36 -> 8.55 measured against the
// already-fixed densityField.ts coastal-gradient bug, itself down from
// 9.93 pre-fix). That is the metric getting more honest, not worse: the
// trapped bug was previously killing particles before they lived long
// enough to rack up many strikes, artificially suppressing the reading.
// The true rate of coast interaction was always this high; it just wasn't
// being measured. Whether 8-8.5 strikes/particle-second is acceptable, or
// steerWeight/pushWeight/conformWeight need their own look now that the
// guard-rail can actually see them, is unresolved — flagged for whoever
// does the next coast-steering pass rather than guessed at here.
const TRAPPED_FAIL_STREAK = 3;

// --- Step 2g: density-aware spacing --------------------------------------
// How long a particle has to sit somewhere over densityRecycleThreshold x
// the grid's mean before it's force-respawned (see field.ts's docs and
// the `overDensityTime` tracking below). Longer than STALL_DURATION —
// sitting in a crowded cell isn't dangerous the way stalling in the far
// south is, it's just wasteful, so it gets a more patient grace period
// before the system intervenes.
const DENSITY_RECYCLE_DURATION = 2.0; // seconds

// --- Step 2c: per-particle persistence --------------------------------------
// Ranges for the fixed-at-spawn traits passed into sampleField. Deliberately
// small relative to the quantities they perturb (see field.ts's docs on
// each trait) — texture, not a second field.
const CHIRALITY_MAGNITUDE = 0.5; // ± half this, additive on the coast tie-break's dot difference
const LATERAL_BIAS_MAGNITUDE = 20; // device px/sec, ± half this

/**
 * Step 4 (control panel): live, per-instance multipliers on the respawn-time
 * random spreads above, plus the source-spawn jitter radius. Public and
 * mutable — the panel writes straight into `ParticleSystem.style`, same
 * "no setters" convention as `fieldParams` in main.ts. Only affects
 * particles at their *next* respawn (traits are fixed-at-spawn by design —
 * see field.ts's ParticleTraits docs), same as particle count only taking
 * effect via a rebuild.
 */
export interface ParticleStyle {
  /**
   * Scales the spread (not the mean) of every respawn-time random draw:
   * initial-heading spread, speed jitter, chirality, lateral bias, and the
   * hue/weight bucket draw's probability of landing nonzero. 1 = the
   * original, un-scaled spreads; 0 = every new particle spawns identical;
   * >1 exaggerates the texture. This is the spec's "jitter amount"
   * (Flow_Experiment_Spec.md, "Control panel").
   */
  jitterAmount: number;
  /**
   * Radius (device px) of the small random offset applied around a
   * source's resolved position at spawn, so particles from one source
   * don't all trace the exact same line — see respawn()'s own comment.
   * This is the closest surviving equivalent of the spec's "source
   * outflow radius": the spec's small-radius outflow *mechanism* was
   * superseded by 2f's whole-domain divergent field (see
   * `Flow experiment fan-out.txt`'s 2f docs and field.ts's `pathWeight`,
   * which is the surviving "source outflow strength" knob) — this radius
   * is the one remaining literal "radius near a source" parameter.
   */
  spawnJitterRadius: number;
  /** Mean advection speed, device px/sec, before driftScale and speed jitter. Also sizes the age budget, so a slower particle is given the time to travel as far. */
  speed: number;
  /**
   * How quickly a heading eases toward the field's direction — a blend
   * fraction per frame at 60fps (converted to dt-aware in step()). Lower is
   * more momentum: wider arcs, less twitching after every local wobble in
   * the field.
   */
  turnRate: number;
  /**
   * How a newborn particle picks its destination from world.targets (only
   * used under `baseFieldMode: 'targets'`): odds are
   * weight^targetWeightExponent / (route distance)^targetDistanceExponent.
   * A weight exponent above 1 lets the biggest targets win more than their
   * share; a distance exponent of 0 ignores how far away a target is.
   */
  targetWeightExponent: number;
  targetDistanceExponent: number;
  /**
   * Under `baseFieldMode: 'blanket'`, the share of particles born at their
   * farm, 0..1. The rest are born at a random point between their farm and
   * their destination, as if already travelling — still
   * drawn from farms in proportion to output, so emission stays honest, but
   * the whole route fills rather than only its Scottish end.
   */
  farmBirthShare: number;
  /**
   * How far toward the destination a mid-journey birth lands, 0+. Every
   * line starts at a farm, so births spread evenly along each line still
   * pile up near the farms, where the lines overlap; 0 is that even spread,
   * higher leans births toward the far end to even out the cover.
   */
  midJourneyBias: number;
}

export const DEFAULT_PARTICLE_STYLE: ParticleStyle = {
  jitterAmount: 1,
  spawnJitterRadius: 4,
  speed: 90,
  turnRate: 0.25,
  targetWeightExponent: 1,
  targetDistanceExponent: 0.5,
  farmBirthShare: 1,
  midJourneyBias: 0,
};

// A particle heading for a target dies on arrival within this many device px
// of it (by route distance) — the flow's ending under 'targets', instead of
// running out of age or off the coast.
const TARGET_ARRIVE_PX = 14;

// How far to either side of the farm-to-destination line a mid-journey birth
// can land, device px (see midJourneyBirth).
const MID_JOURNEY_SCATTER_PX = 40;

/**
 * How one source is picked out from the rest (Windfall_Map_Spec_4c.md §4c.3,
 * DECISIONS 029): its particles draw in `color`, a little heavier, and every
 * other source's draw at `dimAlpha` of their usual opacity, so the selection
 * reads against the rest of the field. `/map` passes its `--highlight` token as
 * the colour; `/flow` never selects a source, so nothing here touches it.
 */
export interface HighlightStyle {
  color: string;
  dimAlpha: number;
  widthScale: number;
  /** Time constant, seconds, of the dimming easing in and out; 0 switches it at once. */
  fadeSeconds: number;
}

export const DEFAULT_HIGHLIGHT_STYLE: HighlightStyle = {
  color: '#0a7cff',
  dimAlpha: 0.22,
  widthScale: 1.35,
  fadeSeconds: 0,
};

/**
 * Draw a hue/weight jitter bucket (-1, 0, or 1) with `jitterAmount` scaling
 * the probability of landing nonzero. At j=1: P(nonzero) = 2/3, split
 * evenly between -1 and +1 — algebraically identical to the original
 * `Math.floor(Math.random() * 3) - 1` (P(0)=1/3, P(-1)=P(1)=1/3 each), so
 * the default distribution is unchanged. j=0 always lands 0 (no texture);
 * j>=1.5 saturates at "always nonzero", still an even -1/+1 split.
 */
function jitteredBucket(jitterAmount: number): number {
  const pNonzero = Math.min(1, (2 / 3) * jitterAmount);
  if (Math.random() >= pNonzero) return 0;
  return Math.random() < 0.5 ? -1 : 1;
}

export type DeathCause = 'age' | 'strike' | 'stall' | 'trapped' | 'density' | 'exit' | 'arrive';

export interface ParticleSystemOptions {
  /**
   * 'dynamic' (default): age budget sized from this world's actual
   * north-south extent, so a real tail of particles can physically cross
   * it. 'legacy': step 1's fixed 4-9s ceiling — kept only so the step 2
   * instrumentation harness (scripts/flow-harness.ts) can produce true
   * before/after numbers for the age-budget fix in isolation from the
   * other 2a-2e changes (step2 plan feedback: "make the budget a
   * separately toggled harness knob").
   */
  ageBudgetMode?: 'dynamic' | 'legacy';
  /**
   * Fired right before a particle respawns, with its cause and the age it
   * died at. Purely an observability hook for the harness — never used by
   * the runtime page — so per-life data (lifespan distribution,
   * throughput-by-latitude) can be gathered without the particle pool
   * itself accumulating unbounded history.
   */
  onDeath?: (index: number, cause: DeathCause, ageAtDeath: number) => void;
  /**
   * Initial `style` (step 4's jitter-amount/spawn-radius knobs). Threaded
   * through the constructor — rather than left at `DEFAULT_PARTICLE_STYLE`
   * and mutated after the fact — so a particle-count change (which
   * rebuilds the whole `ParticleSystem`, see main.ts's `setParticleCount`)
   * doesn't silently reset the panel's jitter/spawn-radius sliders back to
   * default.
   */
  style?: ParticleStyle;
  /**
   * The field params the page will step with. respawn() needs the base
   * field mode to know how to pick a destination, and the constructor
   * spawns every particle before the first step() call hands them over.
   * step() keeps it current after that.
   */
  fieldParams?: FieldParams;
  /**
   * How a respawning particle's source is chosen. 'random' (default, /flow):
   * drawn by rate. 'quota' (/map): every source with any rate gets one
   * particle, the rest are shared by rate, and each respawn goes to the
   * source furthest below its share — so sources with similar rates always
   * get similar counts, and none that is emitting at all is ever at zero.
   * See pickSourceIndex.
   */
  allocation?: 'random' | 'quota';
}

/**
 * Fixed-size particle pool: flat typed arrays, no per-frame allocation.
 * "Alive" isn't tracked separately — a particle that ages out, stalls, or
 * racks up too many coast strikes is immediately respawned at a
 * (weighted) random source, matching the spec's "dies ... then respawns at
 * a source" behaviour without variable-length bookkeeping.
 */
export class ParticleSystem {
  readonly count: number;
  /**
   * How many of the pool (indices 0..activeCount-1) are stepped and drawn —
   * see setActiveFraction. The pool itself never resizes, so a change is
   * cheap and nothing reallocates.
   */
  activeCount: number;
  x: Float32Array;
  y: Float32Array;
  px: Float32Array; // previous position, for segment drawing
  py: Float32Array;
  hx: Float32Array; // heading (unit-ish), carried across frames for steering continuity
  hy: Float32Array;
  age: Float32Array;
  maxAge: Float32Array;
  speed: Float32Array; // per-particle multiplier on style.speed (the jitter), so a speed change applies live
  sourceIndex: Int16Array;

  /** coastMode 'exit': set on the frame a particle reaches the coast, so that frame's segment (up to the coast) is still drawn before it respawns at the start of the next step. */
  exiting: Uint8Array;
  /** Consecutive coast-graze count since the last clean (non-clamped) frame. */
  strikes: Uint8Array;
  /** Seconds this particle has spent under STALL_DRIFT_SCALE, consecutively. */
  stallTime: Float32Array;
  /** Position at the start of the current trapped-check window (see TRAPPED_*). */
  checkpointX: Float32Array;
  checkpointY: Float32Array;
  /** Seconds since the trapped-check window last reset. */
  checkpointAge: Float32Array;
  /** Consecutive failed trapped-check windows since the last passing one (see TRAPPED_FAIL_STREAK). */
  trappedFailStreak: Uint8Array;
  /** Consecutive seconds this particle has sat over densityRecycleThreshold x the grid's mean — see DENSITY_RECYCLE_DURATION. */
  overDensityTime: Float32Array;

  // Step 2c persistent per-particle traits — see field.ts's ParticleTraits docs.
  chirality: Float32Array;
  lateralBias: Float32Array;
  noisePhase: Float32Array;
  /** Index into world.targets this particle heads for, or -1 — see ParticleTraits.targetIndex. */
  targetIndex: Int16Array;
  /** Own destination point, device px — see ParticleTraits.destX. */
  destX: Float32Array;
  destY: Float32Array;

  // Step 3 (art pass) persistent per-particle traits: fixed-at-spawn
  // texture, not resampled per frame — see palette.ts's docs on why these
  // are quantized to a few buckets (-1, 0, 1) rather than continuous.
  /** Hue-jitter bucket, -1/0/1 — see palette.ts's HUE_JITTER_STEP_DEG. */
  hueBucket: Int8Array;
  /** Stroke-width-jitter bucket, -1/0/1 — see palette.ts's WEIGHT_JITTER_STEP. */
  weightBucket: Int8Array;

  /**
   * Reusable per-render-bucket index buffers, keyed by a small integer
   * combining (sourceIndex, hueBucket, weightBucket) — see render()'s
   * docs. Rebuilt (lengths reset, not reallocated) every frame rather
   * than allocated fresh, keeping rendering allocation-free like the rest
   * of this class.
   */
  private renderBuckets: number[][] = [];

  /** The id of the one source drawn highlighted, or null. Its index moves with the world, so it is re-resolved on setWorld. */
  private highlightId: string | null = null;
  private highlightIndex = -1;
  private highlightStyle: HighlightStyle = DEFAULT_HIGHLIGHT_STYLE;
  /** How far the other sources are dimmed right now, 0..1 — eased toward 1 while one is picked out. */
  private dimLevel = 0;

  /** Total elapsed sim time, for the curl-noise field's time axis. */
  private time = 0;

  /**
   * Running total of coast-graze events (frames where a particle's segment
   * left the mask and got clamped+deflected rather than killed) across
   * this object's whole lifetime. Public and monotonic — the step2 plan
   * feedback's replacement for the old "escape rate" health metric, which
   * goes trivially to zero once grazes are rescued instead of killed and
   * so stops measuring anything. A rising strike rate (this, divided by
   * elapsed particle-seconds) is the new early warning that steering is
   * failing and the rescue is doing steering's job.
   */
  totalStrikeEvents = 0;

  /** 2g's occupancy grid — dynamic simulation state, rebuilt whenever the world (and so the mask's dimensions) changes. */
  densityField: DensityField;

  /** Step 4: live respawn-time style knobs — see `ParticleStyle`'s own docs. */
  style: ParticleStyle;

  /** The params of the latest step() (or the constructor's options) — respawn() reads the base field mode from it. */
  private fieldParams: FieldParams;

  private cumulativeRates: number[] = [];
  /** 'quota' allocation: active particles per source, kept current by respawn() and recountSources(). */
  private sourceCounts = new Int32Array(0);
  /** Whether particle i is currently counted in sourceCounts. */
  private counted: Uint8Array;
  /** Scratch buffer for pickTargetIndex, reused so respawn stays allocation-free. */
  private targetOdds: number[] = [];
  private totalRate = 0;

  constructor(
    private world: World,
    count: number,
    private options: ParticleSystemOptions = {},
  ) {
    this.count = count;
    this.activeCount = count;
    this.activeTarget = count;
    this.x = new Float32Array(count);
    this.y = new Float32Array(count);
    this.px = new Float32Array(count);
    this.py = new Float32Array(count);
    this.hx = new Float32Array(count);
    this.hy = new Float32Array(count);
    this.age = new Float32Array(count);
    this.maxAge = new Float32Array(count);
    this.speed = new Float32Array(count);
    this.sourceIndex = new Int16Array(count);
    this.strikes = new Uint8Array(count);
    this.exiting = new Uint8Array(count);
    this.stallTime = new Float32Array(count);
    this.checkpointX = new Float32Array(count);
    this.checkpointY = new Float32Array(count);
    this.checkpointAge = new Float32Array(count);
    this.trappedFailStreak = new Uint8Array(count);
    this.overDensityTime = new Float32Array(count);
    this.chirality = new Float32Array(count);
    this.lateralBias = new Float32Array(count);
    this.noisePhase = new Float32Array(count);
    this.targetIndex = new Int16Array(count).fill(-1);
    this.counted = new Uint8Array(count);
    this.destX = new Float32Array(count);
    this.destY = new Float32Array(count);
    this.hueBucket = new Int8Array(count);
    this.weightBucket = new Int8Array(count);
    this.densityField = buildDensityField(world.mask);
    this.style = this.options.style ?? { ...DEFAULT_PARTICLE_STYLE };
    this.fieldParams = this.options.fieldParams ?? DEFAULT_FIELD_PARAMS;

    this.buildRateTable();
    this.sourceCounts = new Int32Array(world.sources.length);
    for (let i = 0; i < count; i++) {
      this.respawn(i);
      // Stagger initial ages so the field doesn't pulse as one wave of
      // particles ages out in lockstep.
      this.age[i] = Math.random() * this.maxAge[i];
    }
    this.recountSources();
  }

  setWorld(world: World) {
    this.world = world;
    this.resolveHighlight();
    this.buildRateTable();
    // A resize changes the mask's dimensions, so the occupancy grid has to
    // be rebuilt at the new size — rebuilding (rather than resampling)
    // just means a brief cold start for the density signal, which decays
    // back to steady-state within a couple of DENSITY_RECYCLE_DURATIONs.
    this.densityField = buildDensityField(world.mask);
    this.recountSources();
  }

  /** Rebuild sourceCounts from scratch: every active particle counted against its source. */
  private recountSources() {
    const n = this.world.sources.length;
    if (this.sourceCounts.length !== n) this.sourceCounts = new Int32Array(n);
    else this.sourceCounts.fill(0);
    this.counted.fill(0);
    for (let i = 0; i < this.activeCount; i++) {
      const src = this.sourceIndex[i];
      if (src >= 0 && src < n) {
        this.sourceCounts[src]++;
        this.counted[i] = 1;
      }
    }
  }

  /**
   * Pick one source out of the field (or, with null, put the field back).
   * Otherwise a paint change: nothing is rebuilt and the flow does not
   * restart. The one exception is under 'blanket', where the picked source's
   * own particles are re-born at it (see below). The old, full-strength
   * trails fade out over the same few frames every trail does.
   */
  setHighlightSource(sourceId: string | null, style?: Partial<HighlightStyle>) {
    this.highlightId = sourceId;
    if (style) this.highlightStyle = { ...DEFAULT_HIGHLIGHT_STYLE, ...style };
    this.resolveHighlight();
    // A picked farm's particles are born at the farm (see respawn), so its
    // flow reads from the farm outward. The ones already out mid-journey are
    // re-born there now rather than lingering, scattered, until they age out.
    if (this.highlightIndex >= 0 && this.fieldParams.baseFieldMode === 'blanket') {
      for (let i = 0; i < this.activeCount; i++) {
        if (this.sourceIndex[i] === this.highlightIndex) this.respawn(i, true);
      }
    }
  }

  private resolveHighlight() {
    this.highlightIndex =
      this.highlightId === null
        ? -1
        : this.world.sources.findIndex((resolved) => resolved.source.id === this.highlightId);
  }

  private buildRateTable() {
    this.cumulativeRates = [];
    let sum = 0;
    for (const resolved of this.world.sources) {
      sum += resolved.source.rate;
      this.cumulativeRates.push(sum);
    }
    this.totalRate = sum;
  }

  /**
   * Step 4: call after mutating a `Source.rate` in place (the per-source
   * emission sliders do this directly against `sources.ts`'s `SOURCES`
   * array — `world.sources[i].source` is the same object, not a copy) so
   * the next spawn picks it up. Cheap (O(sources), i.e. 7) — no world or
   * particle-pool rebuild needed, unlike a particle-count change.
   */
  refreshRates() {
    this.buildRateTable();
    this.recountSources();
    // A source now at rate 0 emits nothing, and its particles already out go
    // too — re-born from the sources still emitting — so a source switched
    // off stops showing flow at once, not only as its particles age out.
    if (this.totalRate > 0) {
      for (let i = 0; i < this.activeCount; i++) {
        if (this.world.sources[this.sourceIndex[i]]?.source.rate === 0) this.respawn(i);
      }
    }
  }

  /**
   * Show only this fraction of the pool, 0..1 — /map ties it to how much of
   * the tracked farms' capacity is on the grid. Particles that go inactive
   * simply stop; their trails fade as any trail does. Particles that become
   * active are respawned first, so none resumes from wherever it stopped.
   */
  setActiveFraction(fraction: number, options: { rampSeconds?: number; fromSources?: boolean } = {}) {
    const next = Math.round(this.count * Math.min(1, Math.max(0, fraction)));
    const ramp = options.rampSeconds ?? 0;
    // `fromSources`: until the ramp is done, every particle is born at its
    // source, fresh — the flow is seen leaving the farms and spreading, not
    // appearing everywhere at once (/map's arrival).
    this.fromSourcesUntil = options.fromSources ? this.time + Math.max(ramp, 0) : -Infinity;
    if (ramp <= 0) {
      this.activeTarget = next;
      this.applyActiveCount(next);
      return;
    }
    // Eased over `ramp` seconds by step(), not jumped: a change of density is
    // texture following the reading, so it can move at the flow's own pace.
    this.activeTarget = next;
    this.rampPerSecond = Math.abs(next - this.activeCount) / ramp;
  }

  /** Where setActiveFraction has asked the active count to get to. */
  private activeTarget = 0;
  private rampPerSecond = 0;
  /** Fractional particles carried between frames while ramping. */
  private rampCarry = 0;
  /** Sim time until which every birth is at its source (see setActiveFraction). */
  private fromSourcesUntil = -Infinity;

  /** Move the active count to `next` now: newly active particles are respawned, one at a time so each respawn's quota sees the pool as it stands. */
  private applyActiveCount(next: number) {
    if (next < this.activeCount) {
      this.activeCount = next;
      this.recountSources();
      return;
    }
    const fresh = this.time < this.fromSourcesUntil;
    for (let i = this.activeCount; i < next; i++) {
      this.activeCount = i + 1;
      this.respawn(i);
      // Staggered like the constructor's, so a jump in output doesn't start a
      // wave of particles that then all age out together — except when born
      // at their sources on arrival, where the ramp itself staggers them.
      this.age[i] = fresh ? 0 : Math.random() * this.maxAge[i] * 0.5;
    }
  }

  /**
   * Respawn every particle with the given params — for a change of base
   * field mode, where a particle's route index means something different
   * under the new mode. Ages are staggered as at construction.
   */
  respawnAll(fieldParams: FieldParams) {
    this.fieldParams = fieldParams;
    this.recountSources();
    for (let i = 0; i < this.count; i++) {
      this.respawn(i);
      this.age[i] = Math.random() * this.maxAge[i] * 0.5;
    }
  }

  private pickSourceIndex(): number {
    if (this.options.allocation === 'quota') return this.pickSourceByQuota();
    const r = Math.random() * this.totalRate;
    // Strictly less-than, so a source at rate 0 is never drawn — not even
    // on the rare draw of exactly 0 that `<=` would hand to a leading one.
    for (let i = 0; i < this.cumulativeRates.length; i++) {
      if (r < this.cumulativeRates[i]) return i;
    }
    return this.cumulativeRates.length - 1;
  }

  /**
   * The age-budget ceiling a newly spawned particle draws from. Dynamic
   * mode sizes it off this world's actual north-south extent, so a real
   * (if thin) tail of particles is physically capable of crossing GB —
   * step 1's fixed 4-9s ceiling meant *no* particle ever could, independent
   * of anything else about the field (step2 plan, point 1). Legacy mode
   * reproduces that fixed ceiling for harness A/B comparisons.
   */
  private ageBudgetRange(): { min: number; extra: number } {
    if (this.options.ageBudgetMode === 'legacy') {
      return { min: 4, extra: 5 }; // step 1's original range
    }
    const { top, bottom } = this.world.projection.bounds;
    const span = Math.max(1, bottom - top);
    const avgSpeed = this.style.speed; // midpoint of the speed jitter range drawn below
    // Coast steering + curl noise lengthen the actual path well beyond a
    // straight line north-south; 1.35x is a conservative pad, not measured.
    const curveFactor = 1.35;
    const crossingTime = (span * curveFactor) / avgSpeed;
    return { min: crossingTime * 0.5, extra: crossingTime * 0.9 };
  }

  /**
   * 'quota' allocation: every source with any rate is owed one particle, the
   * rest of the active pool is owed by rate, and the source furthest below
   * what it is owed gets this one. Deterministic up to ties (broken at
   * random), so two sources at the same rate hold the same count rather than
   * one of them happening to draw none. If the pool is smaller than the
   * number of emitting sources, the one-each floor can't all be met, and the
   * furthest-below rule shares what there is by rate.
   */
  private pickSourceByQuota(): number {
    const sources = this.world.sources;
    let emitting = 0;
    for (const resolved of sources) if (resolved.source.rate > 0) emitting++;
    if (emitting === 0 || this.totalRate <= 0) return 0;
    const shared = Math.max(0, this.activeCount - emitting);
    const floor = this.activeCount >= emitting ? 1 : 0;
    let best = 0;
    let bestDeficit = -Infinity;
    for (let j = 0; j < sources.length; j++) {
      const rate = sources[j].source.rate;
      if (rate <= 0) continue;
      const owed = floor + (shared * rate) / this.totalRate;
      const deficit = owed - this.sourceCounts[j] + Math.random() * 1e-6;
      if (deficit > bestDeficit) {
        bestDeficit = deficit;
        best = j;
      }
    }
    return best;
  }

  /** `keepSource`: re-birth this particle from the source it already belongs to, rather than drawing a new one. */
  private respawn(i: number, keepSource = false) {
    // Out of the count first, so the quota sees this particle as free.
    if (this.counted[i]) {
      this.sourceCounts[this.sourceIndex[i]]--;
      this.counted[i] = 0;
    }
    const srcIdx = keepSource ? this.sourceIndex[i] : this.pickSourceIndex();
    // 'quota': a source's only particle is born at the source, so every
    // emitting source always shows a thread leaving it.
    const onlyThread = this.options.allocation === 'quota' && (this.sourceCounts[srcIdx] ?? 0) === 0;
    if (i < this.activeCount && srcIdx < this.sourceCounts.length) {
      this.sourceCounts[srcIdx]++;
      this.counted[i] = 1;
    }
    const resolved = this.world.sources[srcIdx];
    // Small radius jitter so particles from one source don't all trace
    // the exact same line — source outflow proper is step 3. Radius is
    // step 4's `style.spawnJitterRadius` (the spec's "source outflow
    // radius" — see ParticleStyle's own docs for why this, and not a
    // separate small-radius field term, is what survived to be that knob).
    const jitterR = this.style.spawnJitterRadius * Math.sqrt(Math.random());
    const jitterA = Math.random() * Math.PI * 2;
    let sx = resolved.position[0] + Math.cos(jitterA) * jitterR;
    let sy = resolved.position[1] + Math.sin(jitterA) * jitterR;
    // resolved.position is guaranteed inside the mask (buildWorld either
    // found it naturally inside or walked it there with a snap buffer),
    // but an un-snapped source sitting close to a simplified coastline has
    // no guaranteed clearance — the jitter above could occasionally land
    // just outside. Falling back to the unjittered point keeps every
    // spawn point inside without exception, which the rescue logic below
    // depends on (it clamps back toward *last known inside*, and has
    // nothing to clamp back to if a particle starts its very first frame
    // already outside).
    if (!this.world.mask.isInside(sx, sy)) {
      sx = resolved.position[0];
      sy = resolved.position[1];
    }

    // Destination and route, then (under 'blanket') possibly a birth partway
    // along that route rather than at the farm.
    const mode = this.fieldParams.baseFieldMode;
    let route = Infinity;
    let heading: [number, number] | null = null;
    if (mode === 'blanket') {
      const pick = this.pickBlanketDestination(sx, sy);
      this.targetIndex[i] = pick ? pick.region : -1;
      this.destX[i] = pick ? pick.x : sx;
      this.destY[i] = pick ? pick.y : sy;
      if (pick) {
        const field = this.world.regions!.fields[pick.region];
        // A picked farm's particles always start at the farm: the point of
        // picking it is to see its flow leave it.
        const fromSource = this.time < this.fromSourcesUntil;
        if (
          srcIdx !== this.highlightIndex &&
          !onlyThread &&
          !fromSource &&
          Math.random() >= this.style.farmBirthShare
        ) {
          const born = this.midJourneyBirth(sx, sy, pick.x, pick.y);
          if (born) {
            sx = born.x;
            sy = born.y;
            heading = born.heading;
          }
        }
        route = field.sample(sx, sy).dist;
      }
    } else if (mode === 'targets') {
      this.targetIndex[i] = this.pickTargetIndex(sx, sy);
      const target = this.world.targets[this.targetIndex[i]];
      this.destX[i] = target ? target.position[0] : sx;
      this.destY[i] = target ? target.position[1] : sy;
      if (target) route = target.field.sample(sx, sy).dist;
    } else {
      this.targetIndex[i] = -1;
    }

    this.x[i] = sx;
    this.y[i] = sy;
    this.px[i] = sx;
    this.py[i] = sy;
    // Step 4: scales every spread below (not the mean of any of them) —
    // see ParticleStyle.jitterAmount's own docs. 1 reproduces the original
    // unscaled expressions exactly.
    const j = this.style.jitterAmount;
    // Initial heading: mostly southward with a little spread.
    // A particle born mid-route starts along its route instead.
    const baseAngle = heading ? Math.atan2(heading[1], heading[0]) : Math.PI / 2; // canvas: +y is south
    const angle = baseAngle + (Math.random() - 0.5) * 0.8 * j;
    this.hx[i] = Math.cos(angle);
    this.hy[i] = Math.sin(angle);
    this.age[i] = 0;
    const { min, extra } = this.ageBudgetRange();
    this.maxAge[i] = min + Math.random() * extra;
    this.speed[i] = 1 + (Math.random() - 0.5) * 0.4 * j;
    this.sourceIndex[i] = srcIdx;
    this.strikes[i] = 0;
    this.exiting[i] = 0;
    this.stallTime[i] = 0;
    this.checkpointX[i] = sx;
    this.checkpointY[i] = sy;
    this.checkpointAge[i] = 0;
    this.trappedFailStreak[i] = 0;
    this.overDensityTime[i] = 0;
    this.chirality[i] = (Math.random() - 0.5) * CHIRALITY_MAGNITUDE * j;
    this.lateralBias[i] = (Math.random() - 0.5) * LATERAL_BIAS_MAGNITUDE * j;
    this.noisePhase[i] = Math.random() * 1000; // decorrelates the fine noise octave's time axis — a phase, not a spread, so unscaled by j
    this.hueBucket[i] = jitteredBucket(j);
    this.weightBucket[i] = jitteredBucket(j);

    if (Number.isFinite(route)) {
      // Long enough to make the whole route at the slowest drift speed the
      // field produces (driftScale bottoms out near half), with room to spare
      // for the sway — arrival, not age, should end a targeted life.
      this.maxAge[i] = Math.max(this.maxAge[i], (2.5 * route) / Math.max(1, this.style.speed));
    }
  }

  /**
   * An even draw of a destination across the land, restricted to cells no
   * further north than the farm (a little slack aside) so flow keeps a
   * general southward direction. Rejection-sampled from world.regions'
   * interior cells; null if there are no regions, or no reachable cell turns
   * up within a few tries (a farm at the very south of the land).
   */
  private pickBlanketDestination(x: number, y: number): { region: number; x: number; y: number } | null {
    const regions = this.world.regions;
    if (!regions || regions.insideCells.length === 0) return null;
    const { cellSize, gridWidth, insideCells, cellRegion, fields } = regions;
    for (let attempt = 0; attempt < 24; attempt++) {
      const cell = insideCells[(Math.random() * insideCells.length) | 0];
      const cx = ((cell % gridWidth) + Math.random() - 0.5) * cellSize;
      const cy = (((cell / gridWidth) | 0) + Math.random() - 0.5) * cellSize;
      if (cy < y - cellSize) continue;
      const region = cellRegion[cell];
      if (region < 0 || !Number.isFinite(fields[region].sample(x, y).dist)) continue;
      if (!this.world.mask.isInside(cx, cy)) continue;
      return { region, x: cx, y: cy };
    }
    return null;
  }

  /**
   * The birthplace of a particle born mid-journey: a random point on the
   * straight line from its farm to its destination, scattered sideways. Not
   * a point on the route field's own path — shortest routes merge, so births
   * placed on them all land in the same few channels and draw the river
   * this mode exists to avoid. Retried a few times if the point falls in the
   * sea (a line across a firth); null if none lands, and the particle is
   * born at its farm instead.
   */
  private midJourneyBirth(
    fx: number,
    fy: number,
    dx: number,
    dy: number,
  ): { x: number; y: number; heading: [number, number] } | null {
    const lx = dx - fx;
    const ly = dy - fy;
    const len = Math.hypot(lx, ly);
    if (len < 1) return null;
    const ux = lx / len;
    const uy = ly / len;
    for (let attempt = 0; attempt < 8; attempt++) {
      const t = Math.pow(Math.random(), 1 / (1 + this.style.midJourneyBias));
      const side = (Math.random() - 0.5) * 2 * MID_JOURNEY_SCATTER_PX;
      const x = fx + lx * t - uy * side;
      const y = fy + ly * t + ux * side;
      if (this.world.mask.isInside(x, y)) return { x, y, heading: [ux, uy] };
    }
    return null;
  }

  /**
   * Weighted draw of a destination for a particle born at (x, y) — see
   * ParticleStyle.targetWeightExponent. Route distance is normalised by the
   * world's north-south span so the distance exponent means the same thing
   * at any viewport size, with a small floor so a target right beside the
   * spawn point doesn't take every particle. -1 when there are no targets,
   * or none reachable from here.
   */
  private pickTargetIndex(x: number, y: number): number {
    const { targets } = this.world;
    if (targets.length === 0) return -1;
    const { top, bottom } = this.world.projection.bounds;
    const span = Math.max(1, bottom - top);
    const { targetWeightExponent: a, targetDistanceExponent: b } = this.style;
    let total = 0;
    const odds = this.targetOdds;
    odds.length = targets.length;
    for (let t = 0; t < targets.length; t++) {
      const route = targets[t].field.sample(x, y).dist;
      const w = Number.isFinite(route)
        ? Math.pow(targets[t].target.weight, a) * Math.pow(route / span + 0.05, -b)
        : 0;
      odds[t] = w;
      total += w;
    }
    if (total <= 0) return -1;
    let r = Math.random() * total;
    for (let t = 0; t < targets.length; t++) {
      r -= odds[t];
      if (r <= 0) return t;
    }
    return targets.length - 1;
  }

  step(dt: number, fieldParams: FieldParams = DEFAULT_FIELD_PARAMS) {
    const { world } = this;
    const { mask } = world;
    this.fieldParams = fieldParams;
    this.time += dt;

    // Ramp the active count toward its target (setActiveFraction).
    if (this.activeCount !== this.activeTarget && this.rampPerSecond > 0) {
      this.rampCarry += this.rampPerSecond * dt;
      const move = Math.floor(this.rampCarry);
      if (move > 0) {
        this.rampCarry -= move;
        const next =
          this.activeTarget > this.activeCount
            ? Math.min(this.activeTarget, this.activeCount + move)
            : Math.max(this.activeTarget, this.activeCount - move);
        this.applyActiveCount(next);
      }
    } else {
      this.rampCarry = 0;
    }

    // Ease the selection's dimming in and out (HighlightStyle.fadeSeconds).
    const dimTarget = this.highlightIndex >= 0 ? 1 : 0;
    const fade = this.highlightStyle.fadeSeconds;
    this.dimLevel = fade > 0 ? this.dimLevel + (dimTarget - this.dimLevel) * (1 - Math.exp(-dt / fade)) : dimTarget;
    // dt-aware ease: style.turnRate is "per frame at 60fps" (step 1's fixed
    // 0.25 was implicitly tuned to 60fps); converting it to a continuous
    // per-second rate means tuned values hold at any frame rate.
    const ease = 1 - Math.pow(1 - this.style.turnRate, dt * 60);

    // 2g: decay + recompute the occupancy grid's gradient/mean once per
    // frame, from last frame's final deposits — not once per particle.
    // Every particle this frame reads the same settled snapshot (steering
    // below) and then deposits into it for *next* frame's snapshot, a
    // standard single-frame-lag scheme that keeps the field stable and the
    // per-particle cost at "one more array lookup".
    if (fieldParams.densityEnabled) {
      const decayFactor = Math.exp(-fieldParams.densityDecayRate * dt);
      this.densityField.decayAndUpdateGradient(decayFactor);
    }

    for (let i = 0; i < this.activeCount; i++) {
      if (this.exiting[i]) {
        this.options.onDeath?.(i, 'exit', this.age[i]);
        this.respawn(i);
        continue;
      }
      this.px[i] = this.x[i];
      this.py[i] = this.y[i];

      const traits: ParticleTraits = {
        chirality: this.chirality[i],
        lateralBias: this.lateralBias[i],
        noisePhase: this.noisePhase[i],
        targetIndex: this.targetIndex[i],
        destX: this.destX[i],
        destY: this.destY[i],
      };
      const { vx: fx, vy: fy, driftScale } = sampleField(
        [this.x[i], this.y[i]],
        [this.hx[i], this.hy[i]],
        world,
        fieldParams,
        this.time,
        traits,
        undefined,
        fieldParams.densityEnabled ? this.densityField : null,
      );
      const len = Math.hypot(fx, fy) || 1;
      // Ease heading toward the field direction rather than snapping to
      // it, so trails curve instead of zigzagging between grid cells.
      const targetHx = fx / len;
      const targetHy = fy / len;
      this.hx[i] += (targetHx - this.hx[i]) * ease;
      this.hy[i] += (targetHy - this.hy[i]) * ease;
      const hLen = Math.hypot(this.hx[i], this.hy[i]) || 1;
      this.hx[i] /= hLen;
      this.hy[i] /= hLen;

      // Couple advection speed to the field's own southward decay. Without
      // this, particles never slow down anywhere — they'd travel at their
      // jittered speed[i] forever, which both contradicts the spec's
      // "slowing to a stop in the far south" death condition and turns a
      // raised age budget into coast-scraping instead of a gentle stop
      // (step2 plan feedback).
      const effectiveSpeed = this.style.speed * this.speed[i] * driftScale;
      this.x[i] += this.hx[i] * effectiveSpeed * dt;
      this.y[i] += this.hy[i] * effectiveSpeed * dt;
      this.age[i] += dt;

      if (driftScale < STALL_DRIFT_SCALE) {
        this.stallTime[i] += dt;
      } else {
        this.stallTime[i] = 0;
      }

      // Check the whole travelled segment at ~1px resolution, not just
      // its endpoint. A single frame's travel is short (~1-2px), but
      // GB's coastline has pinch points (Solway Firth, the Clyde) at a
      // similar scale — the straight line render() draws between two
      // "inside" endpoints can still clip a thin outside notch between
      // them that a couple of fixed-fraction midpoints can straddle and
      // miss. Sampling once per pixel of segment length is what makes
      // the containment guarantee hold for the rendered line itself.
      const clamped = clampToMask(this.px[i], this.py[i], this.x[i], this.y[i], mask);
      if (clamped.left && fieldParams.coastMode === 'exit') {
        // Run off the edge: this frame draws up to the coast, and the
        // particle respawns at the start of the next step (see `exiting`).
        this.x[i] = clamped.x;
        this.y[i] = clamped.y;
        this.exiting[i] = 1;
        continue;
      } else if (clamped.left) {
        // 2a: rescue instead of kill. Clamp back to the last
        // confirmed-inside sample and slide the heading along the local
        // tangent (project out the normal component) rather than
        // reflecting — "glide, not scrape". Containment is exactly as
        // strict as before: the rendered segment's endpoints both test
        // inside, the same standard step 1 enforced by killing outright.
        const { gx, gy } = world.distanceField.sample(clamped.x, clamped.y);
        // Nudge a little further inside than the literal last-inside
        // sample, when that nudge itself still tests inside — see
        // CLAMP_NUDGE_PX's docs. Falls back to the un-nudged clamp point
        // (still a valid, inside point) if the nudge would overshoot past
        // a very thin spit of land.
        const nudgedX = clamped.x + gx * CLAMP_NUDGE_PX;
        const nudgedY = clamped.y + gy * CLAMP_NUDGE_PX;
        if (mask.isInside(nudgedX, nudgedY)) {
          this.x[i] = nudgedX;
          this.y[i] = nudgedY;
        } else {
          this.x[i] = clamped.x;
          this.y[i] = clamped.y;
        }
        const [thx, thy] = projectOntoTangent(this.hx[i], this.hy[i], gx, gy);
        this.hx[i] = thx;
        this.hy[i] = thy;
        this.strikes[i]++;
        this.totalStrikeEvents++;
        // this.x/this.y are Float32Array: the assignment above rounds the
        // float64 point we just validated with mask.isInside, and that
        // rounding can — rarely, only for a point sitting almost exactly
        // on a pixel boundary — tip it across into an outside pixel.
        // Re-validate against the *actual stored* value and recover if
        // storage rounding broke what we just proved.
        if (!mask.isInside(this.x[i], this.y[i])) {
          const recovered = findNearestInside(this.x[i], this.y[i], mask);
          if (recovered) {
            this.x[i] = recovered.x;
            this.y[i] = recovered.y;
          }
        }
      } else {
        this.strikes[i] = 0;
      }

      // Trapped check: a particle oscillating in a tight coastal pocket
      // can graze on and off forever without ever stringing together
      // STRIKE_LIMIT *consecutive* strikes. Checked on its own interval
      // (not every frame) so it's measuring net progress over a window,
      // not frame-to-frame jitter. The anchor (checkpointX/Y) only moves
      // on a passing window, so consecutive failures are measured from the
      // same point — TRAPPED_FAIL_STREAK failures in a row means the
      // particle hasn't gone anywhere in TRAPPED_FAIL_STREAK *
      // TRAPPED_CHECK_INTERVAL seconds, not just in one of them.
      let trapped = false;
      this.checkpointAge[i] += dt;
      if (this.checkpointAge[i] > TRAPPED_CHECK_INTERVAL) {
        const progressed = Math.hypot(
          this.x[i] - this.checkpointX[i],
          this.y[i] - this.checkpointY[i],
        );
        if (progressed < TRAPPED_MIN_DISPLACEMENT * (this.style.speed / DEFAULT_PARTICLE_STYLE.speed)) {
          this.trappedFailStreak[i]++;
          if (this.trappedFailStreak[i] >= TRAPPED_FAIL_STREAK) trapped = true;
        } else {
          this.checkpointX[i] = this.x[i];
          this.checkpointY[i] = this.y[i];
          this.trappedFailStreak[i] = 0;
        }
        this.checkpointAge[i] = 0;
      }

      // 2g: deposit at this frame's final (post-move, post-rescue)
      // position, and track how long this particle has sat somewhere
      // over-dense — "recycling for coverage". Deposit happens
      // unconditionally when the mechanism is on (even a particle about
      // to be force-respawned below should still register where it *was*
      // crowding). Note the recycle check below reads `density` right
      // after this same deposit — `deposit()` mutates `occupancy`
      // directly and `sample()` reads it live, so this frame's own
      // deposit (and any lower-indexed particle's from this same frame)
      // is already visible here, not deferred to the next
      // `decayAndUpdateGradient` call.
      let overDensity = false;
      if (fieldParams.densityEnabled) {
        this.densityField.deposit(this.x[i], this.y[i], fieldParams.densityDepositRate * dt);
        const { density } = this.densityField.sample(this.x[i], this.y[i]);
        const mean = this.densityField.meanInteriorDensity;
        // Guard against the cold-start window (mean still ~0, nothing
        // deposited yet) reading every first-touched cell as infinitely
        // over its target.
        if (mean > 1e-6 && density > mean * fieldParams.densityRecycleThreshold) {
          this.overDensityTime[i] += dt;
        } else {
          this.overDensityTime[i] = 0;
        }
        if (this.overDensityTime[i] > DENSITY_RECYCLE_DURATION) overDensity = true;
      }

      // Order matters only for reporting which cause "wins" when several
      // thresholds are crossed in the same frame — containment and the
      // respawn itself don't depend on it.
      let arrived = false;
      if (fieldParams.baseFieldMode === 'targets' && this.targetIndex[i] >= 0) {
        // Route distance, not straight-line: a city's point can sit just
        // offshore, and its field is seeded at the nearest land cell.
        const target = world.targets[this.targetIndex[i]];
        arrived = target !== undefined && target.field.sample(this.x[i], this.y[i]).dist < TARGET_ARRIVE_PX;
      } else if (fieldParams.baseFieldMode === 'blanket' && this.targetIndex[i] >= 0) {
        arrived = Math.hypot(this.destX[i] - this.x[i], this.destY[i] - this.y[i]) < TARGET_ARRIVE_PX;
      }

      let cause: DeathCause | null = null;
      if (arrived) cause = 'arrive';
      else if (this.age[i] > this.maxAge[i]) cause = 'age';
      else if (this.strikes[i] > STRIKE_LIMIT) cause = 'strike';
      else if (this.stallTime[i] > STALL_DURATION) cause = 'stall';
      else if (trapped) cause = 'trapped';
      else if (overDensity) cause = 'density';

      if (cause) {
        this.options.onDeath?.(i, cause, this.age[i]);
        this.respawn(i);
      }
    }
  }

  /**
   * Draws every particle's previous->current segment, batched by render
   * bucket (source x hueBucket x weightBucket) rather than one draw call
   * per particle — the spec's "per-source colour channel" and "per-
   * particle jitter in weight ... and hue" (Flow_Experiment_Spec.md,
   * "Trails and particles") both need per-particle style variation, but
   * Canvas 2D only takes one strokeStyle/lineWidth per stroke() call, and
   * thousands of individual stroke() calls a frame would blow the 60fps
   * budget. Bucketing keeps it at (sources x 9) draw calls — a few dozen
   * — with every particle still getting exactly one segment draw, matching
   * the spec's "one segment draw per particle" performance target.
   *
   * `renderBuckets` is reused frame to frame (lengths reset, not the
   * arrays reallocated) so this stays allocation-free like `step()`.
   */
  render(ctx: CanvasRenderingContext2D, palette: Palette, strokeWeightMultiplier = 1) {
    const numSources = this.world.sources.length;
    const numBuckets = numSources * 9; // 3 hueBuckets x 3 weightBuckets, offset -1..1 each
    if (this.renderBuckets.length !== numBuckets) {
      this.renderBuckets = Array.from({ length: numBuckets }, () => []);
    } else {
      for (const bucket of this.renderBuckets) bucket.length = 0;
    }

    for (let i = 0; i < this.activeCount; i++) {
      const bucketIndex =
        this.sourceIndex[i] * 9 + (this.hueBucket[i] + 1) * 3 + (this.weightBucket[i] + 1);
      this.renderBuckets[bucketIndex].push(i);
    }

    ctx.lineCap = 'round';
    const highlighted = this.highlightIndex;
    const { dimAlpha } = this.highlightStyle;
    // While a source is picked out, every other source draws at reduced opacity
    // (the selection reads by contrast, not by hue alone) and the picked one is
    // drawn last, on top, in the highlight colour.
    ctx.globalAlpha = 1 - (1 - dimAlpha) * this.dimLevel;
    for (let b = 0; b < numBuckets; b++) {
      const indices = this.renderBuckets[b];
      if (indices.length === 0) continue;
      const sourceIdx = Math.floor(b / 9);
      if (sourceIdx === highlighted) continue;
      const hueBucket = Math.floor((b % 9) / 3) - 1;
      const weightBucket = (b % 3) - 1;
      const channel = this.world.sources[sourceIdx]?.source.palette;
      ctx.strokeStyle = resolveStrokeColor(palette, channel, hueBucket);
      // Step 4's stroke-weight slider: a multiplier on top of the
      // palette's own tuned base width, not a replacement for it — so the
      // per-particle weightBucket texture (and the dark/light palettes'
      // different base widths) survive under any multiplier value.
      ctx.lineWidth = resolveStrokeWidth(palette, weightBucket) * strokeWeightMultiplier;
      ctx.beginPath();
      for (const i of indices) {
        // A particle that just respawned this frame has px/py reset equal
        // to x/y (see respawn()), so this degenerates to a zero-length
        // segment rather than a streak from its old death point.
        ctx.moveTo(this.px[i], this.py[i]);
        ctx.lineTo(this.x[i], this.y[i]);
      }
      ctx.stroke();
    }

    if (highlighted >= 0) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = this.highlightStyle.color;
      for (let b = highlighted * 9; b < highlighted * 9 + 9; b++) {
        const indices = this.renderBuckets[b];
        if (indices.length === 0) continue;
        const weightBucket = (b % 3) - 1;
        ctx.lineWidth =
          resolveStrokeWidth(palette, weightBucket) * strokeWeightMultiplier * this.highlightStyle.widthScale;
        ctx.beginPath();
        for (const i of indices) {
          ctx.moveTo(this.px[i], this.py[i]);
          ctx.lineTo(this.x[i], this.y[i]);
        }
        ctx.stroke();
      }
    }
    // The caller's next draw is its trail-fade wash, which must not inherit a dimmed alpha.
    ctx.globalAlpha = 1;
  }
}
