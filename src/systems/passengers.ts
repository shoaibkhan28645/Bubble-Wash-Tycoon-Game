// An airport's passengers (Chapter 4): set down by taxi, they line up at the check-in desk, are checked
// in (by the hero behind the desk, later the check-in agent) and given a gate, wait in its lounge, and
// once its gate's open walk out across the apron and up the stairs into the plane (or along the jet
// bridge into a jet). Someone who waits too long in line gives up and goes home. Once the terminal has
// them, some stop at the café on the way, everyone for the wing's gate goes through the security lane,
// and some of those shop at duty-free. Where each one is and what they're doing; the game draws them
// (an avatar each, if it has one to give) and pays.
import type { AirportLayout, Point, Rect, Tuning } from '../core/config';
import { planeAt, type Airfield, type Flight } from './airport';

type Rules = Tuning['airport'];

/** How far in front of a seat someone stands to sit down or get up (metres). */
const SEAT_STEP = 0.62;

/** What draws a passenger: somewhere to stand, a way to face, sitting or not, and a tick. */
export interface PaxAvatar {
  root: { position: { x: number; y: number; z: number; set(x: number, y: number, z: number): unknown }; rotation: { y: number }; visible: boolean };
  seated: boolean;
  update(dt: number): void;
}

export type PaxState = 'queue' | 'toCounter' | 'counter' | 'toLounge' | 'lounge' | 'boarding' | 'leaving';

/** The terminal's counters a passenger may stop at on the way to the gate. */
export type CounterId = 'cafe' | 'security' | 'dutyfree';
/** A shop: the café or duty-free (security isn't one: it's on the way, not a choice). */
export type ShopId = 'cafe' | 'dutyfree';

/** A counter's line: its spots (the window first), who's in it, and how far the one at the window has got. */
interface Counter {
  spots: Point[];
  line: Passenger[];
  progress: number;
}

/** How long someone stands at a shop with nobody serving before giving up on it (seconds). */
const SHOP_PATIENCE = 18;

interface Step {
  x: number;
  z: number;
  y?: number;
}

export class Passenger {
  state: PaxState = 'queue';
  x: number;
  z: number;
  y = 0;
  /** Where they're walking, next first. */
  path: Step[] = [];
  patience: number;
  /** Their gate, once checked in, and their place in its lounge. */
  gate: string | null = null;
  spot = -1;
  /** The flight they're walking out to. */
  flight: Flight | null = null;
  /** Where they'll stop on the way to their gate, next first; the counter they're at (or walking to). */
  plan: CounterId[] = [];
  at: CounterId | null = null;
  /** Seconds stood at a shop with nobody serving. */
  shopWait = 0;
  /** Checked in by the hero (not the agent). */
  manual = false;
  /** Done with: boarded, or gone home. */
  gone = false;

  constructor(
    at: Point,
    readonly patienceMax: number,
    readonly avatar: PaxAvatar | null,
  ) {
    this.x = at.x;
    this.z = at.z;
    this.patience = patienceMax;
  }

  get moving(): boolean {
    return this.path.length > 0;
  }

  /** Walks on along their way; true the moment they get to its end. */
  walk(dt: number, speed: number): boolean {
    let left = speed * dt;
    while (left > 0 && this.path.length > 0) {
      const next = this.path[0]!;
      const dx = next.x - this.x;
      const dz = next.z - this.z;
      const d = Math.hypot(dx, dz);
      if (this.avatar && d > 0.01) this.avatar.root.rotation.y = Math.atan2(dx, dz);
      if (d <= left) {
        this.x = next.x;
        this.z = next.z;
        if (next.y !== undefined) this.y = next.y;
        left -= d;
        this.path.shift();
        if (this.path.length === 0) return true;
      } else {
        const k = left / d;
        this.x += dx * k;
        this.z += dz * k;
        if (next.y !== undefined) this.y += (next.y - this.y) * k;
        left = 0;
      }
    }
    return false;
  }
}

export interface PassengerEvents {
  /** Checked in: their ticket's paid for. `manual` if the hero did it. */
  onCheckedIn(passenger: Passenger): void;
  /** Served at a shop (the café or duty-free), or through security; `manual` if the hero served them. */
  onServed?(passenger: Passenger, counter: CounterId, manual: boolean): void;
  onGaveUp(passenger: Passenger): void;
  onBoarded(passenger: Passenger, flight: Flight): void;
}

