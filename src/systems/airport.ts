// An airport's flights (Chapter 4, Skyport International): each plane comes in to land, rolls out, taxis
// to its gate and parks; it's turned round there against its departure clock (passengers board, and once
// they're bought, fuel and cases go on); cleared, it pushes back, taxis out, lines up and takes off.
// One runway is shared by landings and take-offs, and one taxiway by planes coming and going: nothing
// moves onto either while it's taken. Pure logic: where each plane is and what it's doing. The game
// draws them, walks the passengers and pays.
import type { AirportLayout, GateSpot, Point, Tuning } from '../core/config';

export type Phase = 'approach' | 'rollout' | 'taxiIn' | 'parked' | 'pushback' | 'taxiOut' | 'hold' | 'lineup' | 'takeoff' | 'climb';

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
  readonly seats: number;
  /** Passengers aboard, and on their way across the apron. */
  boarded = 0;
  walking = 0;
  /** Still in the lounge for it (the game keeps this up to date). */
  waiting = 0;
  /** The gate's been opened: passengers go out to the plane as they're ready. */
  boarding = false;
  /** Fuel aboard (0–1), and cases in the hold. */
  fuel = 0;
  cases = 0;
  /** What it needs before it can go (the game sets these from what's built). */
  needsFuel = false;
  needsCases = 0;
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
  /** Along its way on the ground, and how far through its approach it is (0–1). */
  private route: Route | null = null;
  private along = 0;
  approach = 0;

  constructor(
    readonly id: number,
    readonly gate: string,
    readonly spot: GateSpot,
    readonly livery: number,
    private readonly layout: AirportLayout,
    private readonly rules: Rules,
    clock: number,
  ) {
    this.seats = rules.planes.prop.seats;
    this.clock = clock;
    this.clockMax = clock;
  }

  /** Everything it needs is done and everyone who's coming is aboard: it can be cleared. */
  get ready(): boolean {
    if (this.phase !== 'parked' || this.cleared || !this.boarding || this.boarded === 0 || this.walking > 0) return false;
    if (this.needsFuel && this.fuel < 1) return false;
    if (this.cases < this.needsCases) return false;
    return this.boarded >= this.seats || this.waiting === 0;
  }

  get full(): boolean {
    return this.boarded >= this.seats;
  }

  /** Where it touches down, and where it stops at its gate (its middle). */
  private get touchdown(): number {
    return this.layout.runway.minX + 14;
  }
  get standZ(): number {
    return this.spot.noseZ - this.rules.planes.prop.length / 2;
  }

  /** The way in from the runway to the stand. */
  private wayIn(): Route {
    const { runway, taxiway, links } = this.layout;
    return new Route(
      rounded(
        [
          { x: this.touchdown, z: runway.z },
          { x: links.exit, z: runway.z },
          { x: links.exit, z: taxiway.z },
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

  /** Where it waits for the runway: on the taxiway, short of the link. */
  private get holdX(): number {
    return this.layout.links.entry + 7;
  }

  private wayOut(): Route {
    return new Route([{ x: this.spot.x + 6, z: this.layout.taxiway.z }, { x: this.holdX, z: this.layout.taxiway.z }]);
  }

  private wayOn(): Route {
    const { runway, taxiway, links } = this.layout;
    return new Route(rounded([{ x: this.holdX, z: taxiway.z }, { x: links.entry, z: taxiway.z }, { x: links.entry, z: runway.z }, { x: links.entry + 9, z: runway.z }], 4.5));
  }

  /** Starts it part-way down its approach (the very first plane is nearly down as the hero arrives). */
  startAt(approach: number): void {
    this.approach = approach;
    this.fly();
  }

  private fly(): void {
    const { runway } = this.layout;
    const from = runway.minX - 96;
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
   * One step. `runwayFree` and `taxiwayFree` say whether it may take them now (asked only when it's
   * waiting to). Returns what just happened, if anything.
   */
  update(dt: number, may: { push: boolean; lineUp: boolean }): 'touchdown' | 'parked' | 'pushback' | 'airborne' | 'gone' | null {
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
        // Cleared: engines start, and it's off as soon as nothing's in its way.
        this.engines = Math.min(0.35, this.engines + dt * 0.25 + 0.05);
        if (!may.push) return null;
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
        this.route = this.wayOut();
        this.along = 0;
        return null;
      }
      case 'taxiOut': {
        this.engines += (0.4 - this.engines) * (1 - Math.exp(-dt * 2));
        const left = this.route!.total - this.along;
        if (this.follow(dt, f.taxiSpeed * Math.min(1, 0.2 + left / 6, 0.25 + this.along / 4))) this.phase = 'hold';
        return null;
      }
      case 'hold': {
        this.speed = 0;
        if (!may.lineUp) return null;
        this.phase = 'lineup';
        this.route = this.wayOn();
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
  private nextId = 1;
  private lastLivery = -1;
  /** Flights that have come so far (the first has a longer clock). */
  arrivals = 0;

  constructor(
    private readonly layout: AirportLayout,
    private readonly rules: Rules,
    private readonly liveries: number,
    private readonly events: AirfieldEvents = {},
    private readonly random: () => number = Math.random,
  ) {}

  openGate(gate: string, wait = 0): void {
    if (this.open.has(gate) || !this.layout.gates[gate]) return;
    this.open.add(gate);
    this.gap.set(gate, wait);
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
    const spot = this.layout.gates[gate];
    if (!spot || this.at(gate)) return null;
    let livery = Math.floor(this.random() * this.liveries);
    if (livery === this.lastLivery) livery = (livery + 1) % this.liveries;
    this.lastLivery = livery;
    const first = this.arrivals === 0;
    const flight = new Flight(this.nextId++, gate, spot, livery, this.layout, this.rules, first ? this.rules.flight.firstClock : this.rules.planes.prop.clock);
    flight.startAt(approach);
    this.arrivals += 1;
    this.flights.push(flight);
    return flight;
  }

  update(dt: number): void {
    // New arrivals: one at a time down the approach, never while a plane's on the runway to take off or
    // backing onto the taxiway (it would meet the arrival head on).
    for (const gate of this.open) {
      if (this.at(gate)) continue;
      const left = (this.gap.get(gate) ?? 0) - dt;
      this.gap.set(gate, left);
      if (left > 0 || this.has('approach', 'rollout', 'hold', 'lineup', 'takeoff', 'pushback')) continue;
      this.send(gate);
      this.gap.set(gate, this.rules.flight.gapSeconds);
    }
    for (const flight of [...this.flights]) {
      // An arrival only gets in the way of a plane backing off a stand it will pass on the taxiway (arrivals come
      // from the east and turn in at their own stand, so one bound for a stand further east never gets that far).
      const arriving = this.flights.some(
        (f) => f !== flight && (f.phase === 'rollout' || f.phase === 'taxiIn' || (f.phase === 'approach' && f.approach > 0.25)) && f.spot.x <= flight.spot.x + 3,
      );
      // (One at a time out to the runway: the next waits on its stand until the one ahead has lined up and gone.)
      const backing = this.flights.some((f) => f !== flight && (f.phase === 'pushback' || f.phase === 'taxiOut' || f.phase === 'hold' || f.phase === 'lineup'));
      const onRunway = this.flights.some((f) => f !== flight && (f.phase === 'approach' || f.phase === 'rollout' || f.phase === 'lineup' || f.phase === 'takeoff'));
      const event = flight.update(dt, { push: !arriving && !backing, lineUp: !onRunway });
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

/** What a departing flight pays: every seat's fare, more when it's full, on time and on a streak. */
export function flightPay(flight: Pick<Flight, 'boarded' | 'full' | 'late' | 'marshalled'>, fare: number, streak: number, rules: Rules): { pay: number; onTime: boolean } {
  const f = rules.flight;
  const onTime = !flight.late;
  const bonus = (flight.full ? f.fullBonus : 0) + (onTime ? f.onTimeBonus + Math.min(streak, f.streakMax) * f.streakStep : 0) + (flight.marshalled ? rules.marshal.bonus : 0);
  return { pay: Math.round(flight.boarded * fare * (1 + bonus)), onTime };
}
