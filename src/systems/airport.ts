// An airport's flights (Chapter 4, Skyport International): each plane comes in to land, rolls out, taxis
// to its gate and parks; it's turned round there against its departure clock (passengers board, and once
// they're bought, fuel and cases go on); cleared, it pushes back, taxis out, lines up and takes off.
// One runway is shared by landings and take-offs, and one taxiway by planes coming and going: nothing
// moves onto either while it's taken. Pure logic: where each plane is and what it's doing. The game
// draws them, walks the passengers and pays.
import type { AirportLayout, GateSpot, PlaneKind, Point, StandSpot, Tuning } from '../core/config';

export type Phase = 'approach' | 'rollout' | 'taxiIn' | 'parked' | 'pushback' | 'taxiOut' | 'hold' | 'lineup' | 'takeoff' | 'climb';
export type { PlaneKind };

/** The plane a gate (or stand) takes: the propeller airliner unless it says (the jet at Gate 3, the wide-body at Gate 4, the private jet). */
export const planeAt = (spot: { plane?: PlaneKind }): PlaneKind => spot.plane ?? 'prop';

/**
 * Where a plane (its middle) waits on the taxiway for the runway: short of the link, and far enough west that
 * its tail's clear of the westmost stand's turn, wingtips and all, for whatever's turning in there (a long plane
 * waits further west; out to the second runway, round the first's end, it may wait past the link).
 */
export function holdFor(layout: AirportLayout, rules: Tuning['airport'], kind: PlaneKind, second: boolean): number {
  const spots = [...Object.values(layout.gates), ...Object.values(layout.stands)];
  const west = spots.reduce((a, b) => (b.x < a.x ? b : a));
  const clear = west.x - rules.planes[planeAt(west)].span / 2 - rules.flight.wingClear - rules.planes[kind].length / 2;
  const hold = Math.min(layout.links.entry + 7, clear);
  return second ? hold : Math.max(layout.links.entry + 2, hold);
}

/** A stand that isn't a gate's, as a gate's spot (what a gate has that it hasn't is its marshal's spot, or its door's). */
/** The link a plane bound for a stand at `x` leaves the runway by. */
export function exitFor(layout: AirportLayout, x: number): number {
  const { links } = layout;
  // (Part E: the Sky Queen's stand, east of the east link, has a link of its own further east still.)
  if (links.queen !== undefined && links.east !== undefined && x > links.east + 2) return links.queen;
  if (links.east !== undefined && x > links.far - 2) return links.east;
  return x > links.exit - 2 ? links.far : links.exit;
}

export function standSpot(stand: StandSpot): GateSpot {
  const at = stand.marshal;
  const door = stand.planeDoor ?? at;
  return { x: stand.x, noseZ: stand.noseZ, plane: stand.plane, marshal: at, door: at, podium: at, truck: at, fuelSpot: at, stairsFoot: door, planeDoor: door, hold: at, lounge: { minX: at.x, maxX: at.x, minZ: at.z, maxZ: at.z } };
}

/** What the tower made of a flight (Part C): how its fare, its cases and its clock compare with an ordinary one's. */
export interface FlightTerms {
  fare: number;
  cases: number;
  clock: number;
}

type Rules = Tuning['airport'];

/** A way along the ground: points joined by straight lines, with how far along each is. */
export class Route {
  readonly total: number;
  private readonly lengths: number[] = [0];

  constructor(readonly points: Point[]) {
    for (let i = 1; i < points.length; i++) this.lengths.push(this.lengths[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z));
    this.total = this.lengths.at(-1)!;
  }

  /** The point `s` metres along, and which way the route runs there (radians, 0 = +z, as rotation.y). */
  at(s: number): { x: number; z: number; dir: number } {
    const d = Math.max(0, Math.min(this.total, s));
    let i = 1;
    while (i < this.points.length - 1 && this.lengths[i]! < d) i++;
    const a = this.points[i - 1]!;
    const b = this.points[i]!;
    const span = this.lengths[i]! - this.lengths[i - 1]! || 1;
    const k = (d - this.lengths[i - 1]!) / span;
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, dir: Math.atan2(b.x - a.x, b.z - a.z) };
  }
}

