import { Vector3 } from 'three';
import { CARS, type CarDef, type LocationLayout, type Point, type Rect, type Tuning } from '../core/config';
import type { GameState } from '../core/gameState';
import type { Particles } from '../render/effects/particles';
import type { SoundManager } from '../audio/sound';
import type { WorldLabels, Label } from '../ui/worldLabels';
import { Car, CarPool } from './cars';
import type { CashSystem } from './cash';
import { builtStages, carPay, washSeconds } from './economy';
import type { Player } from './player';

const SCRUB_SOUND_SECONDS = 0.2;
const BUBBLE_SECONDS = 0.07;
const RING_HEIGHT = 3.4;

// Progress ring: track plus a fill whose dash length follows --p (0..100).
const RING_SVG = `<svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="14" class="ring-track"/><circle cx="18" cy="18" r="14" class="ring-fill" pathLength="100"/></svg>`;

interface Bay {
  id: string;
  at: Point;
  zone: Rect;
  car: Car | null;
  queue: Car[];
  ring: HTMLElement;
  label: Label;
}

/** Hand-wash bays: cars queue, drive in, get scrubbed by the player, pay and leave. */
export class BaySystem {
  private readonly bays: Bay[] = [];
  private readonly leaving = new Set<Car>();
  private spawnTimer: number;
  private scrubTimer = 0;
  private bubbleTimer = 0;

  constructor(
    private readonly pool: CarPool,
    private readonly layout: LocationLayout,
    private readonly tuning: Tuning,
    private readonly state: GameState,
    private readonly cash: CashSystem,
    private readonly effects: Particles,
    private readonly sound: SoundManager,
    private readonly labels: WorldLabels,
  ) {
    // The first car rolls in straight away.
    this.spawnTimer = tuning.cars.spawnSeconds;
  }

  addBay(id: string): void {
    const at = this.layout.pads[id];
    if (!at || this.bays.some((bay) => bay.id === id)) return;
    const pad = this.tuning.wash.zonePadding;
    const { width, length } = this.layout.bay;
    const ring = document.createElement('div');
    ring.className = 'wash-ring';
    ring.innerHTML = RING_SVG;
    const label = this.labels.add(ring, new Vector3(at.x, RING_HEIGHT, at.z));
    label.visible = false;
    this.bays.push({
      id,
      at,
      zone: { minX: at.x - width / 2 - pad, maxX: at.x + width / 2 + pad, minZ: at.z - length / 2 - pad, maxZ: at.z + length / 2 + pad },
      car: null,
      queue: [],
      ring,
      label,
    });
  }

  /** Parked cars block the player. */
  obstacles(): Rect[] {
    return this.bays.flatMap((bay) => (bay.car && bay.car.state !== 'entering' ? [bay.car.footprint] : []));
  }

  update(dt: number, player: Player): void {
    this.spawn(dt);
    let scrubbing = false;
    for (const bay of this.bays) {
      this.advanceQueue(bay);
      for (const car of bay.queue) {
        car.update(dt, this.tuning.cars.speed);
        if (car.state === 'arriving' && car.arrived) car.state = 'queued';
      }
      if (this.washBay(dt, bay, player)) scrubbing = true;
    }
    for (const car of this.leaving) {
      car.update(dt, this.tuning.cars.speed);
      if (car.arrived) {
        this.leaving.delete(car);
        this.pool.release(car);
      }
    }
    player.scrubbing = scrubbing;
    if (scrubbing) {
      this.scrubTimer -= dt;
      if (this.scrubTimer <= 0) {
        this.sound.play('scrub');
        this.scrubTimer = SCRUB_SOUND_SECONDS;
      }
    }
  }

  private washBay(dt: number, bay: Bay, player: Player): boolean {
    const car = bay.car;
    bay.label.visible = !!car && (car.state === 'dirty' || car.state === 'entering');
    if (!car) return false;
    car.update(dt, this.tuning.cars.speed);
    if (car.state === 'entering' && car.arrived) car.state = 'dirty';

    let scrubbing = false;
    if (car.state === 'dirty' && inside(player.position, bay.zone)) {
      const stages = builtStages(this.state.unlocked);
      car.clean = Math.min(1, car.clean + dt / washSeconds(car.def.dirt, stages, this.tuning.wash));
      car.model.setClean(car.def.dirt, car.clean);
      scrubbing = true;
      this.bubbleTimer -= dt;
      if (this.bubbleTimer <= 0) {
        const p = car.position;
        this.effects.burst('bubble', new Vector3(p.x, 0.9 + Math.random() * 0.6, p.z), 2, 1.6, car.def.size[0]);
        this.bubbleTimer = BUBBLE_SECONDS;
      }
      if (car.clean >= 1) this.finishWash(bay, car);
    }
    bay.ring.style.setProperty('--p', `${Math.round(car.clean * 100)}`);

    if (car.state === 'washed') {
      car.timer += dt;
      if (car.timer >= this.tuning.cars.leaveDelay) {
        car.state = 'leaving';
        car.follow([
          { x: bay.at.x, z: this.layout.exitZ },
          { x: this.layout.exitX, z: this.layout.exitZ },
        ]);
        this.leaving.add(car);
        bay.car = null;
      }
    }
    return scrubbing;
  }

  private finishWash(bay: Bay, car: Car): void {
    car.state = 'washed';
    car.timer = 0;
    const pay = carPay(car.def, builtStages(this.state.unlocked));
    const pileId = this.state.unlocked.includes('register') ? 'register' : bay.id;
    this.cash.add(pileId, pay);
    const p = car.position;
    this.effects.burst('sparkle', new Vector3(p.x, 1.4, p.z), 18, 5, car.def.size[0]);
    this.sound.play('done');
  }

  /** Front car moves into an empty bay; the rest shuffle forward. */
  private advanceQueue(bay: Bay): void {
    if (bay.car || bay.queue.length === 0) return;
    const next = bay.queue.shift()!;
    next.state = 'entering';
    next.driveTo(bay.at);
    bay.car = next;
    bay.queue.forEach((car, i) => car.driveTo(this.slot(bay, i)));
  }

  private spawn(dt: number): void {
    this.spawnTimer = Math.min(this.tuning.cars.spawnSeconds, this.spawnTimer + dt);
    if (this.spawnTimer < this.tuning.cars.spawnSeconds) return;
    const capacity = 1 + this.tuning.cars.queueSpots;
    const load = (bay: Bay) => bay.queue.length + (bay.car ? 1 : 0);
    const open = this.bays.filter((bay) => load(bay) < capacity);
    if (open.length === 0) return;
    const bay = open.reduce((a, b) => (load(b) < load(a) ? b : a));
    const types = this.availableCars();
    const def = types[Math.floor(Math.random() * types.length)];
    if (!def) return;
    const car = this.pool.acquire();
    car.spawn(def, { x: this.layout.spawnX, z: this.layout.roadZ }, { x: bay.at.x, z: this.layout.roadZ }, this.slot(bay, bay.queue.length));
    bay.queue.push(car);
    this.spawnTimer = 0;
  }

  private slot(bay: Bay, index: number): Point {
    return { x: bay.at.x, z: bay.at.z - this.layout.queueGap * (index + 1) };
  }

  private availableCars(): CarDef[] {
    return CARS.filter((car) => car.unlockedBy !== null && this.state.unlocked.includes(car.unlockedBy));
  }
}

function inside(p: Point, rect: Rect): boolean {
  return p.x >= rect.minX && p.x <= rect.maxX && p.z >= rect.minZ && p.z <= rect.maxZ;
}