/** A standing place in a lounge with no seats yet: a grid, front row first. */
function standAt(lounge: Rect, i: number): Point {
  const cols = 6;
  const col = i % cols;
  const row = Math.floor(i / cols);
  return { x: lounge.minX + 0.9 + (col * (lounge.maxX - lounge.minX - 1.8)) / (cols - 1), z: lounge.minZ + 0.9 + row * 1.25 };
}

export class Passengers {
  readonly all: Passenger[] = [];
  /** The line at the desk, front first. */
  readonly line: Passenger[] = [];
  /** How far the passenger at the window is through checking in (0–1). */
  progress = 0;
  /** Seats in the lounges (bought): people sit; before that they stand. */
  seats: ((lounge: Rect, i: number) => Point) | null = null;
  private readonly boardTimers = new Map<string, number>();
  /** The terminal's counters, and which shops are open (the game sets these as they're bought). */
  readonly counters: Record<CounterId, Counter>;
  readonly open: Record<ShopId, boolean> = { cafe: false, dutyfree: false };
  /** Whether a gate's passengers go through security first (the wing's gate, once it's built). */
  screened: (gate: string) => boolean = () => false;
  /** A number in [0, 1) (whether someone fancies a shop). */
  random: () => number = Math.random;
  /** How much quicker a gate boards (its speed upgrade). */
  gateSpeed: (gate: string) => number = () => 1;

  constructor(
    private readonly layout: AirportLayout,
    private readonly rules: Rules,
    private readonly airfield: Airfield,
    /** Gates that are built. */
    private readonly gates: () => string[],
    private readonly makeAvatar: () => PaxAvatar | null,
    private readonly events: PassengerEvents,
    /** The way round what's solid, from one place to another (its waypoints, not `from`): straight there by default. */
    private readonly route: (from: Point, to: Point) => Point[] = (_from, to) => [to],
  ) {
    const security = layout.security;
    this.counters = {
      cafe: { spots: layout.cafe?.queue ?? [], line: [], progress: 0 },
      dutyfree: { spots: layout.dutyfree?.queue ?? [], line: [], progress: 0 },
      security: { spots: security ? [security.arch, ...security.queue] : [], line: [], progress: 0 },
    };
  }

  /** How many seats a gate's plane has. */
  seatsAt(gate: string): number {
    const spot = this.layout.gates[gate];
    return this.rules.planes[spot ? planeAt(spot) : 'prop'].seats;
  }

  /** The way from where `p` is to `to`, round what's solid. */
  private way(p: Passenger, to: Point): Step[] {
    return this.route({ x: p.x, z: p.z }, to).map((w) => ({ x: w.x, z: w.z }));
  }

  /** Room for one more in the line. */
  get lineHasRoom(): boolean {
    return this.line.length < this.layout.desk.queue.length;
  }

  /** People checked in for a gate who aren't aboard yet. */
  private bound(gate: string): Passenger[] {
    return this.all.filter((p) => p.gate === gate && !p.gone);
  }

  /** Seats still unsold for a gate's next departure. */
  room(gate: string): number {
    const flight = this.airfield.at(gate);
    const seats = this.seatsAt(gate);
    // A plane that's cleared is as good as gone: its passengers aren't in the next one's way.
    const aboard = flight && !flight.cleared ? flight.boarded : 0;
    return seats - aboard - this.bound(gate).length;
  }

  /** Whether anyone can be checked in at all (a gate with a seat left). */
  get roomAnywhere(): boolean {
    return this.gates().some((g) => this.room(g) > 0);
  }

  /** How many are waiting (or on their way to wait, at a shop or through security) for a gate. */
  waitingFor(gate: string): number {
    return this.bound(gate).filter((p) => p.state === 'lounge' || p.state === 'toLounge' || p.state === 'counter' || p.state === 'toCounter').length;
  }

  /** The line at a counter, front first. */
  lineAt(id: CounterId): readonly Passenger[] {
    return this.counters[id].line;
  }

  /** How far the one at a counter's window is through being served (0–1). */
  progressAt(id: CounterId): number {
    return this.counters[id].progress;
  }

  /** Someone new at `at` (a taxi's door), heading for the end of the line. False if the line's full. */
  spawn(at: Point, patienceBonus: number, inLine = false): boolean {
    if (!this.lineHasRoom) return false;
    const p = new Passenger(at, this.rules.passengers.patience * (1 + patienceBonus), this.makeAvatar());
    this.all.push(p);
    this.line.push(p);
    const spot = this.layout.desk.queue[this.line.length - 1]!;
    if (inLine) {
      p.x = spot.x;
      p.z = spot.z;
    } else p.path = this.way(p, spot);
    this.place(p);
    return true;
  }