/** The same way with its corners rounded off (a turn of about `radius` metres at each). */
export function rounded(points: Point[], radius: number, steps = 7): Point[] {
  const out: Point[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const c = points[i + 1]!;
    const ab = Math.hypot(b.x - a.x, b.z - a.z);
    const bc = Math.hypot(c.x - b.x, c.z - b.z);
    const d = Math.min(radius, ab / 2, bc / 2);
    const p1 = { x: b.x - ((b.x - a.x) / ab) * d, z: b.z - ((b.z - a.z) / ab) * d };
    const p2 = { x: b.x + ((c.x - b.x) / bc) * d, z: b.z + ((c.z - b.z) / bc) * d };
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const u = 1 - t;
      out.push({ x: u * u * p1.x + 2 * u * t * b.x + t * t * p2.x, z: u * u * p1.z + 2 * u * t * b.z + t * t * p2.z });
    }
  }
  out.push(points.at(-1)!);
  return out;
}

/** The shortest way round from one heading to another. */
function turnTo(from: number, to: number, share: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return from + d * share;
}

/** One plane's visit: in, round and out again. */
export class Flight {
  phase: Phase = 'approach';
  x = 0;
  y = 0;
  z = 0;
  /** Which way its nose points (radians, 0 = +z), how far its nose is up, and how far it's rolled into a turn. */
  heading = Math.PI / 2;
  pitch = 0;
  bank = 0;
  speed = 0;
  /** How hard its engines are running (0 stopped, 1 flat out). */
  engines = 0.7;
  readonly kind: PlaneKind;
  readonly seats: number;
  /** Passengers aboard, and on their way across the apron. */
  boarded = 0;
  walking = 0;
  /** Still in the lounge for it (the game keeps this up to date). */
  waiting = 0;
  /** The gate's been opened: passengers go out to the plane as they're ready. */
  boarding = false;
  /** Fuel aboard (0–1), cases in the hold, trays of meals in the galley. */
  fuel = 0;
  cases = 0;
  meals = 0;
  /** What it needs before it can go (the game sets these from what's built). */
  needsFuel = false;
  needsCases = 0;
  needsMeals = 0;
  /** Seconds left on its departure clock (counted from when it parks), and what it started with. */
  clock: number;
  clockMax: number;
  late = false;
  /** Guided in by someone on its ramp pad. */
  marshalled = false;
  /** Cleared for take-off (it leaves as soon as the taxiway's free), and whether on the ring. */
  cleared = false;
  perfect = false;
  /** How long it's been ready to go (the ramp pad's ring runs on this). */
  readyFor = 0;
  /** Seconds since it parked. */
  parkedFor = 0;
  /** Seconds it's waited on its stand since it was cleared (the longest-waiting goes first). */
  clearedFor = 0;
  /** The tower's card it came in on (Part C), if it came in on one. */
  card: (FlightTerms & { kind: string }) | null = null;
  /** Along its way on the ground, and how far through its approach it is (0–1). */
  private route: Route | null = null;
  private along = 0;
  approach = 0;

  /** How far it's come along its way (lining up: from the hold). */
  get travelled(): number {
    return this.along;
  }

  constructor(
    readonly id: number,
    readonly gate: string,
    readonly spot: GateSpot,
    readonly livery: number,
    private readonly layout: AirportLayout,
    private readonly rules: Rules,
    clock: number,
  ) {
    this.kind = planeAt(spot);
    this.seats = rules.planes[this.kind].seats;
    this.clock = clock;
    this.clockMax = clock;
  }

  /** Everything it needs is done and everyone who's coming is aboard: it can be cleared. */
  get ready(): boolean {
    if (this.phase !== 'parked' || this.cleared || !this.boarding || this.boarded === 0 || this.walking > 0) return false;
    if (this.needsFuel && this.fuel < 1) return false;
    if (this.cases < this.needsCases) return false;
    if (this.meals < this.needsMeals) return false;
    return this.boarded >= this.seats || this.waiting === 0;
  }

  get full(): boolean {
    return this.boarded >= this.seats;
  }

  /** Where it leaves the runway: the usual link, or (for stands east of it) the one at the far end, or (Part D, the cargo and hangar stands further east still) the east link. */
  get exitX(): number {
    return exitFor(this.layout, this.spot.x);
  }

  /** Where it touches down (as far short of its exit as at the usual one, so it's no longer on the runway), and where it stops at its gate (its middle). */
  private get touchdown(): number {
    const { runway, links } = this.layout;
    return this.exitX - (links.exit - (runway.minX + 14));
  }
  get standZ(): number {
    return this.spot.noseZ - this.rules.planes[this.kind].length / 2;
  }

