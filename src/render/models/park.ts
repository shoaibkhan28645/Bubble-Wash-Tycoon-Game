// Starlight Fun Park's rides, stalls and props, modelled in Blender
// (art/blender/park.py): the stalls and props in one file, each ride in a
// file of its own (each under 512 KiB). A ride is drawn as one skinned mesh
// (rigid.ts): its platform turns, its horses bob, and riders sit on the
// seats marked in the model, going round with them.
import { Group, Mesh, Object3D, Vector3, type Scene } from 'three';
import type { Point } from '../../core/config';
import { TUNING } from '../../core/config';
import type { ParkVisitor, Ride } from '../../systems/park';
import { asset, hasModel } from '../assets';
import { skinnedToyMaterial, toyMaterial } from './build';
import { plate } from './kit';
import type { PersonAvatar } from './person';
import { rigidSkin } from './rigid';

const FILES = ['building:park', 'building:park-midway', 'building:park-carousel', 'building:park-teacups', 'building:park-bumper'];

/** The named model's node in whichever park file has it (not a copy). */
export function parkPiece(name: string): Object3D {
  for (const file of FILES) {
    const found = hasModel(file) ? asset(file).scene.getObjectByName(name) : undefined;
    if (found) return found;
  }
  throw new Error(`No park model called ${name}`);
}

/** A copy of a model, standing on its own base at the origin. */
export function parkModel(name: string): Object3D {
  const copy = parkPiece(name).clone(true);
  copy.position.set(0, 0, 0);
  copy.traverse((node) => {
    if (node instanceof Mesh) node.material = toyMaterial;
  });
  return copy;
}

/** Which model each of the park's pads shows once built (rides and staff have their own). */
const PAD_MODELS: Record<string, string> = {
  booth: 'pk_booth',
  cart: 'pk_cart',
  benches: 'pk_benches',
  ringtoss: 'pk_ringtoss',
  burger: 'pk_burger',
  shed: 'pk_shed',
};

/** Sign boards painted in the game (art/blender/park.py leaves them blank): words, colour, middle and size. */
const SIGNS: Record<string, { text: string; color: string; y: number; z: number; width: number; height: number }> = {
  pk_booth: { text: 'TICKETS', color: '#ff5fa8', y: 3.22, z: 0.53, width: 2.25, height: 0.44 },
  pk_cart: { text: 'CANDY FLOSS', color: '#ff5fa8', y: 0.72, z: 0.49, width: 1.5, height: 0.28 },
  pk_gate: { text: 'STARLIGHT', color: '#ff5fa8', y: 5.35, z: 0.3, width: 6.9, height: 0.92 },
  pk_ringtoss: { text: 'RING TOSS', color: '#2f80d1', y: 3.3, z: 0.3, width: 2.2, height: 0.4 },
  pk_burger: { text: 'BURGERS', color: '#e8423f', y: 3.3, z: 0.32, width: 2.35, height: 0.4 },
  pk_bumper: { text: 'BUMPER CARS', color: '#ff5fa8', y: 4.25, z: -3.25, width: 4.0, height: 0.7 },
};

/** Parts that turn on their own, all the time, and how fast (radians a second): stars on top, the floss bowl. */
const SPINNERS: Record<string, number> = { pk_booth_star: 1.2, pk_gate_star: 0.7, pk_cart_bowl: 7, pk_burger_burger: 0.8 };

/** A model with its painted sign, if it has one. */
export function signedModel(name: string): Object3D {
  const model = parkModel(name);
  const painted = SIGNS[name];
  if (painted) {
    const sign = plate(painted.text, painted.width, painted.height, painted.color, false);
    sign.position.set(0, painted.y, painted.z);
    model.add(sign);
  }
  return model;
}

export function parkPadModel(id: string): Object3D | null {
  const name = PAD_MODELS[id];
  return name ? signedModel(name) : null;
}

