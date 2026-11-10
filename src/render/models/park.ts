// Starlight Fun Park's rides, stalls and props, modelled in Blender
// (art/blender/park.py): the stalls and props in one file, each ride in a
// file of its own (each under 512 KiB). A ride is drawn as one skinned mesh
// (rigid.ts): its platform turns, its horses bob, and riders sit on the
// seats marked in the model, going round with them.
import { CatmullRomCurve3, Group, Mesh, MeshLambertMaterial, Object3D, Quaternion, Vector3, type Scene } from 'three';
import type { Point, Rect } from '../../core/config';
import { TUNING } from '../../core/config';
import type { ParkVisitor, Ride } from '../../systems/park';
import { asset, hasModel } from '../assets';
import { skinnedToyMaterial, toyMaterial } from './build';
import { plate } from './kit';
import type { PersonAvatar } from './person';
import { rigidSkin } from './rigid';
import { Track, trackMesh, trackSolids } from '../track';

const FILES = [
  'building:park',
  'building:park-midway',
  'building:park-lakeside',
  'building:park-thrills',
  'building:park-carousel',
  'building:park-teacups',
  'building:park-bumper',
  'building:park-swings',
  'building:park-boats',
  'building:park-haunted',
  'building:park-flume',
  'building:park-coaster',
  'building:park-wheel',
];

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
  sign: 'pk_sign',
  busstop: 'pk_busstop',
  booth: 'pk_booth',
  cart: 'pk_cart',
  benches: 'pk_benches',
  ringtoss: 'pk_ringtoss',
  burger: 'pk_burger',
  shed: 'pk_shed',
  giftshop: 'pk_giftshop',
  fireworks: 'pk_barge',
  wheel: 'pk_wheel',
};

/** Sign boards painted in the game (art/blender/park.py leaves them blank): words, colour, middle and size. */
const SIGNS: Record<string, { text: string; color: string; y: number; z: number; width: number; height: number }> = {
  pk_booth: { text: 'TICKETS', color: '#ff5fa8', y: 3.22, z: 0.53, width: 2.25, height: 0.44 },
  pk_cart: { text: 'CANDY FLOSS', color: '#ff5fa8', y: 0.72, z: 0.49, width: 1.5, height: 0.28 },
  pk_gate: { text: 'STARLIGHT', color: '#ff5fa8', y: 5.35, z: 0.3, width: 6.9, height: 0.92 },
  pk_ringtoss: { text: 'RING TOSS', color: '#2f80d1', y: 3.3, z: 0.3, width: 2.2, height: 0.4 },
  pk_burger: { text: 'BURGERS', color: '#e8423f', y: 3.3, z: 0.32, width: 2.35, height: 0.4 },
  pk_sign: { text: 'STARLIGHT\nFUN PARK', color: '#2f80d1', y: 5.1, z: 0.18, width: 4.1, height: 1.55 },
  pk_haunted: { text: 'HAUNTED HOUSE', color: '#5c4b7d', y: 4.1, z: 3.16, width: 2.7, height: 0.5 },
  pk_bumper: { text: 'BUMPER CARS', color: '#ff5fa8', y: 4.25, z: -3.25, width: 4.0, height: 0.7 },
  pk_flume: { text: 'LOG FLUME', color: '#3f8f4f', y: 3.5, z: -0.31, width: 2.3, height: 0.32 },
  pk_coaster: { text: 'STARLIGHT COMET', color: '#2f80d1', y: 4.4, z: -0.3, width: 3.1, height: 0.42 },
  pk_giftshop: { text: 'GIFTS', color: '#ff5fa8', y: 3.3, z: 0.34, width: 2.2, height: 0.4 },
};

/** Parts that turn on their own, all the time, and how fast (radians a second): stars on top, the floss bowl. */
const SPINNERS: Record<string, number> = { pk_booth_star: 1.2, pk_gate_star: 0.7, pk_cart_bowl: 7, pk_burger_burger: 0.8, pk_sign_star: 0.9 };