  /** Whether someone checked in already (at the shuttle station) can come in now: a seat left somewhere, and room on security's line. */
  get canArrive(): boolean {
    const security = this.counters.security;
    return this.roomAnywhere && (security.spots.length === 0 || security.line.length < security.spots.length);
  }

  /**
   * Someone who checked in at the shuttle station: they skip the desk's line and go straight on through
   * security (and the shops) to their gate, their ticket sold. False if they can't come in yet.
   */
  arrive(at: Point, patienceBonus: number): boolean {
    if (!this.canArrive) return false;
    const p = new Passenger(at, this.rules.passengers.patience * (1 + patienceBonus), this.makeAvatar());
    this.all.push(p);
    p.gate = this.pickGate();
    p.spot = this.loungeSpot(p.gate!);
    p.plan = this.planFor(p.gate!);
    this.place(p);
    this.onward(p, false);
    this.events.onCheckedIn(p);
    return true;
  }

  /** The gate a new passenger gets: one with a plane boarding first (to fill it), then the emptiest lounge. */
  private pickGate(): string | null {
    let best: string | null = null;
    let bestScore = -Infinity;
    for (const gate of this.gates()) {
      const room = this.room(gate);
      if (room <= 0) continue;
      const flight = this.airfield.parkedAt(gate);
      const score = (flight && !flight.cleared ? 100 : 0) + (flight?.boarding ? 100 : 0) - (this.seatsAt(gate) - room);
      if (score > bestScore) {
        bestScore = score;
        best = gate;
      }
    }
    return best;
  }

  private loungeSpot(gate: string): number {
    const taken = new Set(this.bound(gate).map((p) => p.spot));
    let i = 0;
    while (taken.has(i)) i++;
    return i;
  }

  private spotAt(gate: string, i: number): Point {
    const lounge = this.layout.gates[gate]!.lounge;
    return this.seats ? this.seats(lounge, i) : standAt(lounge, i);
  }

  /** Seats have just gone in: everyone waiting finds one. */
  reseat(): void {
    for (const p of this.all) if (p.state === 'lounge' && p.gate) this.toLounge(p, false);
  }

  /** In front of a seat (where they step in from), or the standing spot itself. */
  private approach(spot: Point): Point {
    return this.seats ? { x: spot.x, z: spot.z + SEAT_STEP } : spot;
  }

  /** Where someone just checked in for `gate` stops on the way: maybe the café, security (the wing's gate), maybe duty-free. */
  private planFor(gate: string): CounterId[] {
    const plan: CounterId[] = [];
    const shops = this.rules.shops;
    if (this.open.cafe && this.random() < shops.cafe.share) plan.push('cafe');
    if (this.screened(gate)) {
      plan.push('security');
      if (this.open.dutyfree && this.random() < shops.dutyfree.share) plan.push('dutyfree');
    }
    return plan;
  }

  /**
   * On to the next stop: the next counter on their way that has room (security always takes them; a shop
   * whose line's full is skipped, as is any shop once their gate's boarding), else their lounge.
   */
  private onward(p: Passenger, fromDesk: boolean, lead: Point[] = fromDesk ? [this.layout.desk.leave[0]!] : []): void {
    p.at = null;
    p.shopWait = 0;
    while (p.plan.length > 0) {
      const id = p.plan.shift()!;
      const counter = this.counters[id];
      const boarding = !!this.airfield.parkedAt(p.gate!)?.boarding;
      if (id !== 'security' && (boarding || counter.line.length >= counter.spots.length)) continue;
      if (counter.spots.length === 0) continue;
      p.at = id;
      p.state = 'toCounter';
      counter.line.push(p);
      const spot = counter.spots[Math.min(counter.line.length, counter.spots.length) - 1]!;
      const from = lead.at(-1) ?? { x: p.x, z: p.z };
      p.path = [...lead, ...this.route(from, spot).map((w) => ({ x: w.x, z: w.z }))];
      return;
    }
    this.toLounge(p, fromDesk, lead);
  }

  /** Off a counter's line (served, or given up on it), and the line shuffles up. */
  private leaveCounter(p: Passenger): void {
    if (!p.at) return;
    const line = this.counters[p.at].line;
    const i = line.indexOf(p);
    if (i >= 0) line.splice(i, 1);
    if (i === 0) this.counters[p.at].progress = 0;
  }