  /** The way in from the runway to the stand. */
  private wayIn(): Route {
    const { runway, taxiway } = this.layout;
    // (Stands past the usual exit, east of the kitchen, are reached from the link at the far end: everything
    // on the taxiway still heads west.)
    const exit = this.exitX;
    return new Route(
      rounded(
        [
          { x: this.touchdown, z: runway.z },
          { x: exit, z: runway.z },
          { x: exit, z: taxiway.z },
          { x: this.spot.x, z: taxiway.z },
          { x: this.spot.x, z: this.standZ },
        ],
        5,
      ),
    );
  }

  /** Backwards off the stand, swinging its tail round to end on the taxiway facing the runway's start. */
  private wayBack(): Route {
    const { taxiway } = this.layout;
    return new Route(rounded([{ x: this.spot.x, z: this.standZ }, { x: this.spot.x, z: taxiway.z }, { x: this.spot.x + 6, z: taxiway.z }], 5.5));
  }

  /** Where it waits for the runway (set as it comes off its stand): see holdFor. */
  private holdX = 0;

  private wayOut(second: boolean): Route {
    this.holdX = holdFor(this.layout, this.rules, this.kind, second);
    return new Route([{ x: this.spot.x + 6, z: this.layout.taxiway.z }, { x: this.holdX, z: this.layout.taxiway.z }]);
  }

  private wayOn(): Route {
    const { runway, taxiway, links } = this.layout;
    return new Route(rounded([{ x: this.holdX, z: taxiway.z }, { x: Math.min(links.entry, this.holdX - 1), z: taxiway.z }, { x: links.entry, z: runway.z }, { x: links.entry + 9, z: runway.z }], 4.5));
  }

  /** (Part D) Out to the second runway instead: on west past the first's end, round it and north, onto the second facing east. */
  private wayOn2(): Route {
    const { taxiway, links, runway2 } = this.layout;
    const x = links.around!;
    const z = runway2!.z;
    return new Route(rounded([{ x: this.holdX, z: taxiway.z }, { x, z: taxiway.z }, { x, z }, { x: x + 11, z }], 6));
  }

  /** Puts it on its stand already, parked (the Sky Queen, rolled out where she was built). */
  parkNow(): void {
    this.phase = 'parked';
    this.approach = 1;
    this.x = this.spot.x;
    this.y = 0;
    this.z = this.standZ;
    this.heading = 0;
    this.pitch = 0;
    this.bank = 0;
    this.speed = 0;
    this.engines = 0;
  }

  /** Starts it part-way down its approach (the very first plane is nearly down as the hero arrives). */
  startAt(approach: number): void {
    this.approach = approach;
    this.fly();
  }

  private fly(): void {
    const { runway } = this.layout;
    // (From no further out than a far-link arrival's, so one bound for the east link isn't hurried.)
    const from = Math.max(runway.minX - 96, this.touchdown - 175);
    const u = this.approach;
    this.x = from + (this.touchdown - from) * u;
    this.z = runway.z;
    // A steady glide, flattening out over the last stretch.
    this.y = 27 * (1 - u) ** 1.35;
    this.pitch = 0.05 + 0.1 * u ** 3;
    this.heading = Math.PI / 2;
    this.speed = this.rules.flight.landSpeed * (1.45 - 0.45 * u);
    this.engines = 0.75 - 0.3 * u;
  }

  private follow(dt: number, speed: number, reverse = false): boolean {
    const route = this.route!;
    this.speed = speed;
    this.along = Math.min(route.total, this.along + speed * dt);
    const p = route.at(this.along);
    this.x = p.x;
    this.z = p.z;
    this.heading = turnTo(this.heading, reverse ? p.dir + Math.PI : p.dir, 1 - Math.exp(-dt * 7));
    return this.along >= route.total;
  }