/** A model with its painted sign, if it has one. */
export function signedModel(name: string): Object3D {
  const model = parkModel(name);
  const painted = SIGNS[name];
  if (painted) {
    const sign = plate(painted.text, painted.width, painted.height, painted.color, false);
    sign.position.set(0, painted.y, painted.z);
    model.add(sign);
    const material = sign.material as MeshLambertMaterial;
    if (!litSigns.has(material)) {
      material.emissive.set('#ffffff');
      material.emissiveMap = material.map;
      material.emissiveIntensity = 0;
      material.needsUpdate = true;
      litSigns.add(material);
    }
  }
  return model;
}

/** The painted signs, lit from within after dark. */
const litSigns = new Set<MeshLambertMaterial>();

/** How brightly the painted signs shine (0 by day, about 1 at night). */
export function lightSigns(amount: number): void {
  for (const material of litSigns) material.emissiveIntensity = amount;
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
  swings: [
    [2.6, 1.6],
    [1.6, 2.6],
    [2.1, 2.1],
  ],
  haunted: [
    [4.2, 3.2],
    [1.15, 1.15, -4.0, 2.6],
    [1.15, 1.15, 4.0, 2.6],
  ],
  sign: [
    [0.2, 0.2, -1.9, 0],
    [0.2, 0.2, 1.9, 0],
  ],
  busstop: [[1.8, 0.6]],
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
  // The flume's station, the low channel along its west side, and the splash pool.
  flume: [
    [3.6, 1.35, 0, -0.3],
    [0.75, 2.6, -4.5, 3.3],
    [1.8, 1.8, 1.3, 6.6],
  ],
  // The coaster's station and its stairs.
  coaster: [
    [3.9, 1.6],
    [0.85, 0.6, 0, -2.2],
  ],
  giftshop: [
    [1.55, 0.25, 0, 1.0],
    [1.7, 0.08, 0, -1.24],
    [0.08, 0.6, -1.64, -0.7],
    [0.08, 0.6, 1.64, -0.7],
  ],
  // The Starlight Wheel's machine house, its four feet and the boarding deck.
  wheel: [
    [2.7, 1.2, 0, -1.6],
    [0.32, 0.32, -3.8, 1.7],
    [0.32, 0.32, 3.8, 1.7],
    [0.32, 0.32, -3.8, -1.7],
    [0.32, 0.32, 3.8, -1.7],
    [1.7, 1.3, 0, 0.6],
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

/**
 * How far above a rider's own origin (their feet, standing) the seat of
 * their pants is, sitting (the sit and drive animations fold the people's
 * short legs right down: their hips drop to just off the ground). A seat
 * marker is the seat itself, so the rider's origin goes this far below it.
 */
const SIT_HIP = 0.04;
/** The lever swings forward this far (radians) when pulled, and springs back. */
const LEVER_SWING = 1.0;
const PARK_RIDES = TUNING.park.rides;

/** A log or a coaster car's forward axis, in its own terms. */
const AHEAD = new Vector3(1, 0, 0);
/** A bumper car's room to drive in (half the arena, less the car), and how close two cars come before they bump. */
const ARENA = { x: 3.65, z: 2.55 };
const BUMP_DISTANCE = 1.2;
/** How quickly a free-driving bumper car changes its mind about where to go (radians a second, at most). */
const WANDER = 2.2;

/** How far the swing chairs fly out at full speed (radians from hanging straight down). */
const SWING_OUT = 0.95;
/**
 * The swan boats' way round the lake, after the two lane mouths off the
 * jetty's end (north, then south): east along the south shore, round the
 * far end, back west along the north shore and in again, wide of the
 * fireworks barge. In the lake's own terms (its middle, and its half widths).
 */
const BOAT_LOOP: [number, number][] = [
  [-0.19, 0.6],
  [0.27, 0.67],
  [0.7, 0.42],
  [0.81, -0.04],
  [0.62, -0.5],
  [0.19, -0.67],
  [-0.22, -0.6],
];
/** A lane's mouth is this far out past its outer berth (metres). */
const BOAT_LANE = 1.0;
/** How far apart the boats set off (seconds, at most, and as a share of the ride), and the share of a trip spent speeding up and slowing down. */
const BOAT_GAP = 2.2;
const BOAT_GAP_SHARE = 0.11;
const BOAT_EASE = 0.1;
/** A boat turns from its mooring (facing +z) to its way over this far (metres) leaving, and back over this far arriving. */
const BOAT_TURN_OUT = 1.0;
const BOAT_TURN_IN = 1.4;
/** The big wheel: how fast it brings the next gondola down to the deck (radians a second, at most), how many times round a ride goes, and the share of a ride spent speeding up (and slowing down). */
const WHEEL_SHIFT = 1.4;
const WHEEL_TURNS = 2;
const WHEEL_EASE = 0.15;
/** A gondola's down at the deck within this (radians). */
const WHEEL_AT_DECK = 0.02;
/** The wheel's rim of bulbs (art/blender/park.py): how far out from the hub, and how far forward of it, the front ring is. */
const WHEEL_RIM = 5.68;
const WHEEL_RIM_FRONT = 0.62;

/** The lake the boats paddle round: its middle and half-widths (the water). */
export interface Lake {
  x: number;
  z: number;
  rx: number;
  rz: number;
}

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
  private readonly chairs: { node: Object3D; axis: Vector3 }[] = [];
  private readonly boats: { node: Object3D; home: Vector3 }[] = [];
  /** Which berth (a boat's home in the model) each boat is moored at now: they swap about, coming back. */
  private readonly berthOf: number[] = [];
  /** This ride's trips, one a boat: its way (in the world) and how far along each point is, when it sets off, and where it moors after. */
  private trips: { boat: number; path: Point[]; along: number[]; start: number; berth: number }[] | null = null;
  private readonly bats: { node: Object3D; base: Vector3; wings: Object3D[] }[] = [];
  private readonly door: Object3D | null;
  private readonly ghost: { node: Object3D; base: number } | null = null;
  /**
   * The big wheel: the wheel, its gondolas (each at this angle round it,
   * anticlockwise from +x seen from the front, when the wheel stands at
   * 0), seats a gondola, where it was when this ride set off, and how fast
   * it's turning (radians a second) and the gondolas swinging.
   */
  private readonly wheel: {
    spin: Object3D;
    gondolas: { node: Object3D; angle: number }[];
    per: number;
    from: number;
    phase: string;
    speed: number;
    swing: number;
    swingSpeed: number;
  } | null = null;
  /** A track ride's track, its cars (each this far along it from the station's middle when parked), and how far round the last frame. */
  private readonly track: Track | null = null;
  /** What of it nobody walks through beyond its pad's own boxes (a track's low runs, posts and columns), in the world. */
  readonly solids: Rect[] = [];
  private readonly vehicles: { node: Object3D; offset: number }[] = [];
  private lap = 0;
  /** Where the flume's logs splash down and the coaster tips over its first drop (metres along). */
  private readonly marks: { kind: 'splash' | 'drop'; s: number; every: boolean }[] = [];
  /** Where the front car is while a lift hauls it up (for the chain's clank), or null. */
  lifting: Point | null = null;
  /** A log splashed into the pool, or the train tipped over the top (where). */
  onMark: ((kind: 'splash' | 'drop', at: Vector3) => void) | null = null;
  private clock = 0;
  private doorOpen = 0;
  private readonly tilt = new Quaternion();
  private readonly rock = new Quaternion();
  private readonly ahead = new Vector3();
  private readonly seats: Object3D[] = [];
  /** Parts carrying only extra seats, and the first of those seats: hidden until the ride has that many seats. */
  private readonly extras: { node: Object3D; first: number }[] = [];
  private readonly riders = new Map<ParkVisitor, Object3D>();
  private readonly arm: Object3D | null;
  private readonly seen = new Vector3();
  private bumpCooldown = 0;

  constructor(
    private readonly ride: Ride,
    private readonly scene: Scene,
    /** The lake (for boats). */
    private readonly lake: Lake | null = null,
  ) {
    const name = ride.def.model;
    const model = signedModel(name);
    const skinned = rigidSkin(model, toyMaterial, name, skinnedToyMaterial);
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
    // Swing chairs tilt about the line round the canopy, so they fly outwards.
    for (const node of parts('chair')) {
      const out = new Vector3(node.position.x, 0, node.position.z).normalize();
      this.chairs.push({ node, axis: new Vector3(-out.z, 0, out.x) });
    }
    for (const node of parts('boat')) {
      this.berthOf.push(this.boats.length);
      this.boats.push({ node, home: node.position.clone() });
    }
    for (const node of parts('bat')) {
      const wings = ['l', 'r'].map((side) => model.getObjectByName(`${node.name}${side}`)).filter((w): w is Object3D => !!w);
      this.bats.push({ node, base: node.position.clone(), wings });
    }
    this.door = model.getObjectByName(`${name}_door`) ?? null;
    const wheel = model.getObjectByName(`${name}_wheel`);
    const gondolas = parts('gondola');
    if (wheel && gondolas.length > 0) {
      this.wheel = {
        spin: wheel,
        gondolas: gondolas.map((node) => ({ node, angle: Math.atan2(node.position.y, node.position.x) })),
        per: 1,
        from: 0,
        phase: ride.phase,
        speed: 0,
        swing: 0,
        swingSpeed: 0,
      };
      if (skinned) skinned.frustumCulled = false;
    }
    const ghost = model.getObjectByName(`${name}_ghost`);
    if (ghost) this.ghost = { node: ghost, base: ghost.position.y };
    // A track ride: its track drawn in the world, its cars and logs moved along it (far from the station, so never culled with it).
    const spot = ride.spot.track;
    if (ride.def.track && spot) {
      const track = new Track(spot, ride.def.track);
      this.track = track;
      const mesh = trackMesh(track, ride.spot.deck ? [ride.spot.deck] : []);
      this.solids.push(...trackSolids(track, ride.spot.deck ? [ride.spot.deck] : []));
      mesh.position.set(-ride.spot.at.x, 0, -ride.spot.at.z);
      this.group.add(mesh);
      if (skinned) skinned.frustumCulled = false;
      for (const node of [...parts('car'), ...parts('log')]) this.vehicles.push({ node, offset: node.position.x });
      const pool = model.getObjectByName(`${name}_pool`);
      if (pool && spot.pool) {
        pool.position.set(spot.pool.x - ride.spot.at.x, 0, spot.pool.z - ride.spot.at.z);
        this.marks.push({ kind: 'splash', s: track.nearest(spot.pool), every: true });
      }
      const top = spot.lifts?.[0];
      if (top && ride.def.track === 'coaster') this.marks.push({ kind: 'drop', s: track.marks[top[1] ?? 0]!, every: false });
      this.ride_();
    }
    this.seats.push(...parts('seat'));
    // Parts that only carry extra seats (the carousel's chariots, the coaster's fifth car) show once those seats are bought.
    for (const [i, seat] of this.seats.entries()) {
      if (i < ride.def.seats || !seat.parent || seat.parent === model) continue;
      const holder = seat.parent;
      const hasBase = this.seats.some((s, k) => k < ride.def.seats && s.parent === holder);
      if (hasBase) continue;
      const extra = this.extras.find((e) => e.node === holder);
      if (extra) extra.first = Math.min(extra.first, i);
      else this.extras.push({ node: holder, first: i });
    }
    // The ride's logic follows the seats where the model has them (cups spin, cars drive); a dark ride's are inside its door;
    // the big wheel's riders get on and off at the deck, into whichever gondola is down there.
    if (ride.def.inside) ride.seatAt = () => ride.steps;
    else if (this.wheel) {
      const wheel = this.wheel;
      wheel.per = Math.max(1, Math.round(this.seats.length / wheel.gondolas.length));
      const deck = { x: ride.spot.at.x, z: ride.spot.at.z };
      ride.seatAt = () => deck;
      ride.ready = (i) => {
        const gondola = wheel.gondolas[Math.floor(i / wheel.per)];
        return !!gondola && Math.abs(turnBy(wheel.spin.rotation.z, down(gondola.angle))) < WHEEL_AT_DECK;
      };
    } else if (this.seats.length >= ride.def.seats) {
      ride.seatAt = (i) => {
        const seat = this.seats[i];
        if (!seat) return ride.spot.at;
        seat.getWorldPosition(this.seen);
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
    // The swing chairs fly out as the canopy picks up speed (and sway a little).
    this.clock += dt;
    for (const [i, chair] of this.chairs.entries()) {
      const out = SWING_OUT * going * going + 0.04 * going * Math.sin(this.clock * 2.3 + i);
      chair.node.quaternion.copy(this.tilt.setFromAxisAngle(chair.axis, out));
    }
    this.drive(dt);
    this.ride_();
    this.turnWheel(dt);
    this.sail();
    this.haunt(dt);
    if (this.arm) {
      const t = ride.sinceLaunch;
      const swing = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.15) / 0.7);
      this.arm.rotation.x = LEVER_SWING * swing;
    }
    for (const extra of this.extras) extra.node.scale.setScalar(ride.seats.length > extra.first ? 1 : 0.0001);
    this.seatRiders();
  }

  /**
   * The big wheel: while it loads (or unloads) it brings each gondola in
   * turn down to the deck and stops there for its riders; a ride takes it
   * round twice, easing up to speed and back down. The gondolas hang level,
   * swinging a little as it starts and stops.
   */
  private turnWheel(dt: number): void {
    const { wheel, ride } = this;
    if (!wheel || dt <= 0) return;
    const before = wheel.spin.rotation.z;
    if (ride.phase === 'running') {
      if (wheel.phase !== 'running') wheel.from = before;
      const t = Math.min(1, ride.time / ride.cycle);
      wheel.spin.rotation.z = wheel.from - WHEEL_TURNS * 2 * Math.PI * eased(t, WHEEL_EASE);
    } else {
      // The gondola wanted at the deck: the next one with a seat to fill, or the next with riders to let off.
      const seat = ride.phase === 'loading' ? ride.seats.findIndex((v) => !v || v.step === 'boarding') : ride.seats.findIndex((v) => v?.step === 'seated');
      const gondola = seat >= 0 ? wheel.gondolas[Math.floor(seat / wheel.per)] : undefined;
      if (gondola) {
        const left = turnBy(before, down(gondola.angle));
        const step = Math.min(Math.abs(left), Math.min(WHEEL_SHIFT, Math.abs(left) * 4 + 0.05) * dt);
        wheel.spin.rotation.z = before + Math.sign(left) * step;
      }
    }
    wheel.phase = ride.phase;
    // The gondolas swing as the wheel speeds up or slows down (a damped spring), and hang level.
    const speed = (wheel.spin.rotation.z - before) / dt;
    const pull = (speed - wheel.speed) / dt;
    wheel.speed = speed;
    wheel.swingSpeed += (-18 * wheel.swing - 2.2 * wheel.swingSpeed - 0.35 * pull) * dt;
    wheel.swing = Math.max(-0.35, Math.min(0.35, wheel.swing + wheel.swingSpeed * dt));
    wheel.gondolas.forEach(({ node }, i) => {
      node.rotation.z = -wheel.spin.rotation.z + wheel.swing + 0.025 * Math.sin(this.clock * 1.3 + i * 0.9);
    });
  }

  /**
   * A track ride: while it runs, its train (or its logs) goes once round the
   * track, at the track's own pace (hauled up the lift, racing down the
   * drop) squeezed into the ride's time; parked in the station otherwise.
   */
  private ride_(): void {
    const { track, ride } = this;
    if (!track) return;
    const lap = ride.phase === 'running' ? track.distanceAt((ride.time / ride.cycle) * track.lapSeconds) : 0;
    const at = ride.spot.at;
    const floating = track.style === 'flume';
    this.vehicles.forEach(({ node, offset }, i) => {
      track.frame(offset + lap, this.seen, node.quaternion);
      let y = this.seen.y;
      // A log floats: it bobs and rocks a little on the water (still on the lift's belt, and down the drop).
      if (floating) {
        const level = Math.max(0, 1 - Math.abs(this.ahead.copy(AHEAD).applyQuaternion(node.quaternion).y) * 4);
        y += 0.035 * level * Math.sin(this.clock * 2.1 + i * 1.7);
        this.rock.setFromAxisAngle(AHEAD, 0.05 * level * Math.sin(this.clock * 1.6 + i * 2.3));
        node.quaternion.multiply(this.rock);
      }
      node.position.set(this.seen.x - at.x, y, this.seen.z - at.z);
    });
    // The front car on a lift: the chain clanks.
    this.lifting = null;
    const front = this.vehicles.reduce((a, b) => (b.offset > a.offset ? b : a), this.vehicles[0]!);
    const s = (((front.offset + lap) % track.length) + track.length) % track.length;
    if (ride.phase === 'running' && (track.spot.lifts ?? []).some(([a = 0, b = 0]) => s >= track.marks[a]! && s <= track.marks[b]!)) {
      front.node.getWorldPosition(this.seen);
      this.lifting = { x: this.seen.x, z: this.seen.z };
    }
    // The splash as each log comes down into the pool; the screams as the train tips over the top.
    if (lap > this.lap && this.onMark) {
      for (const mark of this.marks) {
        for (const { offset } of mark.every ? this.vehicles : this.vehicles.slice(-1)) {
          const due = (((mark.s - offset) % track.length) + track.length) % track.length;
          if (this.lap < due && due <= lap) {
            track.frame(offset + lap, this.seen, this.tilt);
            this.onMark(mark.kind, this.seen.clone());
          }
        }
      }
    }
    this.lap = lap;
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

  /**
   * Swan boats: while the ride runs, each boat with riders paddles out from
   * the jetty, round the lake (each on its own loop, a little in from the
   * last) and back to its mooring, bobbing as it goes.
   */
  private sail(): void {
    if (this.boats.length === 0 || !this.lake) return;
    const { ride } = this;
    const at = ride.spot.at;
    if (ride.phase === 'running' && !this.trips) this.trips = this.planTrips();
    // Back in: each boat stays where it moored.
    if (ride.phase !== 'running' && this.trips) {
      for (const trip of this.trips) this.berthOf[trip.boat] = trip.berth;
      this.trips = null;
    }
    this.boats.forEach((boat, i) => {
      const home = this.boats[this.berthOf[i]!]!.home;
      let x = at.x + home.x;
      let z = at.z + home.z;
      // Moored, a swan faces the way it was built (+z); under way, the way it's going.
      let heading = 0;
      const trip = this.trips?.find((t) => t.boat === i);
      if (trip) {
        const total = trip.along.at(-1)!;
        const window = ride.cycle - (this.boats.length - 1) * this.boatGap() - 0.3;
        const u = Math.min(1, Math.max(0, (ride.time - trip.start) / Math.max(0.5, window)));
        const s = total * eased(u, BOAT_EASE);
        const p = pointAlong(trip.path, trip.along, s);
        const q = pointAlong(trip.path, trip.along, Math.min(total, s + 0.3));
        x = p.x;
        z = p.z;
        if (s < total - 0.05) {
          const way = Math.atan2(q.x - p.x, q.z - p.z);
          // Turning out of the mooring, and back into it at the end.
          const turn = Math.min(1, s / BOAT_TURN_OUT, (total - s) / BOAT_TURN_IN);
          heading = turnBy(0, way) * smooth(Math.max(0, turn));
        }
      }
      boat.node.position.set(x - at.x, boat.home.y + 0.04 * Math.sin(this.clock * 2.4 + i * 1.3), z - at.z);
      boat.node.rotation.y = heading;
      boat.node.rotation.z = 0.04 * Math.sin(this.clock * 1.9 + i);
    });
  }

  /** The big wheel's turning part, and where its rim's bulbs are in its own terms (how far out, and how far forward), or null. */
  get wheelRim(): { node: Object3D; radius: number; front: number } | null {
    return this.wheel ? { node: this.wheel.spin, radius: WHEEL_RIM, front: WHEEL_RIM_FRONT } : null;
  }

  /** Seconds between one boat setting off and the next. */
  private boatGap(): number {
    return Math.min(BOAT_GAP, this.ride.cycle * BOAT_GAP_SHARE);
  }

  /**
   * One trip a boat, for a ride: out along its lane (the jetty's south side
   * or its north), once round the lake, and in along the same lane. The
   * outer boats go first, a lane each in turn, then the inner ones; the
   * first back in a lane takes its inner berth, so nobody passes through a
   * boat still moored. The boats keep their order round the lake, a gap
   * apart, and every one is back by the end of the ride.
   */
  private planTrips(): { boat: number; path: Point[]; along: number[]; start: number; berth: number }[] {
    const { ride, lake } = this;
    const at = ride.spot.at;
    const berths = this.boats.map((b) => b.home);
    const lane = (side: number) =>
      berths
        .map((home, berth) => ({ home, berth }))
        .filter(({ home }) => Math.sign(home.z) === side)
        .sort((a, b) => b.home.x - a.home.x)
        .map(({ berth }) => berth);
    const lanes = [lane(1), lane(-1)];
    const mouth = (side: number): Point => {
      const homes = berths.filter((h) => Math.sign(h.z) === side);
      return { x: at.x + Math.max(...homes.map((h) => h.x)) + BOAT_LANE, z: at.z + (homes[0]?.z ?? 0) };
    };
    const mouths = { north: mouth(-1), south: mouth(1) };
    const loop = new CatmullRomCurve3(
      [mouths.north, mouths.south, ...BOAT_LOOP.map(([u, v]) => ({ x: lake!.x + u * lake!.rx, z: lake!.z + v * lake!.rz }))].map((p) => new Vector3(p.x, 0, p.z)),
      true,
      'centripetal',
    )
      .getSpacedPoints(160)
      .slice(0, -1)
      .map((p) => ({ x: p.x, z: p.z }));
    const nearest = (p: Point) => loop.reduce((best, q, i) => (Math.hypot(q.x - p.x, q.z - p.z) < Math.hypot(loop[best]!.x - p.x, loop[best]!.z - p.z) ? i : best), 0);
    const out: number[] = [];
    const back: number[] = [];
    for (let k = 0; k < Math.max(lanes[0]!.length, lanes[1]!.length); k++) {
      for (const berthsIn of lanes) {
        if (k < berthsIn.length) {
          out.push(berthsIn[k]!);
          back.push(berthsIn[berthsIn.length - 1 - k]!);
        }
      }
    }
    const gap = this.boatGap();
    return out.map((berth, k) => {
      const boat = this.berthOf.indexOf(berth);
      const side = Math.sign(berths[berth]!.z);
      const m = side > 0 ? mouths.south : mouths.north;
      const from = nearest(m);
      const round = Array.from({ length: loop.length + 1 }, (_, j) => loop[(from + j) % loop.length]!);
      const home = (b: number): Point => ({ x: at.x + berths[b]!.x, z: at.z + berths[b]!.z });
      const path = [home(berth), m, ...round, m, home(back[k]!)];
      const along = [0];
      for (let j = 1; j < path.length; j++) along.push(along[j - 1]! + Math.hypot(path[j]!.x - path[j - 1]!.x, path[j]!.z - path[j - 1]!.z));
      return { boat, path, along, start: k * gap, berth: back[k]! };
    });
  }

  /** The haunted house: bats circle its towers (faster while it runs), the door swings open for riders, a ghost pops up. */
  private haunt(dt: number): void {
    const { ride } = this;
    const running = ride.phase === 'running';
    for (const [i, bat] of this.bats.entries()) {
      const t = this.clock * (running ? 2.6 : 1.3) + i * 2.1;
      bat.node.position.set(bat.base.x + Math.cos(t) * 1.3, bat.base.y + Math.sin(t * 2) * 0.25, bat.base.z + Math.sin(t) * 0.9);
      bat.node.rotation.y = -t;
      bat.wings.forEach((wing, k) => (wing.rotation.z = (k === 0 ? 1 : -1) * Math.sin(this.clock * 18 + i) * 0.9));
    }
    if (this.door) {
      const steps = ride.steps;
      const busy = ride.seats.some((v) => v && (v.step === 'boarding' || v.step === 'offRide') && Math.hypot(v.at.x - steps.x, v.at.z - steps.z) < 2.2);
      this.doorOpen += ((busy ? 1 : 0) - this.doorOpen) * Math.min(1, dt * 6);
      this.door.rotation.y = -1.5 * this.doorOpen;
    }
    if (this.ghost) {
      const rise = running ? Math.sin(Math.PI * Math.min(1, ride.time / ride.cycle)) : 0;
      this.ghost.node.position.y = this.ghost.base - 1.8 + 1.8 * smooth(Math.min(1, rise * 1.6)) + 0.12 * Math.sin(this.clock * 3);
    }
  }

  /** Riders sit on their seats (going round with them); off the ride, they're back on the ground. */
  private seatRiders(): void {
    const { ride } = this;
    const seated = new Set<ParkVisitor>();
    ride.seats.forEach((visitor, i) => {
      const avatar = visitor?.avatar as PersonAvatar | null | undefined;
      const seat = this.seats[i];
      if (!visitor || visitor.step !== 'seated' || !avatar) return;
      // A dark ride: in at the door, out of sight until they come out.
      if (this.ride.def.inside) {
        avatar.root.visible = false;
        seated.add(visitor);
        this.riders.set(visitor, this.group);
        return;
      }
      if (!seat) return;
      seated.add(visitor);
      if (this.riders.get(visitor) === seat) return;
      this.riders.set(visitor, seat);
      seat.add(avatar.root);
      const scale = avatar.root.scale.x;
      avatar.root.position.set(0, -SIT_HIP * scale, 0);
      avatar.root.rotation.set(0, this.facing(seat), 0);
      // Holding on (the bumper cars' wheels, the coaster's bar, a horse's pole, the cup's wheel) or sitting back, hands
      // in their lap (in a log, a gondola): one behind another in a log, arms out ahead read as riders lying down.
      avatar.riding = !this.wheel && this.track?.style !== 'flume';
      avatar.showShadow(false);
    });
    for (const [visitor, seat] of this.riders) {
      if (seated.has(visitor)) continue;
      this.riders.delete(visitor);
      const avatar = visitor.avatar as PersonAvatar | null;
      if (avatar && seat === this.group) {
        avatar.root.visible = true;
        continue;
      }
      if (!avatar || avatar.root.parent !== seat) continue;
      this.scene.add(avatar.root);
      avatar.root.rotation.set(0, avatar.root.rotation.y, 0);
      avatar.root.position.set(visitor.at.x, visitor.y, visitor.at.z);
      avatar.riding = false;
      avatar.showShadow(true);
    }
  }

  /** Which way a rider faces in `seat`, in its seat's own terms: a horse's nose, a cup's middle, a car's front. */
  private facing(seat: Object3D): number {
    // A log or a coaster car: facing the way it goes. A big wheel's gondola: facing out, towards the camera.
    if (this.track) return Math.PI / 2;
    if (this.wheel) return 0;
    if (this.bobbers.length > 0 && this.spin) {
      const p = this.spin.worldToLocal(seat.getWorldPosition(this.seen));
      const a = Math.atan2(-p.z, p.x);
      return Math.atan2(-Math.sin(a), -Math.cos(a));
    }
    if (this.cups.length > 0) return Math.atan2(-seat.position.x, -seat.position.z);
    // A swing chair faces the way it flies round: across its line out from the middle.
    if (this.chairs.length > 0) {
      const out = seat.parent!.position;
      return Math.atan2(out.z, -out.x);
    }
    return 0;
  }
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** How far through a ride (0..1) at `t` (0..1) that speeds up steadily over the first `ease` of it, and slows down over the last. */
function eased(t: number, ease: number): number {
  const total = 1 - ease;
  if (t < ease) return (t * t) / (2 * ease) / total;
  if (t <= 1 - ease) return (t - ease / 2) / total;
  return (total - ((1 - t) * (1 - t)) / (2 * ease)) / total;
}

/** The big wheel's turn (radians) that brings the gondola at `angle` down to the bottom. */
function down(angle: number): number {
  return -Math.PI / 2 - angle;
}

/** The shorter way round from turn `from` to turn `to` (radians, -π..π). */
function turnBy(from: number, to: number): number {
  const d = (to - from) % (2 * Math.PI);
  return d > Math.PI ? d - 2 * Math.PI : d < -Math.PI ? d + 2 * Math.PI : d;
}

/** The point `s` metres along a path (whose points are `along` metres along it). */
function pointAlong(path: Point[], along: number[], s: number): Point {
  let j = 1;
  while (j < path.length - 1 && along[j]! < s) j++;
  const a = path[j - 1]!;
  const b = path[j]!;
  const t = Math.min(1, Math.max(0, (s - along[j - 1]!) / Math.max(1e-6, along[j]! - along[j - 1]!)));
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

/** Where a sign or a ring floats over a ride: above its middle. */
export function overRide(ride: Ride, height: number): Vector3 {
  const at: Point = ride.def.sign === 'steps' ? ride.steps : ride.spot.at;
  return new Vector3(at.x, height, at.z);
}