  private toLounge(p: Passenger, fromDesk: boolean, via: Point[] = fromDesk ? [this.layout.desk.leave[0]!] : []): void {
    const spot = this.spotAt(p.gate!, p.spot);
    p.state = 'toLounge';
    // Off a seat first, if they were sitting (seats just bought: everyone finds one).
    const start: Step[] = p.avatar?.seated ? [{ x: p.x, z: p.z + SEAT_STEP }] : [];
    if (p.avatar) p.avatar.seated = false;
    const lead: Step[] = start.length > 0 ? start : via;
    const from = lead.at(-1) ?? { x: p.x, z: p.z };
    p.path = [...lead, ...this.route(from, this.approach(spot)).map((w) => ({ x: w.x, z: w.z })), ...(this.seats ? [spot] : [])];
  }

  /**
   * One step. `service` is how hard the desk is worked (0: nobody behind it), and by whom; `speed`
   * how much faster everything goes (the boost).
   */
  update(dt: number, service: { rate: number; byPlayer: boolean }, speed = 1, shopService: (id: ShopId) => { rate: number; byPlayer: boolean } = () => ({ rate: 0, byPlayer: false })): void {
    const walkSpeed = this.rules.passengers.walkSpeed;
    // The line shuffles up.
    this.line.forEach((p, i) => {
      const spot = this.layout.desk.queue[i]!;
      const last = p.path.at(-1);
      if (last ? last.x !== spot.x || last.z !== spot.z : Math.hypot(p.x - spot.x, p.z - spot.z) > 0.05) {
        if (p.path.length > 1) p.path[p.path.length - 1] = spot;
        else p.path = [spot];
      }
    });
    // Check-in: the one at the window, if there's a seat to sell.
    const front = this.line[0];
    const canSell = this.roomAnywhere;
    if (front && !front.moving && service.rate > 0 && canSell) {
      this.progress += (dt * service.rate * speed) / this.rules.checkinSeconds;
      if (this.progress >= 1) {
        this.progress = 0;
        this.line.shift();
        front.gate = this.pickGate();
        front.spot = this.loungeSpot(front.gate!);
        front.manual = service.byPlayer;
        front.plan = this.planFor(front.gate!);
        this.onward(front, true);
        this.events.onCheckedIn(front);
      }
    } else if (!front || front.moving) this.progress = 0;

    // The counters: each line shuffles up; the one at the window is served (security by itself, a shop by
    // whoever's behind its counter); a shop's line gives up on it if nobody comes, or their gate opens.
    for (const id of ['cafe', 'security', 'dutyfree'] as const) {
      const counter = this.counters[id];
      counter.line.forEach((p, i) => {
        const spot = counter.spots[Math.min(i, counter.spots.length - 1)]!;
        const last = p.path.at(-1);
        if (last ? last.x !== spot.x || last.z !== spot.z : Math.hypot(p.x - spot.x, p.z - spot.z) > 0.05) {
          if (p.path.length > 1) p.path[p.path.length - 1] = spot;
          else p.path = [spot];
        }
      });
      const front = counter.line[0];
      const help = id === 'security' ? { rate: 1, byPlayer: false } : shopService(id);
      const seconds = id === 'security' ? this.rules.security.seconds : this.rules.shops[id].seconds;
      if (front && !front.moving && front.state === 'counter' && help.rate > 0) {
        counter.progress += (dt * help.rate * speed) / seconds;
        if (counter.progress >= 1) {
          counter.progress = 0;
          this.leaveCounter(front);
          this.events.onServed?.(front, id, help.byPlayer);
          // (Through the arch and out the far side.)
          this.onward(front, false, id === 'security' && this.layout.security ? [this.layout.security.exit] : []);
        }
      } else if (!front || front.moving) counter.progress = 0;
      if (id === 'security') continue;
      for (const p of [...counter.line]) {
        if (p.state !== 'counter' || p.moving) continue;
        p.shopWait += help.rate > 0 ? 0 : dt;
        if (p.shopWait > SHOP_PATIENCE || this.airfield.parkedAt(p.gate!)?.boarding) {
          this.leaveCounter(p);
          this.onward(p, false);
        }
      }
    }

    // Boarding: a gate that's open sends its lounge out to the plane, one after another.
    for (const gate of this.gates()) {
      const flight = this.airfield.parkedAt(gate);
      const timer = (this.boardTimers.get(gate) ?? 0) - dt * speed * this.gateSpeed(gate);
      this.boardTimers.set(gate, timer);
      if (!flight || !flight.boarding || flight.cleared || timer > 0 || flight.boarded + flight.walking >= flight.seats) continue;
      const next = this.bound(gate)
        .filter((p) => p.state === 'lounge')
        .sort((a, b) => a.spot - b.spot)[0];
      if (!next) continue;
      this.boardTimers.set(gate, this.rules.flight.boardStagger);
      const spot = this.layout.gates[gate]!;
      next.state = 'boarding';
      next.flight = flight;
      flight.walking += 1;
      if (next.avatar) next.avatar.seated = false;
      // Out of their seat, through the gate's door and round to the foot of the stairs, then up them (or up
      // into the jet bridge's rotunda and along it into the jet).
      const off: Step[] = next.avatar?.seated || this.seats ? [{ x: next.x, z: next.z + SEAT_STEP }] : [];
      const from = off[0] ?? { x: next.x, z: next.z };
      if (spot.bridge) {
        const sill = this.rules.planes[planeAt(spot)].sill;
        next.path = [
          ...off,
          ...this.route(from, { x: spot.door.x, z: spot.door.z + 0.9 }).map((w) => ({ x: w.x, z: w.z })),
          { x: spot.door.x, z: spot.door.z - 0.2, y: 0 },
          { x: spot.bridge.x, z: spot.bridge.z, y: sill },
          { x: spot.planeDoor.x + 0.5, z: spot.planeDoor.z, y: sill },
          { x: spot.planeDoor.x - 0.4, z: spot.planeDoor.z, y: sill },
        ];
        continue;
      }
      const foot = { x: spot.stairsFoot.x + 0.45, z: spot.stairsFoot.z };
      next.path = [
        ...off,
        ...this.route(from, { x: spot.door.x, z: spot.door.z + 0.9 }).map((w) => ({ x: w.x, z: w.z })),
        { x: spot.door.x, z: spot.door.z - 0.9 },
        ...this.route({ x: spot.door.x, z: spot.door.z - 0.9 }, foot).map((w) => ({ x: w.x, z: w.z })),
        { x: spot.stairsFoot.x + 0.1, z: spot.stairsFoot.z, y: 0 },
        { x: spot.planeDoor.x + 0.5, z: spot.planeDoor.z, y: this.rules.planes.prop.sill },
        { x: spot.planeDoor.x - 0.4, z: spot.planeDoor.z, y: this.rules.planes.prop.sill },
      ];
    }

    for (const p of [...this.all]) {
      const arrived = p.walk(dt, walkSpeed * (p.state === 'boarding' ? 1.15 : 1) * speed);
      if (p.state === 'queue') {
        // Waiting in line wears their patience while nobody's behind the desk (hardly at all while the line's
        // moving, and not while every seat's sold: that's not the desk's fault).
        if (!p.moving) {
          if (p.avatar) p.avatar.root.rotation.y = Math.PI;
          p.patience -= dt * (!canSell ? 0 : service.rate > 0 ? 0.2 : 1);
          if (p.patience <= 0) {
            this.line.splice(this.line.indexOf(p), 1);
            p.state = 'leaving';
            p.path = this.way(p, { x: this.layout.entrance.x + 3, z: this.layout.roadZ - 3.6 });
            this.events.onGaveUp(p);
          }
        }
      } else if (p.state === 'toCounter' && arrived) {
        p.state = 'counter';
        if (p.avatar && p.at) {
          // Facing the counter: the line runs away from its window.
          const spots = this.counters[p.at].spots;
          const a = spots[0]!;
          const b = spots[1] ?? { x: a.x, z: a.z + 1 };
          p.avatar.root.rotation.y = Math.atan2(a.x - b.x, a.z - b.z);
        }
      } else if (p.state === 'toLounge' && arrived) {
        p.state = 'lounge';
        if (p.avatar) {
          p.avatar.seated = !!this.seats;
          p.avatar.root.rotation.y = this.seats ? 0 : Math.PI;
        }
      } else if (p.state === 'boarding' && arrived) {
        const flight = p.flight!;
        flight.walking = Math.max(0, flight.walking - 1);
        flight.boarded += 1;
        this.remove(p);
        this.events.onBoarded(p, flight);
        continue;
      } else if (p.state === 'leaving' && arrived) {
        this.remove(p);
        continue;
      }
      this.place(p);
      p.avatar?.update(dt);
    }
    for (const gate of this.gates()) {
      const flight = this.airfield.at(gate);
      if (flight) flight.waiting = this.waitingFor(gate);
    }
  }

  private place(p: Passenger): void {
    p.avatar?.root.position.set(p.x, p.y, p.z);
  }

  private remove(p: Passenger): void {
    this.leaveCounter(p);
    p.gone = true;
    if (p.avatar) p.avatar.root.visible = false;
    const i = this.all.indexOf(p);
    if (i >= 0) this.all.splice(i, 1);
  }
}