  /**
   * One step. `push` and `lineUp` say whether it may back off its stand or take the runway now (asked only
   * when it's waiting to); taxiing out, it stops short of `stopAt` (the tail of whatever's ahead of it on the
   * taxiway, queued for the runway). Returns what just happened, if anything.
   */
  update(dt: number, may: { push: boolean; lineUp: boolean; stopAt?: number; runway2?: boolean }): 'touchdown' | 'parked' | 'pushback' | 'airborne' | 'gone' | null {
    const f = this.rules.flight;
    switch (this.phase) {
      case 'approach': {
        this.approach = Math.min(1, this.approach + dt / f.approachSeconds);
        this.fly();
        if (this.approach < 1) return null;
        this.phase = 'rollout';
        this.route = this.wayIn();
        this.along = 0;
        this.y = 0;
        return 'touchdown';
      }
      case 'rollout':
      case 'taxiIn': {
        const route = this.route!;
        // Brakes on down the runway, a steady taxi, and a gentle stop on the stand.
        const braking = Math.max(0, 1 - this.along / 34);
        const left = route.total - this.along;
        const speed = Math.max(1.1, Math.min(f.taxiSpeed + (f.landSpeed - f.taxiSpeed) * braking, f.taxiSpeed * Math.min(1, 0.18 + left / 7)));
        this.pitch *= Math.exp(-dt * 4);
        this.engines += (0.3 - this.engines) * (1 - Math.exp(-dt * 1.5));
        const done = this.follow(dt, speed);
        if (this.phase === 'rollout' && this.z > this.layout.runway.z + this.layout.runway.half + 2) this.phase = 'taxiIn';
        if (!done) return null;
        this.phase = 'parked';
        this.heading = 0;
        this.speed = 0;
        return 'parked';
      }
      case 'parked': {
        this.parkedFor += dt;
        this.engines *= Math.exp(-dt * 1.4);
        if (this.engines < 0.01) this.engines = 0;
        if (!this.cleared) {
          this.clock = Math.max(0, this.clock - dt);
          if (this.clock === 0) this.late = true;
          this.readyFor = this.ready ? this.readyFor + dt : 0;
          return null;
        }
        // Cleared: engines start, and it's off as soon as nothing's in its way (once what was at its doors, a jet's
        // bridge and catering truck, the freighter's loader, has had a moment to pull back).
        this.clearedFor += dt;
        this.engines = Math.min(0.35, this.engines + dt * 0.25 + 0.05);
        if (!may.push || this.clearedFor < this.rules.planes[this.kind].pushDelay) return null;
        this.phase = 'pushback';
        this.route = this.wayBack();
        this.along = 0;
        return 'pushback';
      }
      case 'pushback': {
        this.engines += (0.35 - this.engines) * (1 - Math.exp(-dt * 2));
        const left = this.route!.total - this.along;
        if (!this.follow(dt, f.pushSpeed * Math.min(1, 0.25 + left / 3, 0.3 + this.along / 2), true)) return null;
        this.phase = 'taxiOut';
        this.route = this.wayOut(!!may.runway2);
        this.along = 0;
        return null;
      }
      case 'taxiOut': {
        this.engines += (0.4 - this.engines) * (1 - Math.exp(-dt * 2));
        const left = this.route!.total - this.along;
        // Queued for the runway: it eases up behind whatever's ahead and waits there.
        const room = this.x - (may.stopAt ?? -Infinity);
        if (this.follow(dt, f.taxiSpeed * Math.max(0, Math.min(1, 0.2 + left / 6, 0.25 + this.along / 4, (room - 0.3) / 5)))) this.phase = 'hold';
        return null;
      }
      case 'hold': {
        this.speed = 0;
        if (!may.lineUp) return null;
        this.phase = 'lineup';
        this.route = may.runway2 ? this.wayOn2() : this.wayOn();
        this.along = 0;
        return null;
      }
      case 'lineup': {
        this.engines += (0.5 - this.engines) * (1 - Math.exp(-dt * 2));
        if (this.follow(dt, f.taxiSpeed * Math.min(1, 0.3 + this.along / 4))) {
          this.phase = 'takeoff';
          this.heading = Math.PI / 2;
        }
        return null;
      }
      case 'takeoff': {
        this.engines = Math.min(1, this.engines + dt * 1.2);
        this.speed += f.takeoffAccel * dt;
        this.x += this.speed * dt;
        if (this.speed < f.rotateSpeed) return null;
        this.phase = 'climb';
        return 'airborne';
      }
      case 'climb': {
        this.engines = 1;
        this.speed += f.takeoffAccel * 0.5 * dt;
        this.pitch += (0.3 - this.pitch) * (1 - Math.exp(-dt * 2.2));
        this.y += this.speed * Math.sin(this.pitch) * dt;
        // Once it's well up it banks away from the airport.
        const turning = Math.max(0, Math.min(1, (this.y - 9) / 10));
        this.bank += (0.38 * turning - this.bank) * (1 - Math.exp(-dt * 1.5));
        this.heading += this.bank * 0.5 * dt;
        this.x += Math.sin(this.heading) * this.speed * Math.cos(this.pitch) * dt;
        this.z += Math.cos(this.heading) * this.speed * Math.cos(this.pitch) * dt;
        return this.y > 62 || this.x > this.layout.runway.maxX + 70 ? 'gone' : null;
      }
    }
  }
}

