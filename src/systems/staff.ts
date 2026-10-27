import { Vector3, type Scene } from 'three';
import { CHARACTERS, TUNING, UPGRADES, type LocationLayout, type Point, type Rect } from '../core/config';
import type { GameState } from '../core/gameState';
import { PersonAvatar } from '../render/models/actors';
import type { Label, WorldLabels } from '../ui/worldLabels';
import { Carrier, type SupplyType } from './carry';
import { levelFactor, levelStep } from './economy';
import { pushOut } from './player';
import type { Station } from './stations';
import type { Supplies } from './supplies';

/** Hire pad id → the role's key in characters.json. */
const ROLES = { washer: 'washer', runner: 'runner', dryerStaff: 'dryer' } as const;
export type Role = keyof typeof ROLES;

const ARRIVE = 0.25;
/** How far beside a station's edge staff stand to work or drop supplies. */
const SIDE = 0.9;

/** One hired helper: walks, works a station or carries supplies, takes coffee breaks. */
class Helper {
  readonly avatar: PersonAvatar;
  readonly carrier: Carrier | null;
  target: Point;
  working: Station | null = null;
  onBreak = 0;
  worked = 0;
  private heading = 0;
  private readonly bubble: Label | null;

  constructor(
    readonly role: Role,
    scene: Scene,
    start: Point,
    capacity: () => number,
    labels: WorldLabels,
  ) {
    this.avatar = new PersonAvatar(CHARACTERS.staff[ROLES[role]]);
    this.avatar.root.position.set(start.x, 0, start.z);
    scene.add(this.avatar.root);
    this.target = start;
    this.carrier = role === 'runner' ? new Carrier(this.avatar.root, () => this.position, capacity) : null;
    const coffee = document.createElement('div');
    coffee.className = 'coffee-bubble';
    coffee.textContent = '☕';
    this.bubble = labels.add(coffee, new Vector3());
    this.bubble.visible = false;
  }

  get position(): Point {
    return { x: this.avatar.root.position.x, z: this.avatar.root.position.z };
  }

  /** Walks towards the target; returns true once there. */
  walk(dt: number, speed: number, obstacles: readonly Rect[]): boolean {
    const p = this.avatar.root.position;
    const dx = this.target.x - p.x;
    const dz = this.target.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= ARRIVE) return true;
    const step = Math.min(dist, speed * dt);
    p.x += (dx / dist) * step;
    p.z += (dz / dist) * step;
    for (const rect of obstacles) pushOut(p, 0.4, rect);
    const goal = Math.atan2(dx, dz);
    this.heading += Math.atan2(Math.sin(goal - this.heading), Math.cos(goal - this.heading)) * Math.min(1, dt * 12);
    this.avatar.root.rotation.y = this.heading;
    return false;
  }

  face(point: Point): void {
    const p = this.position;
    this.heading = Math.atan2(point.x - p.x, point.z - p.z);
    this.avatar.root.rotation.y = this.heading;
  }

  showCoffee(on: boolean): void {
    if (!this.bubble) return;
    this.bubble.visible = on;
    if (on) this.bubble.at.set(this.position.x, 2.4, this.position.z);
  }
}

/**
 * Staff AI (GDD "staff & automation"): the washer runs bay 1, the runner
 * carries supplies, the dryer runs the dryer and waxing station. Each works
 * a while, then takes a short coffee break that upgrades shorten.
 */
export class StaffSystem {
  private readonly helpers: Helper[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly layout: LocationLayout,
    private readonly state: GameState,
    private readonly labels: WorldLabels,
  ) {}

  /** Hires the helper a built pad provides; they appear on the pad and walk to work. */
  hire(padId: string): void {
    if (!(padId in ROLES) || this.helpers.some((h) => h.role === padId)) return;
    const role = padId as Role;
    const start = this.layout.pads[padId] ?? this.home(role);
    const capacity = () => TUNING.supplies.carryBase + levelStep(UPGRADES.kinds.staffCarry, this.level(`${role}.staffCarry`));
    const helper = new Helper(role, this.scene, start, capacity, this.labels);
    helper.target = this.home(role);
    this.helpers.push(helper);
  }

  carriers(): Carrier[] {
    return this.helpers.flatMap((h) => (h.carrier ? [h.carrier] : []));
  }

