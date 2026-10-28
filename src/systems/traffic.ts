import { Vector3 } from 'three';
import { PADS, TUNING, UPGRADES, type LocationLayout, type Point, type Rect } from '../core/config';
import type { GameState } from '../core/gameState';
import type { Particles } from '../render/effects/particles';
import type { SoundManager } from '../audio/sound';
import type { WorldLabels } from '../ui/worldLabels';
import { CarMoods, type Floaters } from '../ui/carBubbles';
import { Car, CarPool } from './cars';
import type { CashSystem } from './cash';
import { builtStages, carPay, jobSeconds, levelFactor, nextStars, tipFor, type Outcome } from './economy';
import { Arrivals, slotOf, type Lane } from './arrivals';
import { nextStop } from './lanes';
import { Station, type StationKind } from './stations';
import { Tunnel } from './tunnel';

const BUBBLE_SECONDS = 0.07;

/** What a car pays at checkout: every stage it got, its quality, and a tip if it didn't wait long. */
export function bill(car: Pick<Car, 'payDef' | 'stages' | 'quality' | 'patience' | 'patienceMax'>): { pay: number; tip: number } {
  const pay = carPay(car.payDef, car.stages, car.quality);
  return { pay, tip: tipFor(pay, car.patience / car.patienceMax, TUNING.customers) };
}
const POOF_SECONDS = 0.6;
const ANGRY_HEIGHT = 3.2;

/** How hard a station is being worked this frame: 1 = the player at normal speed. */
export interface Work {
  rate: number;
  /** True if the player is the one doing it. */
  byPlayer: boolean;
}

/** Supplies a station uses up (soap, towels, wax); the supply system answers. */
export interface SupplyCheck {
  take(station: Station): boolean;
}

export interface Paid {
  amount: number;
  tip: number;
  automated: boolean;
  at: Point;
}

/**
 * Every car's journey: arrive from the road, wait in a lane (a bay or the
 * tunnel), get washed, visit the dryer, waxing station and garage if built,
 * pay at checkout and leave. Patience drains while waiting; tips and stars
 * follow from it. Also the golden VIP, vending snacks and the valet.
 */
export class Traffic {
  readonly bays: Station[] = [];
  tunnel: Tunnel | null = null;
  /** Dryer, waxing station and garage, in the order cars visit them. */
  readonly finishing: Station[] = [];
  readonly arrivals: Arrivals;
  private readonly moving = new Set<Car>();
  private readonly moods: CarMoods;
  private bubbleTimer = 0;

  constructor(
    private readonly pool: CarPool,
    private readonly layout: LocationLayout,
    private readonly state: GameState,
    private readonly cash: CashSystem,
    private readonly effects: Particles,
    private readonly sound: SoundManager,
    private readonly labels: WorldLabels,
    private readonly floaters: Floaters,
    private readonly onPaid: (paid: Paid) => void,
  ) {
    this.moods = new CarMoods(labels);
    this.arrivals = new Arrivals(pool, layout, state, () => this.lanes(), sound);
  }

  /** Where the valet is needed (a car it just moved), if anywhere. */
  get valetCall(): Point | null {
    return this.arrivals.valetCall;
  }

  /** Adds the station a built pad provides: a bay, the tunnel, the dryer, waxing station or garage. */
  addStation(padId: string): void {
    const pad = PADS.find((p) => p.id === padId);
    const kind: StationKind | undefined = pad?.effects.bay ? 'bay' : (pad?.effects.station as StationKind | undefined);
    const at = this.layout.pads[padId];
    if (!kind || !at || this.all().some((s) => s.id === padId)) return;
    if (kind === 'tunnel') {
      this.tunnel = new Tunnel(at, this.layout.tunnel, this.labels);
      return;
    }
    const size = kind === 'bay' ? this.layout.bay : kind === 'garage' ? this.layout.garage : this.layout.station;
    const padding = kind === 'bay' ? TUNING.wash.zonePadding : TUNING.stations.zonePadding;
    const station = new Station(padId, kind, at, size, padding, this.labels);
    if (kind === 'bay') this.bays.push(station);
    else {
      this.finishing.push(station);
      this.finishing.sort((a, b) => a.at.z - b.at.z);
    }
  }

  all(): Station[] {
    return [...this.bays, ...(this.tunnel ? [this.tunnel] : []), ...this.finishing];
  }

  /** Parked cars block the player. */
  obstacles(): Rect[] {
    return [...this.bays, ...this.finishing].flatMap((s) => (s.car && s.car.state !== 'entering' ? [s.car.footprint] : []));
  }

  /** A car is in the tunnel (its brushes spin fast). */
  get tunnelBusy(): boolean {
    return (this.tunnel?.inside.length ?? 0) > 0;
  }