export interface AirfieldEvents {
  onTouchdown?(flight: Flight): void;
  onParked?(flight: Flight): void;
  onPushback?(flight: Flight): void;
  onAirborne?(flight: Flight): void;
  onGone?(flight: Flight): void;
}

/** Every flight at the airport, and who may use the runway and the taxiway when. */
export class Airfield {
  readonly flights: Flight[] = [];
  /** Gates open for planes (built), by key. */
  private readonly open = new Set<string>();
  /** Seconds until each empty gate's next plane is sent for. */
  private readonly gap = new Map<string, number>();
  /** Gates (stands) whose planes come only when called for (Mogul Air's own, the private jets'), and those called. */
  private readonly manual = new Set<string>();
  private readonly called = new Set<string>();
  /** Fog: no new arrivals are sent for while it's down (planes already coming in still land). */
  paused = false;
  /** The terms of the next arrival (the tower's card), asked as each is sent for. */
  terms: ((gate: string) => (FlightTerms & { kind: string; livery?: number }) | null) | null = null;
  private readonly stands = new Map<string, GateSpot>();
  private nextId = 1;
  private lastLivery = -1;
  /** Flights that have come so far (the first has a longer clock). */
  arrivals = 0;
  /**
   * (Part D) Departures take off from the second runway (round the first's west end), leaving the first to
   * the landings: arrivals no longer wait for planes lining up or taking off, nor they for arrivals.
   */
  runway2 = false;

  constructor(
    private readonly layout: AirportLayout,
    private readonly rules: Rules,
    private readonly liveries: number,
    private readonly events: AirfieldEvents = {},
    private readonly random: () => number = Math.random,
  ) {}

  /** A gate's spot, or a stand's (as a gate's). */
  spotOf(gate: string): GateSpot | null {
    const spot = this.layout.gates[gate];
    if (spot) return spot;
    const stand = this.layout.stands?.[gate];
    if (!stand) return null;
    let made = this.stands.get(gate);
    if (!made) this.stands.set(gate, (made = standSpot(stand)));
    return made;
  }

  /** Calls for a plane to a manual stand: it's sent as soon as the runway's free (and the fog's lifted). */
  call(gate: string): void {
    if (this.manual.has(gate)) this.called.add(gate);
  }

  /** Whether a plane's been called for a stand and not sent yet. */
  calling(gate: string): boolean {
    return this.called.has(gate);
  }

  /** Opens a gate (or a stand) for planes; a `manual` one's come only when called for. */
  openGate(gate: string, wait = 0, manual = false): void {
    if (this.open.has(gate) || !this.spotOf(gate)) return;
    this.open.add(gate);
    this.gap.set(gate, wait);
    if (manual) this.manual.add(gate);
  }

  /** The plane at (or on its way to) a gate. */
  at(gate: string): Flight | null {
    return this.flights.find((f) => f.gate === gate && !['pushback', 'taxiOut', 'hold', 'lineup', 'takeoff', 'climb'].includes(f.phase)) ?? null;
  }

  /** The plane parked at a gate, if there's one. */
  parkedAt(gate: string): Flight | null {
    const flight = this.at(gate);
    return flight?.phase === 'parked' ? flight : null;
  }

  private has(...phases: Phase[]): boolean {
    return this.flights.some((f) => phases.includes(f.phase));
  }

  /** Sends for a plane for `gate` (nearly down already if `approach` is given). */
  send(gate: string, approach = 0): Flight | null {
    const spot = this.spotOf(gate);
    if (!spot || this.at(gate)) return null;
    const card = this.manual.has(gate) ? null : (this.terms?.(gate) ?? null);
    let livery = card?.livery ?? Math.floor(this.random() * this.liveries);
    if (card?.livery === undefined && livery === this.lastLivery) livery = (livery + 1) % this.liveries;
    this.lastLivery = livery;
    const first = this.arrivals === 0;
    const clock = (first ? this.rules.flight.firstClock : this.rules.planes[planeAt(spot)].clock) * (card?.clock ?? 1);
    const flight = new Flight(this.nextId++, gate, spot, livery, this.layout, this.rules, clock);
    flight.card = card;
    flight.startAt(approach);
    this.arrivals += 1;
    this.flights.push(flight);
    return flight;
  }

