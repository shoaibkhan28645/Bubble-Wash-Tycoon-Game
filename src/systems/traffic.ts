import { Vector3 } from 'three';
import { CARS, PADS, TUNING, UPGRADES, type CarDef, type LocationLayout, type Point, type Rect } from '../core/config';
import type { GameState } from '../core/gameState';
import type { Particles } from '../render/effects/particles';
import type { SoundManager } from '../audio/sound';
import type { WorldLabels } from '../ui/worldLabels';
import { CarMoods, type Floaters } from '../ui/carBubbles';
import { Car, CarPool } from './cars';
import type { CashSystem } from './cash';
import { builtStages, carPay, levelFactor, nextStars, queueSpots, spawnSeconds, tipFor, washSeconds, type Outcome } from './economy';
import { Station, type StationKind } from './stations';

const BUBBLE_SECONDS = 0.07;
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
 * Every car's journey: arrive from the road, wait in a bay's line, get washed,
 * visit the dryer and waxing station if built, pay at checkout and leave.
 * Patience drains while waiting; tips and stars follow from it.
 */
export class Traffic {
  readonly bays: Station[] = [];
  /** Dryer and waxing station, in the order cars visit them. */
  readonly finishing: Station[] = [];
  private readonly moving = new Set<Car>();
  private readonly moods: CarMoods;
  private spawnTimer: number;
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
    // The first car rolls in straight away.
    this.spawnTimer = Number.POSITIVE_INFINITY;
  }

  /** Adds the station a built pad provides (a bay, the dryer or the waxing station). */
  addStation(padId: string): void {
    const pad = PADS.find((p) => p.id === padId);
    const kind: StationKind | undefined = pad?.effects.bay ? 'bay' : (pad?.effects.station as StationKind | undefined);
    const at = this.layout.pads[padId];
    if (!kind || !at || this.all().some((s) => s.id === padId)) return;
    const size = kind === 'bay' ? this.layout.bay : this.layout.station;
    const padding = kind === 'bay' ? TUNING.wash.zonePadding : TUNING.stations.zonePadding;
    const station = new Station(padId, kind, at, size, padding, this.labels);
    if (kind === 'bay') this.bays.push(station);
    else {
      this.finishing.push(station);
      this.finishing.sort((a, b) => a.at.z - b.at.z);
    }
  }

  all(): Station[] {
    return [...this.bays, ...this.finishing];
  }

  /** Parked cars block the player. */
  obstacles(): Rect[] {
    return this.all().flatMap((s) => (s.car && s.car.state !== 'entering' ? [s.car.footprint] : []));
  }

  update(dt: number, work: (station: Station) => Work, supplies: SupplyCheck): boolean {
    this.spawn(dt);
    let playerWorking = false;
    for (const bay of this.bays) {
      this.advanceQueue(bay);
      for (const car of [...bay.queue]) {
        car.update(dt, TUNING.cars.speed);
        if (car.state === 'arriving' && car.arrived) car.state = 'queued';
        if (car.state === 'queued') this.drainPatience(car, dt);
      }
    }
    for (const station of this.all()) {
      if (this.serve(dt, station, work(station), supplies)) playerWorking = true;
    }
    for (const car of [...this.moving]) this.updateMoving(dt, car);
    this.updateBubbles();
    return playerWorking;
  }

  /** The car in a station: drive in, get served, then move on. Returns true if the player worked it. */
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
        car.progress = Math.min(1, car.progress + (dt * work.rate) / this.jobSeconds(station, car, byPlayer));
        if (station.kind === 'bay') {
          car.clean = car.progress;
          car.model.setClean(car.def.dirt, car.clean);
        }
        this.bubbleTimer -= dt;
        if (this.bubbleTimer <= 0) {
          const p = car.position;
          this.effects.burst('bubble', new Vector3(p.x, 0.9 + Math.random() * 0.6, p.z), 2, 1.6, car.def.size[0]);
          this.bubbleTimer = BUBBLE_SECONDS;
        }
        if (car.progress >= 1) this.finishJob(station, car);
      } else {
        this.drainPatience(car, dt);
      }
    }
    station.showProgress(car.state === 'waiting' || car.state === 'entering', car.progress, stalled);
    if (car.state === 'done') this.moveOn(dt, station, car);
    return byPlayer;
  }

  private jobSeconds(station: Station, car: Car, byPlayer: boolean): number {
    const speed = levelFactor(UPGRADES.kinds.speed, this.level(`${station.id}.speed`));
    if (station.kind !== 'bay') return TUNING.stations[station.kind].seconds * speed;
    const scrub = byPlayer ? levelFactor(UPGRADES.kinds.scrub, this.level('player.scrub')) : 1;
    return washSeconds(car.def.dirt, builtStages(this.state.unlocked, 'bay'), TUNING.wash) * speed * scrub;
  }

  private finishJob(station: Station, car: Car): void {
    car.state = 'done';
    car.timer = 0;
    car.stages.push(...builtStages(this.state.unlocked, station.kind));
    car.quality *= levelFactor(UPGRADES.kinds.quality, this.level(`${station.id}.quality`));
    const p = car.position;
    this.effects.burst('sparkle', new Vector3(p.x, 1.4, p.z), station.kind === 'wax' ? 26 : 16, 5, car.def.size[0]);
    this.sound.play('done');
  }

  /** After a short pause, go to the next free station, or pay and leave. */
  private moveOn(dt: number, station: Station, car: Car): void {
    car.timer += dt;
    if (car.timer < TUNING.cars.leaveDelay) return;
    const index = this.finishing.indexOf(station);
    const next = this.finishing[index + 1];
    const fromBay = station.kind === 'bay';
    const toLane = fromBay
      ? [
          { x: station.at.x, z: this.layout.collectZ },
          { x: this.layout.finishX, z: this.layout.collectZ },
        ]
      : [];
    if (next) {
      if (next.car) return; // Wait here until the next station is free.
      station.car = null;
      next.car = car;
      car.station = next;
      car.state = 'entering';
      car.progress = 0;
      car.supplied = false;
      car.follow([...toLane, next.at]);
      return;
    }
    station.car = null;
    this.checkout(car, station);
    this.moods.hide(car);
    car.state = 'leaving';
    car.follow([
      ...toLane,
      { x: this.layout.finishX, z: this.layout.exitZ },
      { x: this.layout.exitX, z: this.layout.exitZ },
    ]);
    this.moving.add(car);
  }

  /** Pays for every stage the car got, plus a tip if it didn't wait long. */
  private checkout(car: Car, last: Station): void {
    const pay = carPay(car.def, car.stages, car.quality);
    const tip = tipFor(pay, car.patience / car.patienceMax, TUNING.customers);
    const register = this.state.unlocked.includes('register');
    const pileId = register ? 'register' : last.id;
    this.cash.add(pileId, pay + tip);
    const at = this.layout.piles[pileId] ?? last.at;
    this.floaters.show(`+$${pay}`, new Vector3(at.x, 1.2, at.z));
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
    const bay = this.bays.find((b) => b.queue.includes(car));
    if (bay) {
      bay.queue.splice(bay.queue.indexOf(car), 1);
      bay.queue.forEach((c, i) => c.driveTo(this.slot(bay, i)));
    }
    if (car.station?.car === car) car.station.car = null;
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

  /** Front car moves into an empty bay; the rest shuffle forward. */
  private advanceQueue(bay: Station): void {
    if (bay.car || bay.queue.length === 0) return;
    const next = bay.queue.shift()!;
    next.state = 'entering';
    next.station = bay;
    next.driveTo(bay.at);
    bay.car = next;
    bay.queue.forEach((car, i) => car.driveTo(this.slot(bay, i)));
  }

  private spawn(dt: number): void {
    const signBonus = PADS.filter((p) => this.state.unlocked.includes(p.id)).reduce((sum, p) => sum + (p.effects.arrivalBonus ?? 0), 0);
    const interval = spawnSeconds(TUNING.cars.spawnSeconds, this.state.stars, TUNING.stars.arrivalPerStar, signBonus);
    this.spawnTimer = Math.min(interval, this.spawnTimer + dt);
    if (this.spawnTimer < interval) return;
    const load = (bay: Station) => bay.queue.length + (bay.car ? 1 : 0);
    const open = this.bays.filter((bay) => load(bay) < 1 + this.queueLength(bay));
    if (open.length === 0) return;
    const bay = open.reduce((a, b) => (load(b) < load(a) ? b : a));
    const types = this.availableCars();
    const def = types[Math.floor(Math.random() * types.length)];
    if (!def) return;
    const car = this.pool.acquire();
    car.spawn(def, { x: this.layout.spawnX, z: this.layout.roadZ }, { x: bay.at.x, z: this.layout.roadZ }, this.slot(bay, bay.queue.length));
    const bench = PADS.filter((p) => this.state.unlocked.includes(p.id)).reduce((sum, p) => sum + (p.effects.patienceBonus ?? 0), 0);
    car.patienceMax = def.patience * (1 + bench);
    car.patience = car.patienceMax;
    bay.queue.push(car);
    this.spawnTimer = 0;
  }

  private queueLength(bay: Station): number {
    return queueSpots(TUNING.cars.queueSpots, UPGRADES.kinds.queue, this.level(`${bay.id}.queue`));
  }

  private slot(bay: Station, index: number): Point {
    return { x: bay.at.x, z: bay.at.z - this.layout.queueGap * (index + 1) };
  }

  private availableCars(): CarDef[] {
    return CARS.filter((car) => car.unlockedBy !== null && this.state.unlocked.includes(car.unlockedBy));
  }

  private level(key: string): number {
    return this.state.levels[key] ?? 0;
  }

  /** Mood bubbles over every car that is waiting. */
  private updateBubbles(): void {
    const waiting: { car: Car; beside: boolean }[] = [];
    for (const bay of this.bays) for (const car of bay.queue) if (car.state === 'queued') waiting.push({ car, beside: false });
    for (const station of this.all()) {
      if (station.car?.state === 'waiting') waiting.push({ car: station.car, beside: true });
    }
    this.moods.update(waiting);
  }
}