/**
 * What the player can't walk through, per pad (and the gate), as boxes of
 * half width, half depth and an offset: the booth's counter and walls (a
 * doorway each side for whoever sells), the cart, the benches, a ride's
 * platform (a cross and a square, round enough).
 */
export const PARK_SOLIDS: Record<string, [number, number, number?, number?][]> = {
  booth: [
    [1.6, 0.25, 0, 0.78],
    [1.75, 0.08, 0, -1.12],
    [0.1, 0.4, -1.66, -0.78],
    [0.1, 0.4, 1.66, -0.78],
  ],
  cart: [[0.85, 0.42]],
  ringtoss: [
    [1.55, 0.25, 0, 0.8],
    [1.7, 0.08, 0, -1.04],
    [0.08, 0.5, -1.64, -0.6],
    [0.08, 0.5, 1.64, -0.6],
    [1.2, 0.25, 0, -0.35],
  ],
  burger: [
    [1.65, 0.25, 0, 0.9],
    [1.8, 0.08, 0, -1.14],
    [0.08, 0.54, -1.74, -0.66],
    [0.08, 0.54, 1.74, -0.66],
    [0.8, 0.3, -0.6, -0.45],
  ],
  shed: [[2.6, 2.1]],
  teacups: [
    [3.1, 1.9],
    [1.9, 3.1],
    [2.5, 2.5],
  ],
  bumper: [[4.7, 3.45]],
  benches: [[3.2, 0.28, 0, 0.08]],
  gate: [
    [0.6, 0.6, -5, 0],
    [0.6, 0.6, 5, 0],
  ],
  carousel: [
    [4.0, 2.2],
    [2.2, 4.0],
    [3.3, 3.3],
  ],
};

/** Turns the always-turning parts of a model (stars, the floss bowl). */
export class Spinners {
  private readonly parts: { node: Object3D; speed: number }[] = [];

  watch(model: Object3D): void {
    model.traverse((node) => {
      const speed = SPINNERS[node.name];
      if (speed) this.parts.push({ node, speed });
    });
  }

  update(dt: number): void {
    for (const part of this.parts) part.node.rotation.y += part.speed * dt;
  }
}

/** A rider's hips sit this high above their feet (the sit animation, at the people's size). */
const SIT_HIP = 0.47;
/** The lever swings forward this far (radians) when pulled, and springs back. */
const LEVER_SWING = 1.0;
const PARK_RIDES = TUNING.park.rides;

/** A bumper car's room to drive in (half the arena, less the car), and how close two cars come before they bump. */
const ARENA = { x: 3.65, z: 2.55 };
const BUMP_DISTANCE = 1.2;
/** How quickly a free-driving bumper car changes its mind about where to go (radians a second, at most). */
const WANDER = 2.2;

/** One bumper car: where it parks, and where it is now. */
interface BumperCar {
  node: Object3D;
  home: { x: number; z: number };
  x: number;
  z: number;
  yaw: number;
  turn: number;
}

/**
 * A ride on the map: its model (one draw call), moving with the ride (the
 * carousel's platform turns and its horses bob, the teacups' platter turns
 * and each cup spins, the bumper cars drive about and bump); riders in
 * their seats ride along; and its lever, which swings when pulled.
 */
export class RideView {
  readonly group = new Group();
  /** A bumper car bumped another, or the rail (where, in the world). */
  onBump: ((at: Vector3) => void) | null = null;
  private readonly spin: Object3D | null;
  private readonly bobbers: { node: Object3D; base: number }[] = [];
  private readonly cups: Object3D[] = [];
  private readonly cars: BumperCar[] = [];
  private readonly seats: Object3D[] = [];
  private readonly riders = new Map<ParkVisitor, Object3D>();
  private readonly arm: Object3D | null;
  private readonly seen = new Vector3();
  private bumpCooldown = 0;