  /** Puts a plane on a stand that's empty, parked there already (no flight in): the Sky Queen as she's rolled out. */
  park(gate: string): Flight | null {
    const spot = this.spotOf(gate);
    if (!spot || this.at(gate) || this.flights.some((f) => f.gate === gate)) return null;
    const flight = new Flight(this.nextId++, gate, spot, 0, this.layout, this.rules, this.rules.planes[planeAt(spot)].clock);
    flight.parkNow();
    this.flights.push(flight);
    this.called.delete(gate);
    this.events.onParked?.(flight);
    return flight;
  }

  /** The planes still out on the taxiway on their way to the runway (backing onto it, taxiing, holding, turning onto the runway). */
  private departing(f: Flight): boolean {
    if (f.phase === 'pushback' || f.phase === 'taxiOut' || f.phase === 'hold') return true;
    return f.phase === 'lineup' && f.z > this.layout.taxiway.z - this.layout.taxiway.half - this.rules.planes[f.kind].length / 2;
  }

  /**
   * Whether a plane sent for `gate` now would find its way in clear: nothing backing out east of the stand
   * (it'd be taxiing past as the arrival came), nothing taxiing out that'd still be across its link when it
   * comes off the runway, and the queue for the runway — everything on its way out, each stopped behind the
   * one ahead, the first at the hold — ending short of the stand's turn.
   */
  private wayInClear(gate: string): boolean {
    const spot = this.spotOf(gate)!;
    const length = this.rules.planes[planeAt(spot)].length;
    const link = exitFor(this.layout, spot.x);
    const out = this.flights.filter((f) => this.departing(f)).sort((a, b) => a.x - b.x);
    // (How soon it'd be down its link at the taxiway: down the approach, along the runway and up the link.)
    const eta = this.rules.flight.approachSeconds + 4;
    let at = -Infinity;
    let before = 0;
    for (const f of out) {
      const own = this.rules.planes[f.kind].length;
      if (f.phase === 'pushback' && f.spot.x + 6 + (own + length) / 2 + 4 > spot.x) return false;
      at = at === -Infinity ? Math.min(f.x, holdFor(this.layout, this.rules, f.kind, this.runway2)) : at + (before + own) / 2 + 3;
      before = own;
      // (Its tail clear of where the arrival turns in, wingtips and all.)
      if (at + own / 2 > spot.x - this.rules.planes[planeAt(spot)].span / 2 - this.rules.flight.wingClear) return false;
      // Taxiing out past where it'll come off the runway: it has to be clear of the link by the time the
      // arrival's there (and not stop across it, queued for the runway).
      const reach = (own + length) / 2 + 4;
      const x = f.phase === 'pushback' ? f.spot.x + 6 : f.x;
      if (f.phase !== 'hold' && x + reach > link) {
        if (at + reach > link) return false;
        if (f.phase === 'pushback' || (x + reach - link) / this.rules.flight.taxiSpeed > eta - 3) return false;
      }
    }
    return true;
  }

  /** The open gate (or called stand) that's waited longest for a plane, if it's waited a good while and its way in's blocked. */
  private starving(): string | null {
    let worst: string | null = null;
    for (const gate of this.open) {
      if ((this.manual.has(gate) && !this.called.has(gate)) || this.at(gate)) continue;
      if ((this.gap.get(gate) ?? 0) < -this.rules.flight.starveSeconds && (!worst || this.gap.get(gate)! < this.gap.get(worst)!)) worst = gate;
    }
    return worst && !this.wayInClear(worst) ? worst : null;
  }

  /** The stretch of taxiway a plane backs onto (and room either side for the plane passing it). */
  private zone(plane: Flight, other: Flight): { west: number; east: number } {
    const room = (this.rules.planes[other.kind].length + this.rules.planes[plane.kind].length) / 2 + 2;
    return { west: plane.spot.x - room, east: plane.spot.x + 6 + room };
  }

  /**
   * Whether a cleared plane may back off its stand now: no arrival in its way, at most two others already out
   * on their way (backing off their stands or taxiing), and every one of them west of its stretch of the taxiway
   * (heading away; one further east would come through it) — and no gate kept waiting too long for a plane
   * whose way in the queue for the runway blocks.
   */
  private mayPush(plane: Flight): boolean {
    // (A gate that's waited too long for a plane gets the taxiway cleared for it first.)
    if (!this.paused && this.starving()) return false;
    let out = 0;
    for (const f of this.flights) {
      if (f === plane) continue;
      if (this.inTheWay(f, plane)) return false;
      if (!this.departing(f)) continue;
      // (Another backing off its stand is fine if it's well west: it'll be gone ahead of this one. One still far
      // to the east is too: it can't get here before this one's out on the taxiway, and then it waits behind it.)
      const at = f.phase === 'pushback' ? f.spot.x + 6 : f.x;
      const zone = this.zone(plane, f);
      const far = zone.east + (f.phase === 'taxiOut' ? this.rules.flight.clearAhead : f.phase === 'pushback' ? this.rules.flight.clearAhead / 2 : 0);
      if (++out > 2 || (at > zone.west && at < far)) return false;
    }
    return true;
  }