  /** How hard staff are working a station this frame (0 if nobody). */
  rateFor(station: Station): number {
    const helper = this.helpers.find((h) => h.working === station && h.onBreak <= 0);
    if (!helper) return 0;
    return TUNING.staff.workRate / levelFactor(UPGRADES.kinds.staffSpeed, this.level(`${helper.role}.staffSpeed`));
  }

  update(dt: number, stations: readonly Station[], supplies: Supplies, obstacles: readonly Rect[]): void {
    for (const helper of this.helpers) {
      const speed = TUNING.staff.walkSpeed / levelFactor(UPGRADES.kinds.staffSpeed, this.level(`${helper.role}.staffSpeed`));
      if (this.takeBreak(dt, helper)) {
        helper.avatar.update(dt, 0, false);
        continue;
      }
      const station = helper.role === 'runner' ? this.run(helper, stations, supplies) : this.chooseStation(helper, stations);
      const there = helper.walk(dt, speed, obstacles);
      // Can't work a station until standing beside it.
      helper.working = there ? station : null;
      if (helper.working) helper.face(helper.working.at);
      if (!there || helper.working || helper.role === 'runner') helper.worked += dt;
      helper.carrier?.update(dt, !there);
      helper.avatar.update(dt, there ? 0 : 0.5, !!helper.working?.needsWork);
    }
  }

  /** Coffee break after a stretch of work. Returns true while on break. */
  private takeBreak(dt: number, helper: Helper): boolean {
    if (helper.onBreak > 0) {
      helper.onBreak -= dt;
      helper.showCoffee(helper.onBreak > 0);
      return helper.onBreak > 0;
    }
    if (helper.worked < TUNING.staff.workSeconds) return false;
    helper.worked = 0;
    const kind = helper.role === 'washer' ? UPGRADES.kinds.stamina : UPGRADES.kinds.staffSpeed;
    const key = helper.role === 'washer' ? 'washer.stamina' : `${helper.role}.staffSpeed`;
    helper.onBreak = TUNING.staff.breakSeconds * levelFactor(kind, this.level(key));
    helper.working = null;
    helper.showCoffee(true);
    return true;
  }

  /** Washer: bay 1. Dryer: whichever of the dryer and waxing station has a car waiting. */
  private chooseStation(helper: Helper, stations: readonly Station[]): Station | null {
    const mine = stations.filter((s) => (helper.role === 'washer' ? s.id === 'bay1' : s.kind === 'dryer' || s.kind === 'wax'));
    const station = mine.find((s) => s.needsWork) ?? null;
    helper.target = station ? this.sideOf(station) : this.home(helper.role);
    return station;
  }

  /** Runner: drop off what a station needs, or fetch more from the shelf, or wait at home. Works no station. */
  private run(helper: Helper, stations: readonly Station[], supplies: Supplies): null {
    const carrier = helper.carrier!;
    const shelf = this.layout.pads.soap;
    const lowest = (types: SupplyType[]) => {
      let best: Station | null = null;
      let bestStock = Infinity;
      for (const s of stations) {
        if (!s.supply || !types.includes(s.supply as SupplyType)) continue;
        const stock = this.state.supplies[`${s.id}.${s.supply}`] ?? 0;
        const max = TUNING.stations.supplyCapacity * TUNING.stations.usesPerItem;
        if (stock + TUNING.stations.usesPerItem <= max && stock < bestStock) {
          best = s;
          bestStock = stock;
        }
      }
      return best;
    };
    const dropAt = carrier.stack.length > 0 ? lowest([...new Set(carrier.stack)]) : null;
    if (dropAt) helper.target = this.sideOf(dropAt);
    else if (shelf && supplies.types().some((t) => supplies.need(t, [carrier]) > 0) && !carrier.full) {
      helper.target = { x: shelf.x, z: shelf.z + 1 };
    } else helper.target = this.home('runner');
    return null;
  }

  /** A spot just outside a station on its left (the side facing the middle of the lot). */
  private sideOf(station: Station): Point {
    const left = station.at.x <= 0 || station.kind !== 'bay';
    const x = left ? station.zone.minX + SIDE : station.zone.maxX - SIDE;
    return { x, z: station.at.z };
  }

  private home(role: Role): Point {
    return this.layout.staffSpots[role] ?? this.layout.playerStart;
  }

  private level(key: string): number {
    return this.state.levels[key] ?? 0;
  }
}
