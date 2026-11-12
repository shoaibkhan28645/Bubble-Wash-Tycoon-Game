// The farm's road vehicles as drawn, driving as the town's cars do
// (systems/farmTraffic.ts). A delivery van (or the milk tanker) parks in the
// yard facing its way out while it loads; when it sets off it drives out east
// along its track, up the farm's east side and off along the village road,
// out of sight for most of the trip; and comes back from the other end of the
// road, in through the farm gate and down to where it parks, facing out
// again, in time to be home as the trip ends. The feed truck visits: in from
// town to the feed store, where it stops to unload; on down the track, backing
// into the side track to turn round; and away.
import { Box3, Group, Vector3, type Object3D } from 'three';
import type { Point } from '../../core/config';
import { CRUISE, type Driver, type FarmTraffic, type LegPlan } from '../../systems/farmTraffic';
import { farmModel, farmMover } from './farm';

interface Vehicle {
  model: Object3D;
  driver: Driver;
  /** A round trip (out, and home another way), or a visit (once in the middle of each trip). */
  kind: 'round' | 'visit';
  /** A round's way out and way home, or a visit's legs. */
  out: LegPlan[];
  back: LegPlan[];
  /** Where it parks and which way it faces there (a round). */
  home: Point;
  facing: number;
  /** How long the way out, and the way home (or the visit), take with nothing in the way (seconds). */
  outSeconds: number;
  seconds: number;
  state: 'home' | 'out' | 'away' | 'back' | 'visiting';
  /** How far through its trip it was last frame (null: not on one), the trips it has been sent on, and the last it drove (or visited for). */
  last: number | null;
  trips: number;
  drove: number;
}

/** Each vehicle's body width (art/blender/farm.py): its mirrors reach further, but people may pass under those. */
const BODY_WIDTH: Record<string, number> = { fm_van: 1.85, fm_tanker: 1.95, fm_pickup: 1.8, fm_feedtruck: 2.0 };

/** A model's length (measured lying along +z, the way it faces) and its body's width. */
export function vehicleSize(model: string): { length: number; width: number } {
  const size = new Box3().setFromObject(farmModel(model)).getSize(new Vector3());
  return { length: size.z, width: BODY_WIDTH[model] ?? size.x };
}

export class VanFleet {
  readonly group = new Group();
  private readonly vans = new Map<string, Vehicle>();

  /** `onAdd` hears of each vehicle drawn and its driver (its wheels turn and its lamps light, render/farmMotion.ts). */
  constructor(
    private readonly traffic: FarmTraffic,
    private readonly onAdd: (model: Object3D, driver: Driver) => void = () => {},
  ) {}

  /** A van that parks at `out[0]` facing along `out`, drives `out` off the map, and comes home along `back`. */
  addRound(id: string, model: string, out: Point[], back: Point[]): void {
    if (this.vans.has(id) || out.length < 2 || back.length < 2) return;
    const [home, next] = [out[0]!, out[1]!];
    const facing = Math.atan2(next.x - home.x, next.z - home.z);
    const outLegs = [{ path: out, through: true }];
    const backLegs = [{ path: back }];
    this.addVehicle(id, model, {
      kind: 'round',
      out: outLegs,
      back: backLegs,
      home,
      facing,
      outSeconds: this.traffic.seconds(outLegs),
      seconds: this.traffic.seconds(backLegs, CRUISE),
    });
  }

  /** A vehicle that visits once a trip: drives its legs, from off the map and off it again. */
  addVisit(id: string, model: string, legs: LegPlan[]): void {
    if (this.vans.has(id) || legs.length === 0) return;
    this.addVehicle(id, model, { kind: 'visit', out: legs, back: [], home: legs[0]!.path[0]!, facing: 0, outSeconds: 0, seconds: this.traffic.seconds(legs, CRUISE) });
  }

  private addVehicle(id: string, model: string, how: Pick<Vehicle, 'kind' | 'out' | 'back' | 'home' | 'facing' | 'outSeconds' | 'seconds'>): void {
    const mesh = farmMover(model, 'box');
    const { length, width } = vehicleSize(model);
    const driver = this.traffic.add(id, length, width);
    const van: Vehicle = { model: mesh, driver, ...how, state: how.kind === 'round' ? 'home' : 'away', last: null, trips: 0, drove: 0 };
    if (van.kind === 'round') this.traffic.park(driver, van.home, van.facing);
    else this.traffic.hide(driver);
    this.vans.set(id, van);
    this.show(van);
    this.group.add(mesh);
    this.onAdd(mesh, driver);
  }

  /**
   * One frame: each vehicle drives on. `progress(id)` is 0–1 through its trip, or null
   * when it isn't on one; `seconds` is how long a trip takes.
   */
  update(dt: number, progress: (id: string) => number | null, seconds: (id: string) => number): void {
    for (const [id, van] of this.vans) {
      const p = progress(id);
      const trip = Math.max(1, seconds(id));
      // A new trip: just set off (or started again from the beginning).
      if (p !== null && (van.last === null || p < van.last - 1e-6)) van.trips++;
      van.last = p;
      if (van.kind === 'round') this.round(van, dt, p, trip);
      else this.visit(van, dt, p, trip);
      this.show(van);
    }
  }

  /** Home, out, away, and home again in time for the trip's end. */
  private round(van: Vehicle, dt: number, p: number | null, trip: number): void {
    const { driver } = van;
    switch (van.state) {
      case 'home':
        // Not on a trip, or home from this one already (one sent while it was still on its way home, it drives now).
        if (p === null || van.drove === van.trips) break;
        van.drove = van.trips;
        // Setting off (or, coming back to a game mid-trip, already away).
        if (p * trip < van.outSeconds) {
          this.traffic.plan(driver, van.out);
          van.state = 'out';
        } else {
          this.traffic.hide(driver);
          van.state = 'away';
        }
        break;
      case 'out':
        if (this.traffic.drive(driver, dt)) {
          this.traffic.hide(driver);
          van.state = 'away';
        }
        break;
      case 'away':
        if (p === null || p * trip >= trip - van.seconds - 1) {
          this.traffic.plan(driver, van.back, CRUISE);
          van.state = 'back';
        }
        break;
      case 'back':
        if (this.traffic.drive(driver, dt)) {
          this.traffic.park(driver, van.home, van.facing);
          van.state = 'home';
        }
        break;
      default:
        break;
    }
  }

  /** Away, then once a trip, in the middle of it, the visit. */
  private visit(van: Vehicle, dt: number, p: number | null, trip: number): void {
    if (van.state === 'visiting') {
      if (this.traffic.drive(van.driver, dt)) {
        this.traffic.hide(van.driver);
        van.state = 'away';
      }
    } else if (p !== null && van.drove !== van.trips && p * trip >= Math.max(0, trip / 2 - van.seconds / 2)) {
      this.traffic.plan(van.driver, van.out, CRUISE);
      van.state = 'visiting';
      van.drove = van.trips;
    }
  }

  private show(van: Vehicle): void {
    const { model, driver } = van;
    model.visible = driver.visible;
    model.position.set(driver.position.x, 0, driver.position.z);
    model.rotation.y = driver.facing;
  }
}