  /** Where a plane taxiing out has to stop: short of the tail of whatever's ahead of it (west) on the taxiway. */
  private stopAt(plane: Flight): number {
    const { taxiway } = this.layout;
    const length = this.rules.planes[plane.kind].length;
    let stop = -Infinity;
    for (const f of this.flights) {
      if (f === plane || f.y > 1) continue;
      const other = this.rules.planes[f.kind].length;
      // (One backing off its stand ahead counts from the start, at the end of its push: it's on its way out.)
      const x = f.phase === 'pushback' ? f.spot.x + 6 : f.x;
      if (x >= plane.x) continue;
      // Still over the taxiway (an arrival not yet turned off it, a departure not yet onto the runway).
      if (f.phase !== 'pushback' && Math.abs(f.z - taxiway.z) > taxiway.half + other / 2) continue;
      stop = Math.max(stop, x + (length + other) / 2 + 3);
    }
    return stop;
  }

  /**
   * Whether an arrival is in the way of `plane` backing off its stand. Everything on the taxiway heads west, so
   * an arrival's only in the way if it'll still pass along the stretch the plane backs onto (taxiing west from
   * its link to its own stand), it's yet to come off the runway by a link on the plane's way out, or it's
   * turning in at a stand on that way with its tail still out on the taxiway. (Arrivals bound elsewhere — a
   * stand east of it, or one west of it once they're past — let it go.)
   */
  private inTheWay(arrival: Flight, plane: Flight): boolean {
    if (arrival === plane) return false;
    if (!(arrival.phase === 'rollout' || arrival.phase === 'taxiIn' || (arrival.phase === 'approach'))) return false;
    const { taxiway, links } = this.layout;
    const length = this.rules.planes[arrival.kind].length;
    const room = (length + this.rules.planes[plane.kind].length) / 2 + 2;
    const west = plane.spot.x - room;
    const east = plane.spot.x + 6 + room;
    const north = arrival.z - taxiway.z;
    if (arrival.phase === 'taxiIn' && north > 2) {
      // Turning in: in the way while it's turning in beside the plane, or its tail's still out on the plane's way.
      return (arrival.spot.x > west && arrival.spot.x < east) || (arrival.spot.x < east && north < length / 2 + taxiway.half + 2);
    }
    const from = arrival.phase === 'taxiIn' ? arrival.x : arrival.exitX;
    if (Math.min(from, arrival.spot.x) < east && Math.max(from, arrival.spot.x) > west) return true;
    // Still to come off the runway: in the way if it'll join the taxiway somewhere along the plane's way out —
    // unless it'll be up its link and away west before the plane's even backed off its stand (then the plane
    // just follows it along).
    if (arrival.phase === 'taxiIn' || arrival.exitX >= east || arrival.exitX <= links.entry) return false;
    const f = this.rules.flight;
    const eta = arrival.phase === 'approach' ? (1 - arrival.approach) * f.approachSeconds + 4.5 : Math.max(0, arrival.exitX - arrival.x) / 10 + 1.5;
    const off = 6 + Math.max(0, plane.spot.x + 6 - arrival.exitX) / f.taxiSpeed;
    return eta + 3 > off;
  }

