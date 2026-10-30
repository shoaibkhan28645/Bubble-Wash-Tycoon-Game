import { Vector3, type Scene } from 'three';
import { CHARACTERS, TUNING, UPGRADES, fixedSolids, type LocationLayout, type Point, type Rect } from '../core/config';
import type { GameState } from '../core/gameState';
import { PersonAvatar, type Tool } from '../render/models/person';
import type { Label, WorldLabels } from '../ui/worldLabels';
import { Carrier } from './carry';
import { levelFactor, levelStep } from './economy';
import { NavGrid } from './nav';
import { pickStation, planRunner, sideOf } from './staffPlan';
import { insideRect, type Station, type StationKind } from './stations';
import { carAhead } from './roadRules';
import type { Supplies } from './supplies';
import type { CashSystem } from './cash';

/** Hire pad id → the role's key in characters.json (the garage comes with its detailer). */
const ROLES = {
  washer: 'washer',
  runner: 'runner',
  dryerStaff: 'dryer',
  cashier: 'cashier',
  valet: 'valet',
  manager: 'manager',
  garage: 'detailer',
  attendant: 'attendant',
  clerk: 'clerk',
} as const;
export type Role = keyof typeof ROLES;

/**
 * Stations each role works: the washer both bays, the dryer staff the dryer
 * and wax, the detailer the garage (and wax when the garage is empty), the
 * attendant the fuel pumps and the clerk the Mini-Mart's till.
 */
const WORKS: Record<Role, StationKind[]> = {
  washer: ['bay'],
  runner: [],
  dryerStaff: ['dryer', 'wax'],
  cashier: [],
  valet: [],
  manager: [],
  garage: ['garage', 'wax'],
  attendant: ['pump'],
  clerk: ['counter'],
};

/** What each worker holds while working a station. */
const TOOLS: Partial<Record<Role, Tool>> = { washer: 'sponge', dryerStaff: 'towel', garage: 'polisher', attendant: 'nozzle' };

const ARRIVE = 0.2;
const PICK_UP_SECONDS = 0.7;
const RADIUS = 0.45;
/** How far inside a station's zone staff stand to work or drop supplies. */
const SIDE = 0.9;
/** Re-plan the route this often, in case the way changed. */
const REPLAN_SECONDS = 1.5;
/** Kept waiting by a car this long, a helper finds a way round it. */
const CAR_WAIT_SECONDS = 1.5;
/** One hired helper: walks a planned route, works a station or carries supplies, takes coffee breaks. */
class Helper {
  readonly avatar: PersonAvatar;
  readonly carrier: Carrier | null;
  target: Point;
  /** The station this helper has taken on (keeps it until that car is done). */
  assigned: Station | null = null;
  /** The station being worked right now (assigned and standing in its zone). */
  working: Station | null = null;
  onBreak = 0;
  worked = 0;
  /** Seconds left standing still (e.g. picking up cash). */
  hold = 0;
  private path: Point[] = [];
  private pathFor: Point | null = null;
  /** Seconds kept waiting by a car in the way. */
  private held = 0;
  private replan = 0;
  private heading = 0;
  private readonly bubble: Label | null;

