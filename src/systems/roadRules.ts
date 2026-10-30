// Cars are solid: a moving car looks ahead along the way it's driving and
// waits while another car or a person is in front of it. Only two moving
// cars stuck facing each other ease past after a while; a car standing
// still (queued, at a station) and a person are always waited for.
import { TUNING, type Point, type Rect } from '../core/config';
import { insideRect } from './stations';
import type { Car } from './cars';

/** Room kept to the car in front, and to a person, in metres. */
const CAR_GAP = 0.6;
const PERSON_GAP = 0.5;
/** A person's half width. */
const PERSON = 0.3;
/** Oncoming cars further off to the side than this are in the other lane. */
const ONCOMING_SIDE = 1.2;

export class RoadRules {
  /** Seconds each car has been held up by another car. */
  private readonly waiting = new Map<Car, number>();

  constructor(
    private readonly cars: () => Iterable<Car>,
    /** Where the people are: the player, staff, shoppers, people out walking. */
    private readonly people: () => Point[],
  ) {}

  blocked(car: Car, dt: number): boolean {
    const next = car.nextPoint;
    if (!next) return false;
    const p = car.position;
    const dx = next.x - p.x;
    const dz = next.z - p.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return false;
    const dir = { x: dx / len, z: dz / len };
    const [width, , length] = car.def.size;
    const hw = width / 2;
    const hl = length / 2;
    // Nobody steps out in front of a car: people always get to cross.
    for (const person of this.people()) {
      const { along, side } = relative(p, dir, person);
      if (along > 0 && along < hl + PERSON + PERSON_GAP && side < hw + PERSON) return true;
    }
    for (const other of this.cars()) {
      if (other === car || !other.model.mesh.visible || other.state === 'angry' || sameTunnel(car, other)) continue;
      const { along, side } = relative(p, dir, other.position);
      // The other car's half size along this car's way and across it.
      const f = { x: Math.sin(other.facing), z: Math.cos(other.facing) };
      const facing = f.x * dir.x + f.z * dir.z;
      // Coming the other way in the other lane: they just pass (wide trucks reach over the line).
      if (facing < -0.7 && side > ONCOMING_SIDE) continue;
      const cos = Math.abs(facing);
      const sin = Math.abs(f.x * dir.z - f.z * dir.x);
      const [ow, , ol] = other.def.size;
      const otherAlong = cos * (ol / 2) + sin * (ow / 2);
      const otherSide = sin * (ol / 2) + cos * (ow / 2);
      if (along > 0 && along < hl + otherAlong + CAR_GAP && side < hw + otherSide - 0.15) {
        // A car standing still (in a queue, at a station) is always waited for:
        // it will move on. Only two moving cars stuck facing each other ease past.
        const held = other.nextPoint ? (this.waiting.get(car) ?? 0) + dt : 0;
        this.waiting.set(car, held);
        if (held > TUNING.cars.giveWaySeconds) return false;
        return true;
      }
    }
    this.waiting.delete(car);
    return false;
  }
}

/** How far ahead along `dir` a point is from `p`, and how far off to the side. */
function relative(p: Point, dir: Point, q: Point): { along: number; side: number } {
  const rx = q.x - p.x;
  const rz = q.z - p.z;
  return { along: rx * dir.x + rz * dir.z, side: Math.abs(rx * dir.z - rz * dir.x) };
}

/** On the tunnel's conveyor together: the tunnel spaces them itself. */
function sameTunnel(a: Car, b: Car): boolean {
  return a.station !== null && a.station === b.station && a.station.kind === 'tunnel';
}

/** How far ahead a walker checks for a car, and the room kept from it. */
const LOOK = 0.45;
const CAR_ROOM = 0.15;

/**
 * A car just in front of someone walking from `at` towards `next` (not one
 * they're already standing in: they may step out of it).
 */
export function carAhead(at: Point, next: Point, cars: readonly Rect[]): boolean {
  const dx = next.x - at.x;
  const dz = next.z - at.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return false;
  const probe = { x: at.x + (dx / len) * Math.min(LOOK, len), z: at.z + (dz / len) * Math.min(LOOK, len) };
  const grown = (r: Rect) => ({ minX: r.minX - CAR_ROOM, maxX: r.maxX + CAR_ROOM, minZ: r.minZ - CAR_ROOM, maxZ: r.maxZ + CAR_ROOM });
  return cars.some((r) => insideRect(probe, grown(r)) && !insideRect(at, grown(r)));
}
