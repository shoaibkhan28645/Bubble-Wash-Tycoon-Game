import { CARS, PADS, TUNING, UPGRADES, type CarDef, type LocationLayout, type Point } from '../core/config';
import type { GameState } from '../core/gameState';
import type { SoundManager } from '../audio/sound';
import type { Car, CarPool } from './cars';
import { queueSpots, spawnSeconds } from './economy';
import { canUse, pickRebalance } from './lanes';
import type { Station } from './stations';
import { Tunnel } from './tunnel';

/** A wash lane cars line up for: a hand-wash bay or the tunnel. */
export type Lane = Station | Tunnel;

/** The valet walks to a car it moved, then back to its spot after this long. */
const VALET_CALL_SECONDS = 4;

/** Where the `index`-th waiting car parks in a lane's line. */
export function slotOf(lane: Lane, index: number, layout: LocationLayout): Point {
  if (lane instanceof Tunnel) return lane.slot(index);
  return { x: lane.at.x, z: lane.at.z - layout.queueGap * (index + 1) };
}

/** Sum of a pad effect over everything built (the bench's patience, the sign's arrivals). */
export function unlockedSum(state: GameState, pick: (effects: (typeof PADS)[number]['effects']) => number | undefined): number {
  return PADS.filter((p) => state.unlocked.includes(p.id)).reduce((sum, p) => sum + (pick(p.effects) ?? 0), 0);
}

/**
 * Cars arriving: a new one when the arrival timer says (stars and the sign
 * speed it up), the golden VIP every few minutes, and the valet moving cars
 * from a long line to an idle lane.
 */
export class Arrivals {
  /** Where the valet is needed (a car it just moved), if anywhere. */
  valetCall: Point | null = null;
  private spawnTimer = Number.POSITIVE_INFINITY;
  private vipTimer: number;
  private valetTimer = 0;
  private valetCallAge = 0;

  constructor(
    private readonly pool: CarPool,
    private readonly layout: LocationLayout,
    private readonly state: GameState,
    private readonly lanes: () => Lane[],
    private readonly sound: SoundManager,
  ) {
    const vip = TUNING.vip;
    this.vipTimer = Math.max(vip.firstSeconds - state.playSeconds, vip.minSeconds * Math.random());
  }

  update(dt: number): void {
    this.spawn(dt);
    this.spawnVip(dt);
    this.rebalance(dt);
  }

  private spawn(dt: number): void {
    const signBonus = unlockedSum(this.state, (e) => e.arrivalBonus);
    const interval = spawnSeconds(TUNING.cars.spawnSeconds, this.state.stars, TUNING.stars.arrivalPerStar, signBonus);
    this.spawnTimer = Math.min(interval, this.spawnTimer + dt);
    if (this.spawnTimer < interval) return;
    const types = this.availableCars();
    const def = types[Math.floor(Math.random() * types.length)];
    if (!def) return;
    const lane = this.laneFor(def, false);
    if (!lane) return;
    this.addCar(def, def, lane, lane.queue.length);
    this.spawnTimer = 0;
  }

  /** Golden VIP (GDD): first at 5:00 of play, then every 3–5 minutes; goes to the front of a bay line. */
  private spawnVip(dt: number): void {
    this.vipTimer -= dt;
    if (this.vipTimer > 0) return;
    const vip = CARS.find((c) => c.vip);
    const best = this.availableCars().reduce<CarDef | null>((a, b) => (!a || b.basePay > a.basePay ? b : a), null);
    const lane = vip && this.laneFor(vip, true);
    if (!vip || !best || !lane) {
      this.vipTimer = 5; // Try again shortly.
      return;
    }
    // Pays 5x (its payMultiplier) the best regular car on the lot.
    const car = this.addCar(vip, { ...vip, basePay: best.basePay }, lane, 0);
    car.wantsDetail = true;
    this.vipTimer = TUNING.vip.minSeconds + Math.random() * (TUNING.vip.maxSeconds - TUNING.vip.minSeconds);
    this.sound.play('build');
  }

  private addCar(def: CarDef, payDef: CarDef, lane: Lane, index: number): Car {
    const car = this.pool.acquire();
    const road = { x: this.layout.spawnX, z: this.layout.roadZ };
    car.spawn(def, road, { x: lane.at.x, z: this.layout.roadZ }, slotOf(lane, index, this.layout), payDef);
    car.patienceMax = def.patience * (1 + unlockedSum(this.state, (e) => e.patienceBonus));
    car.patience = car.patienceMax;
    car.wantsDetail = Math.random() < TUNING.stations.garage.chance;
    lane.queue.splice(index, 0, car);
    lane.queue.forEach((c, i) => c !== car && c.driveTo(slotOf(lane, i, this.layout)));
    return car;
  }

  /** Least-busy lane this car may use that has room (a VIP may squeeze into a full line). */
  private laneFor(def: CarDef, vip: boolean): Lane | null {
    const car = { def, vip };
    let best: Lane | null = null;
    let bestLoad = Infinity;
    for (const lane of this.lanes()) {
      if (!canUse(car, lane)) continue;
      const capacity = this.capacity(lane);
      const used = lane.queue.length + (lane instanceof Tunnel ? lane.inside.length : lane.car ? 1 : 0);
      if (!vip && used >= capacity) continue;
      if (used / capacity < bestLoad) {
        best = lane;
        bestLoad = used / capacity;
      }
    }
    return best;
  }

  private capacity(lane: Lane): number {
    if (lane instanceof Tunnel) return TUNING.stations.tunnel.capacity + TUNING.stations.tunnel.queueSpots;
    return 1 + queueSpots(TUNING.cars.queueSpots, UPGRADES.kinds.queue, this.state.levels[`${lane.id}.queue`] ?? 0);
  }

  /** Valet: when a lane sits idle and another has cars waiting, drive one over. */
  private rebalance(dt: number): void {
    this.valetTimer -= dt;
    this.valetCallAge += dt;
    if (this.valetCallAge > VALET_CALL_SECONDS) this.valetCall = null;
    if (this.valetTimer > 0 || !this.state.unlocked.includes('valet')) return;
    this.valetTimer = TUNING.valet.checkSeconds;
    const move = pickRebalance(this.lanes());
    if (!move) return;
    const { car, from, to } = move;
    from.queue.shift();
    from.queue.forEach((c, i) => c.driveTo(slotOf(from, i, this.layout)));
    const target = slotOf(to, to.queue.length, this.layout);
    const p = car.position;
    // Pull out sideways, then drive along to the other line.
    const z = Math.max(p.z, target.z);
    car.follow([{ x: p.x, z }, { x: target.x, z }, target]);
    car.state = 'arriving';
    to.queue.push(car);
    this.valetCall = { ...p };
    this.valetCallAge = 0;
  }

  private availableCars(): CarDef[] {
    return CARS.filter((car) => car.unlockedBy !== null && this.state.unlocked.includes(car.unlockedBy));
  }
}