  update(dt: number, work: (station: Station) => Work, supplies: SupplyCheck): boolean {
    this.arrivals.update(dt);
    let playerWorking = false;
    for (const lane of this.lanes()) {
      this.advanceQueue(lane);
      for (const car of [...lane.queue]) this.wait(dt, car);
    }
    for (const station of [...this.bays, ...this.finishing]) {
      if (this.serve(dt, station, work(station), supplies)) playerWorking = true;
    }
    this.tunnel?.run(dt, this.level('tunnel.speed'), supplies, {
      onMoving: (car) => {
        car.model.setClean(car.def.dirt, car.clean);
        this.bubbles(dt, car);
      },
      onFinished: (car) => this.finishJob(this.tunnel!, car),
      onWaiting: (car) => this.drainPatience(car, dt),
      onDone: (car) => this.moveOn(dt, this.tunnel!, car),
    });
    for (const car of [...this.moving]) this.updateMoving(dt, car);
    this.updateBubbles();
    return playerWorking;
  }

  private lanes(): Lane[] {
    return [...this.bays, ...(this.tunnel ? [this.tunnel] : [])];
  }

  /** A car in line: drive up, lose patience, maybe buy a snack from the vending machine. */
  private wait(dt: number, car: Car): void {
    car.update(dt, TUNING.cars.speed);
    if (car.state === 'arriving' && car.arrived) car.state = 'queued';
    if (car.state !== 'queued') return;
    car.waited += dt;
    if (!car.snacked && car.waited >= TUNING.vending.afterSeconds && this.state.unlocked.includes('vending')) {
      car.snacked = true;
      this.cash.add('vending', TUNING.vending.pay);
      const p = car.position;
      this.floaters.show(`+$${TUNING.vending.pay} 🥤`, new Vector3(p.x, 2.2, p.z), 'tip');
      this.onPaid({ amount: TUNING.vending.pay, tip: 0, automated: true, at: p });
    }
    this.drainPatience(car, dt);
  }

  /** The car in a bay or finishing station: drive in, get served, then move on. True if the player worked it. */
  private serve(dt: number, station: Station, work: Work, supplies: SupplyCheck): boolean {
    const car = station.car;
    if (!car) {
      station.showProgress(false, 0, false);
      return false;
    }
    car.update(dt, TUNING.cars.speed);
    if (car.state === 'entering' && car.arrived) car.state = 'waiting';

    let byPlayer = false;
    let stalled = false;
    if (car.state === 'waiting') {
      if (!car.supplied && station.supply) car.supplied = supplies.take(station);
      stalled = !!station.supply && !car.supplied;
      if (work.rate > 0 && !stalled) {
        byPlayer = work.byPlayer;
        if (byPlayer) car.manual = true;
        car.progress = Math.min(1, car.progress + (dt * work.rate) / jobSeconds(station.id, station.kind, car.def.dirt, this.state, byPlayer));
        if (station.kind === 'bay') {
          car.clean = car.progress;
          car.model.setClean(car.def.dirt, car.clean);
        }
        this.bubbles(dt, car);
        if (car.progress >= 1) this.finishJob(station, car);
      } else {
        this.drainPatience(car, dt);
      }
    }
    station.showProgress(car.state === 'waiting', car.progress, stalled);
    if (car.state === 'done') this.moveOn(dt, station, car);
    return byPlayer;
  }

  private bubbles(dt: number, car: Car): void {
    this.bubbleTimer -= dt;
    if (this.bubbleTimer > 0) return;
    const p = car.position;
    this.effects.burst('bubble', new Vector3(p.x, 0.9 + Math.random() * 0.6, p.z), 2, 1.6, car.def.size[0]);
    this.effects.burst('water', new Vector3(p.x, 1.4, p.z), 3, 3.2, car.def.size[0]);
    this.bubbleTimer = BUBBLE_SECONDS;
  }

  private finishJob(station: Station, car: Car): void {
    car.state = 'done';
    car.timer = 0;
    if (station.kind === 'tunnel') {
      // Brushes, pre-soak and blowers: every bay stage plus drying.
      car.stages.push(...builtStages(this.state.unlocked, 'bay'), ...builtStages(this.state.unlocked, 'dryer'));
    } else car.stages.push(...builtStages(this.state.unlocked, station.kind));
    car.quality *= levelFactor(UPGRADES.kinds.quality, this.level(`${station.id}.quality`));
    const p = car.position;
    const big = station.kind === 'wax' || station.kind === 'garage';
    this.effects.burst('sparkle', new Vector3(p.x, 1.4, p.z), big ? 26 : 16, 5, car.def.size[0]);
    this.sound.play('done');
  }

  /**
   * Of the cars done and waiting for `next`, the one that has waited longest.
   * Without this the tunnel, updated last, took every free dryer and the
   * bays' finished cars sat waiting forever.
   */
  private firstInLine(next: Station): Car | undefined {
    const done = [...this.bays, ...this.finishing].flatMap((s) => (s.car?.state === 'done' ? [{ car: s.car, from: s }] : []));
    const front = this.tunnel?.inside[0];
    if (front?.state === 'done') done.push({ car: front, from: this.tunnel! });
    let first: Car | undefined;
    for (const { car, from } of done) {
      if (nextStop(this.finishing, from, car.wantsDetail) === next && (!first || car.timer > first.timer)) first = car;
    }
    return first;
  }