  constructor(
    readonly role: Role,
    scene: Scene,
    start: Point,
    capacity: () => number,
    labels: WorldLabels,
  ) {
    this.avatar = new PersonAvatar(CHARACTERS.staff[ROLES[role]], TOOLS[role] ?? null);
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

  /**
   * Follows a route around obstacles to the target; returns true once there.
   * Waits for a car in the way, and after a while finds a way round it.
   */
  walk(dt: number, speed: number, nav: NavGrid, cars: readonly Rect[], aroundCars: (from: Point, to: Point) => Point[]): boolean {
    const p = this.avatar.root.position;
    const ahead = this.path[0];
    if (ahead && carAhead(this.position, ahead, cars)) {
      this.held += dt;
      if (this.held > CAR_WAIT_SECONDS) {
        this.held = 0;
        this.path = aroundCars(this.position, this.target);
        this.pathFor = { ...this.target };
        this.replan = REPLAN_SECONDS;
      }
      return false;
    }
    this.held = 0;
    const left = Math.hypot(this.target.x - p.x, this.target.z - p.z);
    if (left <= ARRIVE) {
      // Close enough to count as there, but still step onto the spot itself: a work
      // spot can sit just inside a station's edge, and stopping short left the
      // attendant standing outside the pump's zone, never working.
      const step = Math.min(1, (speed * dt) / Math.max(left, 1e-6));
      p.x += (this.target.x - p.x) * step;
      p.z += (this.target.z - p.z) * step;
      return true;
    }
    this.replan -= dt;
    const moved = !this.pathFor || Math.hypot(this.pathFor.x - this.target.x, this.pathFor.z - this.target.z) > 0.3;
    if (moved || this.replan <= 0 || this.path.length === 0) {
      this.path = nav.findPath(this.position, this.target);
      this.pathFor = { ...this.target };
      this.replan = REPLAN_SECONDS;
    }
    let budget = speed * dt;
    while (budget > 0 && this.path.length > 0) {
      const next = this.path[0]!;
      const dx = next.x - p.x;
      const dz = next.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1e-4) {
        const goal = Math.atan2(dx, dz);
        this.heading += Math.atan2(Math.sin(goal - this.heading), Math.cos(goal - this.heading)) * Math.min(1, dt * 12);
      }
      if (dist <= budget) {
        p.x = next.x;
        p.z = next.z;
        budget -= dist;
        this.path.shift();
      } else {
        p.x += (dx / dist) * budget;
        p.z += (dz / dist) * budget;
        budget = 0;
      }
    }
    this.avatar.root.rotation.y = this.heading;
    return Math.hypot(this.target.x - p.x, this.target.z - p.z) <= ARRIVE;
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
 * Staff AI (GDD "staff & automation"). The washer serves both bays and the
 * dryer staff the dryer and waxing station, always going to the car that
 * has waited longest; the runner carries supplies. Each works a while, then
 * takes a short coffee break between cars (upgrades shorten it).
 */
export class StaffSystem {
  private readonly helpers: Helper[] = [];
  private nav: NavGrid;
  private navKey = '';

  constructor(
    private readonly scene: Scene,
    private readonly layout: LocationLayout,
    private readonly state: GameState,
    private readonly labels: WorldLabels,
    private readonly cash: CashSystem,
  ) {
    this.nav = new NavGrid(layout.walk, fixedSolids(layout), RADIUS);
  }

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

  /** Where everyone is (cars wait for people in front of them). */
  positions(): Point[] {
    return this.helpers.map((h) => h.position);
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

  update(
    dt: number,
    stations: readonly Station[],
    supplies: Supplies,
    obstacles: readonly Rect[],
    playerAt: (station: Station) => boolean,
    /** Where the valet is needed (a car just moved to another line), if anywhere. */
    valetCall: Point | null,
    /** Every car's footprint: helpers wait for them, or go round. */
    cars: readonly Rect[] = [],
  ): void {
    this.refreshNav(obstacles);
    let withCars: NavGrid | null = null;
    const aroundCars = (from: Point, to: Point): Point[] => {
      withCars ??= new NavGrid(this.layout.walk, [...obstacles, ...fixedSolids(this.layout), ...cars], RADIUS);
      return withCars.findPath(from, to);
    };
    // Golden VIPs are the player's to serve, until the manager is hired.
    const manager = this.state.unlocked.includes('manager');
    for (const helper of this.helpers) {
      // Leave a station to the player, or to another helper already on it.
      const skip = (station: Station) =>
        playerAt(station) || (!manager && !!station.car?.vip) || this.helpers.some((o) => o !== helper && o.assigned === station);
      const speed = TUNING.staff.walkSpeed / levelFactor(UPGRADES.kinds.staffSpeed, this.level(`${helper.role}.staffSpeed`));
      if (this.takeBreak(dt, helper)) {
        helper.avatar.update(dt, 0, false);
        continue;
      }
      if (helper.role === 'runner') this.planRun(helper, stations, supplies);
      else if (helper.role === 'cashier') this.planCashier(dt, helper);
      else if (helper.role === 'valet' || helper.role === 'manager') {
        helper.assigned = null;
        helper.target = (helper.role === 'valet' && valetCall) || this.home(helper.role);
      } else {
        helper.assigned = pickStation(stations, WORKS[helper.role], helper.assigned, skip);
        helper.target = helper.assigned ? sideOf(helper.assigned, SIDE) : this.home(helper.role);
      }
      const there = helper.walk(dt, speed, this.nav, cars, aroundCars);
      // Work starts as soon as the helper is beside the station, even before the exact spot.
      const station = helper.assigned;
      helper.working = station && insideRect(helper.position, station.zone) ? station : null;
      if (helper.working && there) helper.face(helper.working.at);
      if (!there || helper.working || helper.role === 'runner') helper.worked += dt;
      helper.carrier?.update(dt, !there);
      helper.avatar.update(dt, there ? 0 : 0.5, !!helper.working?.needsWork);
    }
  }

  /** Cashier: walk to the fullest cash pile and bank it; wait by the register when all is collected. */
  private planCashier(dt: number, helper: Helper): void {
    helper.assigned = null;
    // Stay bent over the pile for a moment after picking it up.
    helper.hold = Math.max(0, helper.hold - dt);
    if (helper.hold > 0) return;
    if (this.cash.update(helper.position)) {
      helper.avatar.pickUp();
      helper.target = helper.position;
      helper.hold = PICK_UP_SECONDS;
      return;
    }
    const pile = this.cash.fullestPile();
    helper.target = pile ? { x: pile.at.x + 0.6, z: pile.at.z + 0.6 } : this.home('cashier');
  }

  private planRun(helper: Helper, stations: readonly Station[], supplies: Supplies): void {
    const plan = planRunner(helper.carrier!, stations, this.state, supplies);
    const shelf = this.layout.pads.soap;
    helper.assigned = null;
    if (plan.kind === 'drop') helper.target = sideOf(plan.station, SIDE);
    else if (plan.kind === 'shelf' && shelf) helper.target = { x: shelf.x, z: shelf.z + 1 };
    else helper.target = this.home('runner');
  }

  /** Coffee break after a stretch of work, but never in the middle of a car. Returns true while on break. */
  private takeBreak(dt: number, helper: Helper): boolean {
    if (helper.onBreak > 0) {
      helper.onBreak -= dt;
      helper.showCoffee(helper.onBreak > 0);
      return helper.onBreak > 0;
    }
    // The manager never takes a break.
    if (helper.role === 'manager' || helper.worked < TUNING.staff.workSeconds || helper.assigned?.needsWork) return false;
    helper.worked = 0;
    const kind = helper.role === 'washer' ? UPGRADES.kinds.stamina : UPGRADES.kinds.staffSpeed;
    const key = helper.role === 'washer' ? 'washer.stamina' : `${helper.role}.staffSpeed`;
    helper.onBreak = TUNING.staff.breakSeconds * levelFactor(kind, this.level(key));
    helper.assigned = null;
    helper.working = null;
    helper.showCoffee(true);
    return true;
  }

  /** Rebuilds the walkable grid when something solid is built. */
  private refreshNav(obstacles: readonly Rect[]): void {
    const key = obstacles.map((o) => `${o.minX},${o.minZ}`).join('|');
    if (key === this.navKey) return;
    this.navKey = key;
    this.nav = new NavGrid(this.layout.walk, [...obstacles, ...fixedSolids(this.layout)], RADIUS);
  }

  private home(role: Role): Point {
    return this.layout.staffSpots[role] ?? this.layout.playerStart;
  }

  private level(key: string): number {
    return this.state.levels[key] ?? 0;
  }
}
