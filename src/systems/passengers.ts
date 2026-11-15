// An airport's passengers (Chapter 4): set down by taxi, they line up at the check-in desk, are checked
// in (by the hero behind the desk, later the check-in agent) and given a gate, wait in its lounge, and
// once its gate's open walk out across the apron and up the stairs into the plane. Someone who waits too
// long in line gives up and goes home. Where each one is and what they're doing; the game draws them
// (an avatar each, if it has one to give) and pays.
import type { AirportLayout, Point, Rect, Tuning } from '../core/config';
import type { Airfield, Flight } from './airport';

type Rules = Tuning['airport'];

/** What draws a passenger: somewhere to stand, a way to face, sitting or not, and a tick. */
export interface PaxAvatar {
  root: { position: { x: number; y: number; z: number; set(x: number, y: number, z: number): unknown }; rotation: { y: number }; visible: boolean };
  seated: boolean;
  update(dt: number): void;
}

export type PaxState = 'queue' | 'toLounge' | 'lounge' | 'boarding' | 'leaving';

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

  constructor(
    private readonly layout: AirportLayout,
    private readonly rules: Rules,
    private readonly airfield: Airfield,
    /** Gates that are built. */
    private readonly gates: () => string[],
    private readonly makeAvatar: () => PaxAvatar | null,
    private readonly events: PassengerEvents,
  ) {}

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
    const seats = this.rules.planes.prop.seats;
    // A plane that's cleared is as good as gone: its passengers aren't in the next one's way.
    const aboard = flight && !flight.cleared ? flight.boarded : 0;
    return seats - aboard - this.bound(gate).length;
  }

  /** Whether anyone can be checked in at all (a gate with a seat left). */
  get roomAnywhere(): boolean {
    return this.gates().some((g) => this.room(g) > 0);
  }

  /** How many are waiting (or on their way to wait) for a gate. */
  waitingFor(gate: string): number {
    return this.bound(gate).filter((p) => p.state === 'lounge' || p.state === 'toLounge').length;
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
    } else p.path = [{ x: spot.x, z: Math.max(spot.z, this.layout.entrance.z + 4.6) }, spot];
    this.place(p);
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
      const score = (flight && !flight.cleared ? 100 : 0) + (flight?.boarding ? 100 : 0) - (this.rules.planes.prop.seats - room);
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

  private toLounge(p: Passenger, fromDesk: boolean): void {
    const spot = this.spotAt(p.gate!, p.spot);
    p.state = 'toLounge';
    if (p.avatar) p.avatar.seated = false;
    p.path = [...(fromDesk ? this.layout.desk.leave : []), { x: spot.x, z: Math.max(spot.z, this.layout.gates[p.gate!]!.lounge.maxZ + 0.6) }, spot];
  }

  /**
   * One step. `service` is how hard the desk is worked (0: nobody behind it), and by whom; `speed`
   * how much faster everything goes (the boost).
   */
  update(dt: number, service: { rate: number; byPlayer: boolean }, speed = 1): void {
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
        this.toLounge(front, true);
        this.events.onCheckedIn(front);
      }
    } else if (!front || front.moving) this.progress = 0;

    // Boarding: a gate that's open sends its lounge out to the plane, one after another.
    for (const gate of this.gates()) {
      const flight = this.airfield.parkedAt(gate);
      const timer = (this.boardTimers.get(gate) ?? 0) - dt * speed;
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
      next.path = [
        { x: spot.door.x, z: spot.door.z + 0.9 },
        { x: spot.door.x, z: spot.door.z - 0.9 },
        { x: spot.stairsFoot.x + 0.4, z: spot.door.z - 3.2 },
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
            p.path = [{ x: this.layout.entrance.x + 1.8, z: this.layout.entrance.z + 1 }, { x: this.layout.entrance.x + 3, z: this.layout.roadZ - 3.6 }];
            this.events.onGaveUp(p);
          }
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
    p.gone = true;
    if (p.avatar) p.avatar.root.visible = false;
    const i = this.all.indexOf(p);
    if (i >= 0) this.all.splice(i, 1);
  }
}