  update(dt: number): void {
    // New arrivals: one at a time down the approach, never while a plane's on the runway or waiting to take it
    // (the next arrival waits for it), and only to a stand whose way in is clear (everything on its way out is
    // west of it, taxiing away, or will be past its link in time). The gates first (their passengers are
    // waiting), whichever's waited longest; a stand's plane (called for, or a freighter) when no gate's is ready.
    let pick: string | null = null;
    let longest = -Infinity;
    for (const gate of this.open) {
      if ((this.manual.has(gate) && !this.called.has(gate)) || this.paused || this.at(gate)) continue;
      const left = (this.gap.get(gate) ?? 0) - dt;
      this.gap.set(gate, left);
      const waited = -left + (this.layout.gates[gate] ? 1e6 : 0);
      if (left <= 0 && waited > longest && this.wayInClear(gate)) {
        pick = gate;
        longest = waited;
      }
    }
    // (With the second runway taking the departures, the next may start down the approach as soon as the one
    // before is well into its rollout: it'll be off the runway before the next touches down.)
    const landing = this.runway2
      ? !this.has('approach') && this.flights.every((f) => f.phase !== 'rollout' || f.travelled > this.rules.runway2.rolloutGap)
      : !this.has('approach', 'rollout', 'hold', 'lineup', 'takeoff');
    if (pick && landing) {
      this.send(pick);
      this.called.delete(pick);
      this.gap.set(pick, this.rules.flight.gapSeconds);
    }
    // Whichever cleared plane can go first goes, the longest-waiting first; but one that's waited a good while
    // goes before anyone else (nobody's kept on a stand while planes elsewhere come and go).
    // (Again the gates' planes first: a stand's waits its yield longer before it's at the head of the queue.)
    const waited = (f: Flight): number => f.clearedFor - (this.layout.gates[f.gate] ? 0 : this.rules.flight.standYield);
    const cleared = this.flights.filter((f) => f.phase === 'parked' && f.cleared).sort((a, b) => waited(b) - waited(a));
    const head = cleared[0];
    const queue = head && waited(head) > this.rules.flight.priorityWait ? [head] : cleared;
    const first = queue.find((f) => this.mayPush(f)) ?? null;
    for (const flight of [...this.flights]) {
      const may = { push: false, lineUp: false, stopAt: -Infinity };
      if (flight.phase === 'parked' && flight === first) may.push = true;
      else if (flight.phase === 'taxiOut') may.stopAt = this.stopAt(flight);
      else if (flight.phase === 'hold') {
        // (Round to the second runway, one at a time; else onto the first once nothing's landing or taking off.)
        may.lineUp = this.runway2
          ? !this.flights.some((f) => f !== flight && f.phase === 'lineup')
          : !this.flights.some((f) => f !== flight && (f.phase === 'approach' || f.phase === 'rollout' || f.phase === 'lineup' || f.phase === 'takeoff'));
      }
      const event = flight.update(dt, { ...may, runway2: this.runway2 && !!this.layout.runway2 });
      if (event === 'touchdown') this.events.onTouchdown?.(flight);
      else if (event === 'parked') this.events.onParked?.(flight);
      else if (event === 'pushback') {
        this.gap.set(flight.gate, this.rules.flight.gapSeconds);
        this.events.onPushback?.(flight);
      } else if (event === 'airborne') this.events.onAirborne?.(flight);
      else if (event === 'gone') {
        this.flights.splice(this.flights.indexOf(flight), 1);
        this.events.onGone?.(flight);
      }
    }
  }
}

/**
 * Where the hero (or the ramp dispatcher) stands to open a gate for boarding: beside its podium on the door's
 * side, clear of the podium, the wall and the lounge's first row of seats (behind the podium there's no room
 * for the hero once the seats are in).
 */
export function podiumFront(spot: GateSpot): Point {
  return { x: spot.podium.x - 1.2, z: spot.podium.z + 0.05 };
}

/** The ramp pad's ring: how wide it is `readyFor` seconds after the plane was ready, and whether it's on the pad's edge. */
export function ringAt(readyFor: number, rules: Rules['ring']): { radius: number; onTarget: boolean } {
  const phase = (readyFor % rules.period) / rules.period;
  const radius = rules.outer + (rules.inner - rules.outer) * phase;
  // On target for the last moments of each closing (and a blink after, for a thumb that's a touch late).
  return { radius, onTarget: (1 - phase) * rules.period <= rules.window * 2 || phase * rules.period <= 0.07 };
}

/** What a departing flight pays: every seat's fare, more when it's full, on time and on a streak, and with its meals aboard. */
export function flightPay(
  flight: Pick<Flight, 'boarded' | 'full' | 'late' | 'marshalled'> & { meals?: number; needsMeals?: number },
  fare: number,
  streak: number,
  rules: Rules,
): { pay: number; onTime: boolean } {
  const f = rules.flight;
  const onTime = !flight.late;
  const fed = (flight.needsMeals ?? 0) > 0 && (flight.meals ?? 0) >= (flight.needsMeals ?? 0);
  const bonus =
    (flight.full ? f.fullBonus : 0) +
    (onTime ? f.onTimeBonus + Math.min(streak, f.streakMax) * f.streakStep : 0) +
    (flight.marshalled ? rules.marshal.bonus : 0) +
    (fed ? rules.meals.bonus : 0);
  return { pay: Math.round(flight.boarded * fare * (1 + bonus)), onTime };
}
