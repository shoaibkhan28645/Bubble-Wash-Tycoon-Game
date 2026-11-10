// Starlight Fun Park's rides, stalls and props, modelled in Blender
// (art/blender/park.py): the stalls and props in one file, each ride in a
// file of its own (each under 512 KiB). A ride is drawn as one skinned mesh
// (rigid.ts): its platform turns, its horses bob, and riders sit on the
// seats marked in the model, going round with them.
import { Group, Mesh, Object3D, Vector3, type Scene } from 'three';
import type { Point } from '../../core/config';
import type { ParkVisitor, Ride } from '../../systems/park';
import { asset, hasModel } from '../assets';
import { skinnedToyMaterial, toyMaterial } from './build';
import { plate } from './kit';
import type { PersonAvatar } from './person';
import { rigidSkin } from './rigid';

const FILES = ['building:park', 'building:park-carousel', 'building:park-teacups'];

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
};

/** Sign boards painted in the game (art/blender/park.py leaves them blank): words, colour, middle and size. */
const SIGNS: Record<string, { text: string; color: string; y: number; z: number; width: number; height: number }> = {
  pk_booth: { text: 'TICKETS', color: '#ff5fa8', y: 3.22, z: 0.53, width: 2.25, height: 0.44 },
  pk_cart: { text: 'CANDY FLOSS', color: '#ff5fa8', y: 0.72, z: 0.49, width: 1.5, height: 0.28 },
  pk_gate: { text: 'STARLIGHT', color: '#ff5fa8', y: 5.35, z: 0.3, width: 6.9, height: 0.92 },
};

/** Parts that turn on their own, all the time, and how fast (radians a second): stars on top, the floss bowl. */
const SPINNERS: Record<string, number> = { pk_booth_star: 1.2, pk_gate_star: 0.7, pk_cart_bowl: 7 };

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

/**
 * A ride on the map: its model (one draw call), turning with the ride, the
 * horses bobbing; riders in their seats ride along; and its lever, which
 * swings when pulled.
 */
export class RideView {
  readonly group = new Group();
  private readonly spin: Object3D | null;
  private readonly bobbers: { node: Object3D; base: number }[] = [];
  private readonly seats: Object3D[] = [];
  private readonly riders = new Map<ParkVisitor, Object3D>();
  private readonly arm: Object3D | null;

  constructor(
    private readonly ride: Ride,
    private readonly scene: Scene,
  ) {
    const name = ride.def.model;
    const model = parkModel(name);
    rigidSkin(model, toyMaterial, name, skinnedToyMaterial);
    model.traverse((node) => {
      node.castShadow = node.receiveShadow = true;
    });
    this.group.add(model);
    this.group.position.set(ride.spot.at.x, 0, ride.spot.at.z);
    this.spin = model.getObjectByName(`${name}_spin`) ?? null;
    for (let i = 0; ; i++) {
      const bobber = model.getObjectByName(`${name}_horse${i}`);
      if (!bobber) break;
      this.bobbers.push({ node: bobber, base: bobber.position.y });
    }
    for (let i = 0; i < ride.def.seats; i++) {
      const seat = model.getObjectByName(`${name}_seat${i}`);
      if (seat) this.seats.push(seat);
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

  update(): void {
    const { ride } = this;
    if (this.spin) this.spin.rotation.y = ride.angle;
    // The horses bob up and down while it turns (each out of step with the next), settling level as it stops.
    const going = ride.speed / ride.def.topSpeed;
    this.bobbers.forEach((b, i) => {
      b.node.position.y = b.base + ride.def.bob * going * Math.sin(ride.angle * 4 + i * 1.7);
    });
    if (this.arm) {
      const t = ride.sinceLaunch;
      const swing = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.15) / 0.7);
      this.arm.rotation.x = LEVER_SWING * swing;
    }
    this.seatRiders();
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
      // Facing the way the seat goes round (a horse's nose), from its place on the platform.
      const a = ride.def.seatStart + (i * 2 * Math.PI) / ride.def.seats;
      avatar.root.rotation.set(0, Math.atan2(-Math.sin(a), -Math.cos(a)), 0);
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
}

/** Where a sign or a ring floats over a ride: above its middle. */
export function overRide(ride: Ride, height: number): Vector3 {
  const at: Point = ride.spot.at;
  return new Vector3(at.x, height, at.z);
}