  constructor(
    private readonly ride: Ride,
    private readonly scene: Scene,
  ) {
    const name = ride.def.model;
    const model = signedModel(name);
    rigidSkin(model, toyMaterial, name, skinnedToyMaterial);
    model.traverse((node) => {
      node.castShadow = node.receiveShadow = true;
    });
    this.group.add(model);
    this.group.position.set(ride.spot.at.x, 0, ride.spot.at.z);
    this.spin = model.getObjectByName(`${name}_spin`) ?? null;
    const parts = (part: string): Object3D[] => {
      const found: Object3D[] = [];
      for (let i = 0; ; i++) {
        const node = model.getObjectByName(`${name}_${part}${i}`);
        if (!node) return found;
        found.push(node);
      }
    };
    for (const node of parts('horse')) this.bobbers.push({ node, base: node.position.y });
    this.cups.push(...parts('cup'));
    for (const node of parts('car')) this.cars.push({ node, home: { x: node.position.x, z: node.position.z }, x: node.position.x, z: node.position.z, yaw: 0, turn: 0 });
    this.seats.push(...parts('seat').slice(0, ride.def.seats));
    // The ride's logic follows the seats where the model has them (cups spin, cars drive).
    if (this.seats.length === ride.def.seats) {
      ride.seatAt = (i) => {
        this.seats[i]!.getWorldPosition(this.seen);
        return { x: this.seen.x, z: this.seen.z };
      };
    }
    // The lever, beside the ride, facing it.
    const lever = parkModel('pk_lever');
    const { lever: at } = ride.spot;
    const toRide = Math.atan2(ride.spot.at.x - at.x, ride.spot.at.z - at.z);
    lever.position.set(at.x + Math.sin(toRide) * 0.65 - ride.spot.at.x, 0, at.z + Math.cos(toRide) * 0.65 - ride.spot.at.z);
    lever.rotation.y = toRide + Math.PI;
    lever.traverse((node) => (node.castShadow = true));
    this.arm = lever.getObjectByName('pk_lever_arm') ?? null;
    this.group.add(lever);
  }