  /** After a short pause, go to the next free station, or pay and leave. */
  private moveOn(dt: number, from: Station, car: Car): void {
    car.timer += dt;
    if (car.timer < TUNING.cars.leaveDelay) return;
    const lane = this.layout.finishX;
    const toLane =
      from.kind === 'bay'
        ? [
            { x: from.at.x, z: this.layout.collectZ },
            { x: lane, z: this.layout.collectZ },
          ]
        : [];
    const next = nextStop(this.finishing, from, car.wantsDetail);
    if (next) {
      // Wait here until the next station is free and it's this car's turn.
      if (next.car || this.firstInLine(next) !== car) return;
      this.leave(from, car);
      next.car = car;
      car.station = next;
      car.state = 'entering';
      car.progress = 0;
      car.supplied = false;
      car.follow([...toLane, next.at]);
      return;
    }
    this.leave(from, car);
    this.checkout(car, from);
    this.moods.hide(car);
    car.state = 'leaving';
    const exitZ = from.kind === 'garage' ? this.layout.exitZ : this.layout.earlyExitZ;
    car.follow([...toLane, { x: lane, z: exitZ }, { x: this.layout.exitX, z: exitZ }]);
    this.moving.add(car);
  }

  private leave(from: Station, car: Car): void {
    if (from instanceof Tunnel) from.inside.splice(from.inside.indexOf(car), 1);
    else from.car = null;
  }

  /** Pays for every stage the car got, plus a tip if it didn't wait long. */
  private checkout(car: Car, last: Station): void {
    const { pay, tip } = bill(car);
    const register = this.state.unlocked.includes('register');
    const pileId = register ? 'register' : last.id;
    this.cash.add(pileId, pay + tip);
    const at = this.layout.piles[pileId] ?? last.at;
    this.floaters.show(`+$${pay}`, new Vector3(at.x, 1.2, at.z), car.vip ? 'tip' : 'cash');
    if (tip > 0) this.floaters.show(`+$${tip} tip`, new Vector3(at.x + 0.6, 1.9, at.z), 'tip');
    this.rate(tip > 0 ? 'happy' : 'okay');
    this.onPaid({ amount: pay + tip, tip, automated: !car.manual, at });
  }

  private rate(outcome: Outcome): void {
    this.state.stars = nextStars(this.state.stars, outcome, TUNING.stars);
  }

  private drainPatience(car: Car, dt: number): void {
    car.patience -= dt;
    if (car.patience > 0) return;
    // Out of patience: honk, storm off in a puff of dust.
    for (const lane of this.lanes()) {
      if (!lane.queue.includes(car)) continue;
      lane.queue.splice(lane.queue.indexOf(car), 1);
      lane.queue.forEach((c, i) => c.driveTo(slotOf(lane, i, this.layout)));
    }
    if (car.station) this.leave(car.station, car);
    car.station = null;
    this.moods.hide(car);
    car.state = 'angry';
    car.timer = 0;
    this.moving.add(car);
    this.sound.play('honk');
    this.rate('angry');
    const p = car.position;
    this.floaters.show('😡', new Vector3(p.x, ANGRY_HEIGHT, p.z), 'star');
  }

  private updateMoving(dt: number, car: Car): void {
    if (car.state === 'angry') {
      car.timer += dt;
      const t = car.timer / POOF_SECONDS;
      car.model.mesh.scale.setScalar(Math.max(0.01, 1 - t * t));
      if (car.timer >= POOF_SECONDS) {
        const p = car.position;
        this.effects.burst('bubble', new Vector3(p.x, 0.6, p.z), 14, 3, 2);
        this.release(car);
      }
      return;
    }
    car.update(dt, TUNING.cars.speed);
    if (car.arrived) this.release(car);
  }

  private release(car: Car): void {
    this.moving.delete(car);
    this.moods.hide(car);
    this.pool.release(car);
  }

  /** Front car moves into an empty bay or onto the tunnel conveyor; the rest shuffle forward. */
  private advanceQueue(lane: Lane): void {
    if (!lane.idle || lane.queue.length === 0) return;
    const next = lane.queue.shift()!;
    next.state = 'entering';
    next.station = lane;
    if (lane instanceof Tunnel) {
      next.driveTo(lane.entry);
      lane.inside.push(next);
    } else {
      next.driveTo(lane.at);
      lane.car = next;
    }
    lane.queue.forEach((car, i) => car.driveTo(slotOf(lane, i, this.layout)));
  }

  private level(key: string): number {
    return this.state.levels[key] ?? 0;
  }

  /** Mood bubbles over every car that is waiting. */
  private updateBubbles(): void {
    const waiting: { car: Car; beside: boolean }[] = [];
    for (const lane of this.lanes()) for (const car of lane.queue) if (car.state === 'queued') waiting.push({ car, beside: false });
    for (const station of [...this.bays, ...this.finishing]) {
      if (station.car?.state === 'waiting') waiting.push({ car: station.car, beside: true });
    }
    for (const car of this.tunnel?.inside ?? []) if (car.state === 'waiting' && !car.supplied) waiting.push({ car, beside: true });
    this.moods.update(waiting);
  }
}