  update(dt: number): void {
    const { ride } = this;
    if (this.spin) this.spin.rotation.y = ride.angle;
    // The horses bob up and down while it turns (each out of step with the next), settling level as it stops.
    const going = ride.speed / ride.def.topSpeed;
    this.bobbers.forEach((b, i) => {
      b.node.position.y = b.base + ride.def.bob * going * Math.sin(ride.angle * 4 + i * 1.7);
    });
    // Each teacup spins the other way, faster than the platter.
    for (const cup of this.cups) cup.rotation.y = -ride.angle * 2.4;
    this.drive(dt);
    if (this.arm) {
      const t = ride.sinceLaunch;
      const swing = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.15) / 0.7);
      this.arm.rotation.x = LEVER_SWING * swing;
    }
    this.seatRiders();
  }

  /**
   * Bumper cars: while the ride runs, each car with a rider wanders about the
   * arena, turning off the rails and bouncing off the other cars; as the ride
   * winds down they all drive back to their bays.
   */
  private drive(dt: number): void {
    if (this.cars.length === 0) return;
    const { ride } = this;
    this.bumpCooldown -= dt;
    const homeTime = ride.phase !== 'running' || ride.time > ride.cycle - PARK_RIDES.spinDown;
    this.cars.forEach((car, i) => {
      const driving = !homeTime && ride.seats[i]?.step === 'seated';
      if (!driving) {
        // Back to the bay, facing out.
        const k = ride.phase === 'running' ? Math.min(1, dt * 2.5) : 1;
        car.x += (car.home.x - car.x) * k;
        car.z += (car.home.z - car.z) * k;
        car.yaw += Math.atan2(Math.sin(-car.yaw), Math.cos(-car.yaw)) * k;
      } else {
        car.turn = Math.max(-WANDER, Math.min(WANDER, car.turn + (Math.random() - 0.5) * 6 * dt));
        car.yaw += car.turn * dt;
        const speed = ride.speed;
        car.x += Math.sin(car.yaw) * speed * dt;
        car.z += Math.cos(car.yaw) * speed * dt;
        // Off the rails: turned back in.
        if (Math.abs(car.x) > ARENA.x || Math.abs(car.z) > ARENA.z) {
          car.x = Math.max(-ARENA.x, Math.min(ARENA.x, car.x));
          car.z = Math.max(-ARENA.z, Math.min(ARENA.z, car.z));
          car.yaw = Math.atan2(-car.x, -car.z) + (Math.random() - 0.5) * 1.2;
          this.bump(car);
        }
      }
      car.node.position.x = car.x;
      car.node.position.z = car.z;
      car.node.rotation.y = car.yaw;
    });
    // Two cars meeting bounce apart.
    if (homeTime) return;
    for (let a = 0; a < this.cars.length; a++) {
      for (let b = a + 1; b < this.cars.length; b++) {
        const p = this.cars[a]!;
        const q = this.cars[b]!;
        const dx = q.x - p.x;
        const dz = q.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d >= BUMP_DISTANCE || d === 0) continue;
        const push = (BUMP_DISTANCE - d) / 2;
        p.x -= (dx / d) * push;
        p.z -= (dz / d) * push;
        q.x += (dx / d) * push;
        q.z += (dz / d) * push;
        p.yaw = Math.atan2(-dx, -dz) + (Math.random() - 0.5);
        q.yaw = Math.atan2(dx, dz) + (Math.random() - 0.5);
        this.bump(p, q);
      }
    }
  }

  private bump(car: BumperCar, other?: BumperCar): void {
    if (this.bumpCooldown > 0 || !this.onBump) return;
    this.bumpCooldown = 0.35;
    const x = other ? (car.x + other.x) / 2 : car.x;
    const z = other ? (car.z + other.z) / 2 : car.z;
    this.onBump(new Vector3(this.ride.spot.at.x + x, 0.7, this.ride.spot.at.z + z));
  }

  /** Riders sit on their seats (going round with them); off the ride, they're back on the ground. */
  private seatRiders(): void {
    const { ride } = this;
    const seated = new Set<ParkVisitor>();
    ride.seats.forEach((visitor, i) => {
      const avatar = visitor?.avatar as PersonAvatar | null | undefined;
      const seat = this.seats[i];
      if (!visitor || visitor.step !== 'seated' || !avatar || !seat) return;
      seated.add(visitor);
      if (this.riders.get(visitor) === seat) return;
      this.riders.set(visitor, seat);
      seat.add(avatar.root);
      const scale = avatar.root.scale.x;
      avatar.root.position.set(0, -SIT_HIP * scale, 0);
      avatar.root.rotation.set(0, this.facing(i, seat), 0);
      avatar.riding = true;
      avatar.showShadow(false);
    });
    for (const [visitor, seat] of this.riders) {
      if (seated.has(visitor)) continue;
      this.riders.delete(visitor);
      const avatar = visitor.avatar as PersonAvatar | null;
      if (!avatar || avatar.root.parent !== seat) continue;
      this.scene.add(avatar.root);
      avatar.root.rotation.set(0, avatar.root.rotation.y, 0);
      avatar.root.position.set(visitor.at.x, visitor.y, visitor.at.z);
      avatar.riding = false;
      avatar.showShadow(true);
    }
  }

  /** Which way a rider faces in seat `i`, in its seat's own terms: a horse's nose, a cup's middle, a car's front. */
  private facing(i: number, seat: Object3D): number {
    if (this.bobbers.length > 0) {
      const a = this.ride.def.seatStart + (i * 2 * Math.PI) / this.ride.def.seats;
      return Math.atan2(-Math.sin(a), -Math.cos(a));
    }
    if (this.cups.length > 0) return Math.atan2(-seat.position.x, -seat.position.z);
    return 0;
  }
}

/** Where a sign or a ring floats over a ride: above its middle. */
export function overRide(ride: Ride, height: number): Vector3 {
  const at: Point = ride.spot.at;
  return new Vector3(at.x, height, at.z);
}
