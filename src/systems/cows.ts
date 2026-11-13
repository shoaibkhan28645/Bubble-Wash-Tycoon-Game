// The cows in their pasture, as they move (Chapter 2). No drawing here: each
// cow works out where she is and how she holds herself, and the rig
// (render/models/cowRig.ts) puts her model's joints there.
//
// Grounded: a hoof that's down stays exactly where it was put while her body
// moves over it; her legs bend at the knee to reach it (and to lift it, one leg
// at a time, in a walking cow's order: hind, fore on the same side, the other
// hind, the other fore). Standing, she shifts a foot that's out of place.
// Smooth: she speeds up and slows down, turns in an arc, and every joint eases
// to where it's going. Engaging: she grazes with her muzzle in the grass,
// tugging and chewing and shuffling on a step; chews the cud; looks about;
// moos with her head up; kneels down front first to lie and doze, and gets up
// hind first; eats at the trough at feeding time; and when the hero comes by
// she lifts her head, pricks her ears, and often walks over to the fence.
import type { Point, Rect } from '../core/config';

/** Where the cow model's joints are (art/blender/farm.py, cow(): keep the two in step). Metres; x to her left, z forward. */
export const COW = {
  /** Hips: fore left, fore right, hind left, hind right (the model's leg_fl, leg_fr, leg_bl, leg_br). */
  hips: [
    { x: -0.25, z: 0.5 },
    { x: 0.25, z: 0.5 },
    { x: -0.25, z: -0.55 },
    { x: 0.25, z: -0.55 },
  ],
  hipHeight: 0.78,
  thigh: 0.38,
  shin: 0.4,
  /** The neck turns at the shoulders; the head at the poll, this far on; her mouth this far on again. */
  shoulder: { y: 1.16, z: 0.62 },
  neck: { y: 0.2, z: 0.42 },
  mouth: { y: -0.32, z: 0.54 },
  /** Room she takes up (other cows keep twice this between middles). */
  radius: 0.95,
} as const;

/** What a cow is doing. */
export type CowAct = 'walk' | 'graze' | 'chew' | 'look' | 'moo' | 'lieDown' | 'lying' | 'getUp' | 'greet' | 'eat';

/** How a cow holds herself this frame: where the rig puts each joint (radians; metres). */
export interface CowPose {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  roll: number;
  /** Each leg: out to the side at the hip, the thigh's swing (forward is negative), the knee's bend. */
  legs: { abduct: number; hip: number; knee: number }[];
  /** Neck and head: down is positive. */
  neckPitch: number;
  neckYaw: number;
  headPitch: number;
  headYaw: number;
  headRoll: number;
  jawOpen: number;
  jawSlide: number;
  /** Each ear's droop (flicks), and how far both are turned forward. */
  ears: [number, number];
  earsTurn: number;
  /** 0 open, 1 shut. */
  blink: number;
  tail: number;
  tailTip: number;
  tailLift: number;
  /** -1..1: her sides swell as she breathes. */
  breath: number;
}

/** What a cow needs to know of her pasture each frame. */
export interface Pasture {
  run: Rect;
  trough: Point;
  /** There's feed in the trough. */
  fed: boolean;
  /** Where the hero is (null: nobody about). */
  hero: Point | null;
  others: readonly Cow[];
}

/** Walking speed (m/s), a grazing shuffle, and how quickly she picks up speed and slows. */
const WALK = 0.55;
const SHUFFLE = 0.2;
const ACCEL = 0.6;
const DECEL = 0.9;
/** How fast she turns (radians a second) and how quickly she starts and stops turning. */
const TURN = 1.1;
const TURN_ACCEL = 3.5;
/** A walking stride (metres a full cycle of the four legs), and the share of it each hoof is down. */
const STRIDE = 0.72;
const DUTY = 0.68;
/** When in the cycle each leg lifts (fore left, fore right, hind left, hind right): hind, then the fore on its side. */
const OFFSETS = [0.25, 0.75, 0, 0.5];
/** How high a hoof lifts (fore, hind). */
const LIFT = [0.11, 0.085];
/** Turning counts as walking this far a radian (her hooves go round her middle); on the spot she turns no faster than this. */
const TURN_REACH = 0.6;
const TURN_STANDING = 0.7;
/** Setting off, her first strides are short (this long), lengthening over this far. */
const FIRST_STRIDE = 0.3;
const STRIDE_UP = 0.9;
/** Standing, a hoof this far from under its hip is put right. */
const OUT_OF_PLACE = 0.09;
/** A hoof this far from under its hip is lifted at once, whatever the cycle says. */
const OVERSTRETCHED = 0.29;
/**
 * She stands tall: each end of her rides as high as its legs allow, all but straight (this much of their
 * length, the forelegs; her hocks keep a little more bend), so her body dips as her legs reach out in a
 * stride and rises over each planted hoof. It sinks quickly when a leg needs the room and rises gently.
 */
const STRAIGHT = 0.985;
const STAND_DROP = 0.012;
const HOCK_DROP = 0.028;
const SINK = 30;
const RISE = 7;
/** Lying down (hips and shoulders). */
const LIE_DROP = 0.5;
/** Grazing, her shoulders dip this much more; her mouth reaches this far ahead of her shoulders, at this height. */
const GRAZE_DIP = 0.02;
const GRAZE_REACH = 0.28;
/** Grazing, she stands with one forefoot ahead and the other back (which lowers her shoulders, legs all but straight). */
const GRAZE_STANCE = [0.22, -0.2];
/** Lying, her hind hooves are tucked this far forward under her (she draws them in as she goes down, and sets them back to get up). */
const TUCK = 0.4;
const GRASS = 0.05;
/** Kept this far inside the fence; a cow come to see the hero stands closer. */
const MARGIN = 1.1;
const FENCE = 0.85;
/** The trough: kept clear of its middle by this much; she stands this far from it to eat, at one of these places along it. */
const TROUGH_CLEAR = 1.25;
const TROUGH_STAND = 1.18;
const TROUGH_PLACES = [-0.63, 0.63];
const TROUGH_TOP = 0.5;
/** She notices the hero this close to the pasture's fence, and not again for a while. */
const NOTICE = 3;
const NOTICE_EVERY = 14;
/** A cow moos at most this often (seconds). */
const MOO_EVERY = 18;
/** Lying down and getting up take this long; she doesn't lie down again for a while. */
const LIE_SECONDS = 1.9;
const LIE_EVERY = 40;

/** Half a cow's body's width; her body is a line this long down her middle with that much round it. */
const BODY = 0.42;
const SPINE = 0.38;
/** Hemmed in, she backs off a few steps: how fast, and for how long. */
const BACK_PACE = 0.26;
const BACK_SECONDS = 1.7;

/** Down her back (her body's middle line), and on along her neck to her nose: how far ahead of her middle. */
const BACK = [-SPINE, -SPINE / 2, 0, SPINE / 2, SPINE];
const NECK = [0.64, 0.9, 1.15, 1.4];
/** Her neck and head are that much narrower than her body (so may come that much nearer another cow). */
const NECK_SLIM = 0.22;

/**
 * How far apart a cow standing at (x, z) facing `heading` and another's middles are, body to body (0.84:
 * touching). Heads may count too: hers (`mine`: she doesn't walk her head into another cow's side), or
 * both (`both`: nor stand where the other's head is).
 */
function bodiesApart(x: number, z: number, heading: number, other: Cow, heads: 'none' | 'mine' | 'both' = 'both'): number {
  // Far apart: no need to look closely (they're at least this far from touching).
  const middles = Math.hypot(x - other.x, z - other.z);
  if (middles > 3.2) return middles - 1.8;
  const [s, c] = [Math.sin(heading), Math.cos(heading)];
  const [os, oc] = [Math.sin(other.heading), Math.cos(other.heading)];
  let least = Infinity;
  const gap = (mine: number, hers: number) => Math.hypot(x + s * mine - (other.x + os * hers), z + c * mine - (other.z + oc * hers));
  for (const mine of BACK) {
    for (const hers of BACK) least = Math.min(least, gap(mine, hers));
    if (heads === 'both') for (const hers of NECK) least = Math.min(least, gap(mine, hers) + NECK_SLIM);
  }
  if (heads !== 'none') for (const mine of NECK) for (const hers of BACK) least = Math.min(least, gap(mine, hers) + NECK_SLIM);
  return least;
}

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
/** The angle from `from` to `to`, the short way round. */
const angleTo = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
/** Eases `from` towards `to` (the faster the bigger `rate`), whatever the frame rate. */
const toward = (from: number, to: number, rate: number, dt: number) => from + (to - from) * (1 - Math.exp(-rate * dt));

interface Foot {
  x: number;
  z: number;
  /** Lifted this high now (0: down). */
  lift: number;
  /** Swinging: from, to, how far through (0–1) and how long it takes; null while it's down. */
  swing: { fromX: number; fromZ: number; toX: number; toZ: number; u: number; seconds: number; home: boolean } | null;
  /** Which stride it last lifted in. */
  stepped: number;
}

export class Cow {
  x: number;
  z: number;
  heading: number;
  speed = 0;
  /** How fast she's turning (radians a second). */
  turning = 0;
  act: CowAct = 'look';
  /** Seconds into what she's doing, and how long it lasts. */
  actTime = 0;
  actFor = 2;
  /** Where she's walking to, which way she'll face there, and what she'll do. */
  private target: Point;
  private face: number | null = null;
  private intent: CowAct = 'graze';
  /** Walking no faster than this (a grazing shuffle is slow). */
  private pace = WALK;
  readonly feet: Foot[];
  private cycle = 0;
  /** Seconds she has stood still (hooves are put right after a moment), and how far she has come since. */
  private stood = 0;
  private come = 0;
  /** How far her body is carried forward of where she stands (tipping forward, she tips about her middle). */
  private shift = 0;
  private shoulderDrop = STAND_DROP;
  private hipDrop = HOCK_DROP;
  /** Which forefoot is forward as she grazes (0: left). */
  private lead = 0;
  /** How far ahead of its hip each hoof belongs now: a forefoot eases out as she starts to graze (and back after); the hind hooves tuck under her as she lies. */
  private readonly stance = [0, 0, 0, 0];
  /** How low her shoulders and hips were when she began what she's doing (she lies down from there). */
  private from: [number, number] = [STAND_DROP, HOCK_DROP];
  private roll = 0;
  private time: number;
  /** When she last mooed, noticed the hero and lay down. */
  private mooed = -MOO_EVERY;
  private noticed = -NOTICE_EVERY;
  private lay = -LIE_EVERY;
  /** Grazing: seconds to her next tug at the grass and her next shuffle on; how far through a tug she is. */
  private tugIn = 1;
  private tug = 0;
  private shuffleIn = 4;
  /** Lying: dozing (head down, eyes shut). */
  private dozing = false;
  /** Little things: seconds to the next blink, ear flicks and tail flick; how far through each. */
  private blinkIn = 2;
  private blinking = 0;
  private earIn: [number, number] = [1.5, 3];
  private earFlick: [number, number] = [0, 0];
  private tailIn = 3;
  private tailFlick = 0;
  private tailSide = 1;
  private tilt = 0;
  private tiltIn = 2;
  private droop = 0;
  /** How fast her neck and head are swinging to where they're going. */
  private readonly swing = { neckPitch: 0, headPitch: 0, neckYaw: 0, headYaw: 0, headRoll: 0 };
  /** Seconds she has been walking but getting nowhere (someone's in the way), and whether she was held back last frame. */
  private stuck = 0;
  private blocked = false;
  /** Backing off: how much longer, and which way she swings her rump as she goes. */
  private backing = 0;
  private backTurn = 0;
  private backed = false;
  /** Carrying her head round to one side (-1, 1) because another cow's where it would be; 0: not. */
  private aside = 0;
  /** Whether she's mooed in this moo (the sound comes once her head's up). */
  private sounded = false;
  readonly pose: CowPose;
  /** How far past its reach each leg is this frame (0: the hoof is drawn where it's planted). */
  readonly stretch = [0, 0, 0, 0];

  constructor(
    at: Point,
    heading: number,
    private readonly random: () => number = Math.random,
    /** She moos (the sound, a word over her head). */
    private readonly onMoo: (cow: Cow) => void = () => {},
  ) {
    this.x = at.x;
    this.z = at.z;
    this.heading = heading;
    this.target = { ...at };
    this.time = random() * 20;
    this.feet = COW.hips.map((hip) => ({ ...this.under(hip), lift: 0, swing: null, stepped: 0 }));
    this.pose = {
      x: at.x,
      y: 0,
      z: at.z,
      heading,
      pitch: 0,
      roll: 0,
      legs: COW.hips.map(() => ({ abduct: 0, hip: 0, knee: 0 })),
      neckPitch: 0,
      neckYaw: 0,
      headPitch: 0,
      headYaw: 0,
      headRoll: 0,
      jawOpen: 0,
      jawSlide: 0,
      ears: [0, 0],
      earsTurn: 0,
      blink: 0,
      tail: 0,
      tailTip: 0,
      tailLift: 0,
      breath: 0,
    };
    this.actFor = 0.5 + random() * 2.5;
    this.carry(0);
  }

  /** Lying down (or on her way down or up): she stays where she is. */
  get down(): boolean {
    return this.act === 'lieDown' || this.act === 'lying' || this.act === 'getUp';
  }

  /** Where she means to be (others keep clear of it). */
  get goal(): Point {
    return this.act === 'walk' ? this.target : { x: this.x, z: this.z };
  }

  /** At the trough, or on her way to it. */
  get feeding(): boolean {
    return this.act === 'eat' || (this.act === 'walk' && this.intent === 'eat');
  }

  /** The ground under a hip, as she stands now. */
  private under(hip: { x: number; z: number }, heading = this.heading): { x: number; z: number } {
    const [s, c] = [Math.sin(heading), Math.cos(heading)];
    const z = hip.z + this.shift;
    return { x: this.x + hip.x * c + z * s, z: this.z - hip.x * s + z * c };
  }

  /** Where hoof `i` belongs as she stands: under its hip, but grazing, one forefoot ahead and the other back. */
  private place(i: number): { x: number; z: number } {
    const hip = COW.hips[i]!;
    return { x: hip.x, z: hip.z + this.stance[i]! };
  }

  update(dt: number, pasture: Pasture): void {
    this.time += dt;
    this.actTime += dt;
    this.decide(pasture);
    this.travel(dt, pasture);
    this.step(dt);
    this.carry(dt);
    this.hold(dt, pasture);
  }

  // --- What she does ------------------------------------------------------

  private begin(act: CowAct, seconds: number): void {
    this.act = act;
    this.actTime = 0;
    this.actFor = seconds;
    this.sounded = false;
    this.from = [this.shoulderDrop, this.hipDrop];
    if (act === 'graze') {
      this.lead = this.random() < 0.5 ? 0 : 1;
      this.tugIn = 0.6 + this.random() * 0.8;
      this.shuffleIn = 3 + this.random() * 3;
    }
  }

  private walkTo(target: Point, intent: CowAct, face: number | null = null, pace = WALK): void {
    this.target = target;
    this.intent = intent;
    this.face = face;
    this.pace = pace;
    this.backed = false;
    this.backing = 0;
    this.begin('walk', 30);
  }

  private decide(pasture: Pasture): void {
    const { hero, run } = pasture;
    const heroNear = hero ? Math.hypot(Math.max(run.minX - hero.x, 0, hero.x - run.maxX), Math.max(run.minZ - hero.z, 0, hero.z - run.maxZ)) : Infinity;
    // The hero comes by: she looks up from what she's doing (not from a nap, or when she's off somewhere).
    if (heroNear < NOTICE && this.time - this.noticed > NOTICE_EVERY && (this.act === 'graze' || this.act === 'chew' || this.act === 'look')) {
      this.noticed = this.time;
      // Often she walks over to the fence for a closer look.
      const spot = hero && this.random() < 0.6 ? this.byFence(hero, pasture) : null;
      if (spot && hero) this.walkTo(spot, 'greet', Math.atan2(hero.x - spot.x, hero.z - spot.z));
      else this.begin('greet', 3.5 + this.random() * 3);
      return;
    }
    switch (this.act) {
      case 'walk':
        if (this.arrived()) this.arrive(pasture);
        // Something in the way for a while (or she's been at it too long): think again.
        else if (this.actTime > this.actFor || this.stuck > 2.5) this.next(pasture);
        return;
      case 'lieDown':
        if (this.actTime >= LIE_SECONDS) {
          this.begin('lying', 10 + this.random() * 12);
          this.dozing = this.random() < 0.45;
        }
        return;
      case 'lying':
        // Up for the feed, or when she's had her rest.
        if (this.actTime >= this.actFor || (pasture.fed && this.actTime > 3 && this.random() < 0.01)) this.begin('getUp', LIE_SECONDS);
        return;
      case 'getUp':
        if (this.actTime >= LIE_SECONDS) {
          this.lay = this.time;
          this.next(pasture);
        }
        return;
      case 'greet':
        // She watches as long as the hero's about (a while), then goes back to her day.
        if (this.actTime >= this.actFor || (heroNear > NOTICE + 2 && this.actTime > 1.5)) this.next(pasture);
        return;
      case 'graze':
        if (this.actTime >= this.actFor) this.next(pasture);
        return;
      default:
        if (this.actTime >= this.actFor) this.next(pasture);
    }
  }

  /** What next: mostly grazing somewhere new; now and then the cud, a look about, a moo, a lie down; the trough when it's full. */
  private next(pasture: Pasture): void {
    const roll = this.random();
    if (pasture.fed && roll < 0.5) {
      const place = this.atTrough(pasture);
      if (place) {
        this.walkTo(place.at, 'eat', place.face);
        return;
      }
    }
    const pick = this.random();
    if (pick < 0.5) {
      const spot = this.spot(pasture);
      if (spot) this.walkTo(spot, 'graze');
      else this.begin('graze', 5 + this.random() * 5);
    } else if (pick < 0.63) this.begin('chew', 4 + this.random() * 4);
    else if (pick < 0.76) this.begin('look', 3 + this.random() * 3);
    else if (pick < 0.86 && this.time - this.mooed > MOO_EVERY) this.begin('moo', 2.4);
    else if (pick < 0.97 && this.time - this.lay > LIE_EVERY && this.clear(pasture, { x: this.x, z: this.z }, 1.9)) this.begin('lieDown', LIE_SECONDS);
    else this.begin('chew', 3 + this.random() * 3);
  }

  private arrived(): boolean {
    const dist = Math.hypot(this.target.x - this.x, this.target.z - this.z);
    if (dist > 0.1 || Math.abs(this.speed) > 0.06 || this.backing > 0) return false;
    return this.face === null || (Math.abs(angleTo(this.heading, this.face)) < 0.05 && Math.abs(this.turning) < 0.15);
  }

  private arrive(pasture: Pasture): void {
    switch (this.intent) {
      case 'eat':
        this.begin('eat', pasture.fed ? 5 + this.random() * 5 : 0.5);
        break;
      case 'greet':
        this.begin('greet', 5 + this.random() * 4);
        break;
      default:
        // Grazing with her head through the fence (or in the trough) won't do: she turns to the pasture first.
        if (!this.canGraze(pasture, this, this.heading)) {
          const { run } = pasture;
          const middle = Math.atan2((run.minX + run.maxX) / 2 - this.x, (run.minZ + run.maxZ) / 2 - this.z);
          for (const turn of [0, 0.5, -0.5, 1, -1]) {
            if (!this.canGraze(pasture, this, middle + turn)) continue;
            this.walkTo({ x: this.x, z: this.z }, 'graze', middle + turn);
            return;
          }
        }
        this.begin('graze', 6 + this.random() * 7);
    }
  }

  /** Nobody else is (or is heading) within `room` of a spot (`beside`: a cow at the trough too may be this near, side by side). */
  private clear(pasture: Pasture, at: Point, room: number, beside = room): boolean {
    return pasture.others.every((o) => {
      if (o === this) return true;
      const keep = o.feeding ? beside : room;
      return Math.hypot(o.x - at.x, o.z - at.z) > keep && Math.hypot(o.goal.x - at.x, o.goal.z - at.z) > keep;
    });
  }

  /** Her mouth, grazing here facing `heading`, would be inside the fence and clear of the trough. */
  private canGraze(pasture: Pasture, at: Point, heading: number): boolean {
    const { run, trough } = pasture;
    const far = COW.shoulder.z + GRAZE_REACH + 0.25;
    const x = at.x + Math.sin(heading) * far;
    const z = at.z + Math.cos(heading) * far;
    return x > run.minX + 0.3 && x < run.maxX - 0.3 && z > run.minZ + 0.3 && z < run.maxZ - 0.3 && Math.hypot(x - trough.x, z - trough.z) > 1.2;
  }

  /** Somewhere in the pasture to graze: inside the fence, clear of the trough and of the others (well clear if there's room; a body's width if not). */
  private spot(pasture: Pasture): Point | null {
    const { run, trough } = pasture;
    for (const room of [COW.radius * 2 + 0.4, COW.radius * 2 - 0.1]) {
      for (let i = 0; i < 12; i++) {
        const at = { x: run.minX + MARGIN + this.random() * (run.maxX - run.minX - MARGIN * 2), z: run.minZ + MARGIN + this.random() * (run.maxZ - run.minZ - MARGIN * 2) };
        if (Math.hypot(at.x - trough.x, at.z - trough.z) < TROUGH_CLEAR + 0.5) continue;
        if (Math.hypot(at.x - this.x, at.z - this.z) < 1.2) continue;
        if (this.clear(pasture, at, room)) return at;
      }
    }
    return null;
  }

  /** The spot just inside the fence nearest the hero (if it's free and not at the trough). */
  private byFence(hero: Point, pasture: Pasture): Point | null {
    const { run, trough } = pasture;
    const at = { x: clamp(hero.x, run.minX + FENCE, run.maxX - FENCE), z: clamp(hero.z, run.minZ + FENCE, run.maxZ - FENCE) };
    if (Math.hypot(at.x - trough.x, at.z - trough.z) < TROUGH_CLEAR + 0.3) return null;
    // The hero's on the far side of the pasture's middle from the fence? (Inside the run: nowhere to go.)
    if (Math.hypot(at.x - hero.x, at.z - hero.z) < 0.4) return null;
    return this.clear(pasture, at, COW.radius * 2) ? at : null;
  }

  /** A free place at the trough, facing it. */
  private atTrough(pasture: Pasture): { at: Point; face: number } | null {
    const { run, trough } = pasture;
    const places: { at: Point; face: number }[] = [];
    for (const side of [-1, 1]) {
      for (const along of TROUGH_PLACES) {
        const at = { x: trough.x + along, z: trough.z + side * TROUGH_STAND };
        if (at.x < run.minX + 0.6 || at.x > run.maxX - 0.6 || at.z < run.minZ + FENCE || at.z > run.maxZ - FENCE) continue;
        const face = side < 0 ? 0 : Math.PI;
        // Free: nobody's body where she'd stand, and nobody else on their way there.
        const free = pasture.others.every((o) => o === this || (bodiesApart(at.x, at.z, face, o) > BODY * 2 + 0.15 && Math.hypot(o.goal.x - at.x, o.goal.z - at.z) > 1.0));
        if (free) places.push({ at, face });
      }
    }
    if (places.length === 0) return null;
    return places.reduce((best, p) => (Math.hypot(p.at.x - this.x, p.at.z - this.z) < Math.hypot(best.at.x - this.x, best.at.z - this.z) ? p : best));
  }

  // --- Getting about ------------------------------------------------------

  private travel(dt: number, pasture: Pasture): void {
    let wantSpeed = 0;
    let wantTurn = 0;
    if (this.act === 'walk' || (this.act === 'graze' && this.shuffling(dt, pasture))) {
      const dx = this.target.x - this.x;
      const dz = this.target.z - this.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.08) {
        const way = this.steer(dx / dist, dz / dist, dist, pasture);
        const off = angleTo(this.heading, Math.atan2(way.x, way.z));
        wantTurn = clamp(off * 2.5, -TURN, TURN);
        // She walks once she's mostly facing the way she's going; slows to stop where she's going, and for anyone in the way.
        const facing = Math.abs(off) > 1.1 ? 0 : Math.cos(off) ** 2;
        wantSpeed = Math.min(this.pace * facing, Math.sqrt(2 * DECEL * 0.6 * Math.max(0, dist - 0.04)), way.room);
      } else if (this.face !== null) wantTurn = angleTo(this.heading, this.face) * 2.5;
    } else if (this.act === 'greet' && pasture.hero) {
      // The hero's round behind her: she turns to see.
      const off = angleTo(this.heading, Math.atan2(pasture.hero.x - this.x, pasture.hero.z - this.z));
      if (Math.abs(off) > 1.0) wantTurn = clamp(off * 1.5, -TURN * 0.7, TURN * 0.7);
    }
    // Hemmed in (someone's in her way, and she can't turn clear): she backs off a few steps and tries again.
    if (this.act === 'walk' && this.backing <= 0 && !this.backed && this.stuck > 1.1 && this.roomBehind(pasture) > 0.35) {
      this.backing = BACK_SECONDS;
      this.backed = true;
      this.backTurn = (this.random() < 0.5 ? -1 : 1) * 0.22;
      this.stuck = 0;
    }
    if (this.backing > 0) {
      this.backing = this.act === 'walk' && this.roomBehind(pasture) > 0.12 ? this.backing - dt : 0;
      wantSpeed = this.backing > 0.45 ? -BACK_PACE : 0;
      wantTurn = this.backing > 0.45 ? this.backTurn : 0;
    }
    // On the spot she turns slowly (her hooves have to keep up); walking, in an arc.
    const most = TURN_STANDING + (TURN - TURN_STANDING) * Math.min(1, Math.abs(this.speed) / 0.3);
    wantTurn = clamp(wantTurn, -most, most);
    if (this.blocked) wantSpeed = wantTurn = 0;
    this.stuck = this.act === 'walk' && this.backing <= 0 && (this.blocked || (Math.abs(this.speed) < 0.03 && Math.abs(this.turning) < 0.1)) ? this.stuck + dt : 0;
    this.turning += clamp(wantTurn - this.turning, -TURN_ACCEL * dt, TURN_ACCEL * dt);
    this.speed += clamp(wantSpeed - this.speed, -DECEL * dt, ACCEL * dt);
    if (Math.abs(this.speed) < 1e-4) this.speed = 0;
    // Bodies are solid: she doesn't walk or swing her rump into another cow, nor walk her head into one's side
    // (she stops, and thinks again). Her head's no bar to turning where she stands: she'd carry it clear.
    const heading = this.heading + this.turning * dt;
    const x = this.x + Math.sin(heading) * this.speed * dt;
    const z = this.z + Math.cos(heading) * this.speed * dt;
    const into = (nx: number, nz: number, nh: number, heads: 'none' | 'mine') =>
      pasture.others.some((o) => {
        if (o === this) return false;
        const then = bodiesApart(nx, nz, nh, o, heads);
        return then < BODY * 2 + 0.04 && then < bodiesApart(this.x, this.z, this.heading, o, heads) - 1e-6;
      });
    // (Held back, she isn't going anywhere: her speed and her turn die away as they would stopping.)
    this.blocked = false;
    if (!into(x, z, heading, this.speed > 0 ? 'mine' : 'none')) {
      this.heading = heading;
      this.x = x;
      this.z = z;
    } else if (!into(this.x, this.z, heading, 'none')) {
      this.heading = heading;
      this.blocked = true;
    } else this.blocked = true;
    // Never through the fence or the trough (her way keeps her clear of them anyway).
    const { run, trough } = pasture;
    this.x = clamp(this.x, run.minX + FENCE * 0.8, run.maxX - FENCE * 0.8);
    this.z = clamp(this.z, run.minZ + FENCE * 0.8, run.maxZ - FENCE * 0.8);
    const off = Math.hypot(this.x - trough.x, this.z - trough.z);
    if (off < TROUGH_CLEAR - 0.25 && off > 1e-3) {
      this.x = trough.x + ((this.x - trough.x) / off) * (TROUGH_CLEAR - 0.25);
      this.z = trough.z + ((this.z - trough.z) / off) * (TROUGH_CLEAR - 0.25);
    }
  }

  /** How far she could back straight off: to the fence, the trough, or another cow behind her. */
  private roomBehind(pasture: Pasture): number {
    const { run, trough } = pasture;
    const [s, c] = [Math.sin(this.heading), Math.cos(this.heading)];
    let room = 0;
    // (A cow already at her side is no bar, so long as backing doesn't bring them nearer.)
    const gaps = pasture.others.map((o) => (o === this ? Infinity : bodiesApart(this.x, this.z, this.heading, o, 'none')));
    for (; room < 0.8; room += 0.1) {
      const x = this.x - s * (room + 0.1);
      const z = this.z - c * (room + 0.1);
      if (x < run.minX + FENCE || x > run.maxX - FENCE || z < run.minZ + FENCE || z > run.maxZ - FENCE) break;
      if (Math.hypot(x - trough.x, z - trough.z) < TROUGH_CLEAR - 0.2) break;
      const into = pasture.others.some((o, i) => {
        if (o === this) return false;
        const gap = bodiesApart(x, z, this.heading, o, 'none');
        const nearer = gap < gaps[i]! - 1e-6;
        gaps[i] = gap;
        return nearer && gap < BODY * 2 + 0.1;
      });
      if (into) break;
    }
    return room;
  }

  /** Grazing, she shuffles on a step or two now and then, head still down. True while she's shuffling. */
  private shuffling(dt: number, pasture: Pasture): boolean {
    if (this.pace === SHUFFLE && Math.hypot(this.target.x - this.x, this.target.z - this.z) > 0.08) return true;
    this.shuffleIn -= dt;
    if (this.shuffleIn > 0 || this.actFor - this.actTime < 2) return false;
    this.shuffleIn = 3.5 + this.random() * 4;
    // A step or two on, a little to one side: only where there's room.
    const turn = (this.random() - 0.5) * 1.2;
    const far = 0.45 + this.random() * 0.35;
    const at = { x: this.x + Math.sin(this.heading + turn) * far, z: this.z + Math.cos(this.heading + turn) * far };
    const { run, trough } = pasture;
    const inside = at.x > run.minX + MARGIN && at.x < run.maxX - MARGIN && at.z > run.minZ + MARGIN && at.z < run.maxZ - MARGIN;
    // (Her head reaches a metre ahead of her: clear of the others by that much more.)
    if (!inside || Math.hypot(at.x - trough.x, at.z - trough.z) < TROUGH_CLEAR + 0.6 || !this.clear(pasture, at, COW.radius * 2 + 0.5)) return false;
    if (!this.canGraze(pasture, at, this.heading + turn)) return false;
    this.target = at;
    this.face = null;
    this.pace = SHUFFLE;
    return true;
  }

  /**
   * The way to go: towards where she's going, round the trough and the other cows; and how fast
   * she may go for the room ahead (`room`).
   */
  private steer(tx: number, tz: number, dist: number, pasture: Pasture): { x: number; z: number; room: number } {
    let x = tx;
    let z = tz;
    let room = Infinity;
    const round = (ox: number, oz: number, keep: number, cow: Cow | null = null) => {
      const ax = this.x - ox;
      const az = this.z - oz;
      const d = Math.hypot(ax, az) || 1e-3;
      const near = keep + 0.9;
      if (d > near) return;
      // Walking at it, she slows as she nears it and stops short (of a cow: of her body, however she's standing).
      const closing = -(Math.sin(this.heading) * ax + Math.cos(this.heading) * az) / d;
      if (closing > 0.3) room = Math.min(room, Math.max(0, (d - keep) * 1.5));
      if (cow) {
        // Would a step on bring them nearer, body to body (heads count)? Then she has only the room between them.
        const now = bodiesApart(this.x, this.z, this.heading, cow);
        const then = bodiesApart(this.x + Math.sin(this.heading) * 0.3, this.z + Math.cos(this.heading) * 0.3, this.heading, cow);
        const nearing = (now - then) / 0.3;
        if (nearing > 0.05) room = Math.min(room, (Math.max(0, now - BODY * 2 - 0.1) * 1.5) / Math.max(nearing, 0.25));
      }
      // Where she's going is this side of it: nothing to go round.
      if (dist < d - keep * 0.5) return;
      const push = (near - d) / 0.9;
      // Away from it, and round it on the side she's already heading, unless there's no room that side (the fence).
      let side = ax * tz - az * tx >= 0 ? 1 : -1;
      const { run } = pasture;
      const fits = (k: number) => {
        const px = ox + (ax / d) * 0.3 * keep + (az / d) * k * (keep + 0.5);
        const pz = oz + (az / d) * 0.3 * keep - (ax / d) * k * (keep + 0.5);
        return px > run.minX + FENCE && px < run.maxX - FENCE && pz > run.minZ + FENCE && pz < run.maxZ - FENCE;
      };
      if (!fits(side) && fits(-side)) side = -side;
      x += (ax / d) * push * 1.2 + (az / d) * side * push * 1.4;
      z += (az / d) * push * 1.2 - (ax / d) * side * push * 1.4;
    };
    round(pasture.trough.x, pasture.trough.z, TROUGH_CLEAR - (this.intent === 'eat' ? 0.25 : 0));
    // (Two at the trough stand side by side.)
    for (const other of pasture.others) if (other !== this) round(other.x, other.z, this.feeding && other.feeding ? 1.22 : COW.radius * 2 - 0.3, other);
    const len = Math.hypot(x, z) || 1;
    return { x: x / len, z: z / len, room };
  }

  // --- Her feet -----------------------------------------------------------

  private step(dt: number): void {
    const moving = Math.abs(this.speed) > 0.03 || Math.abs(this.turning) > 0.12;
    const pace = Math.abs(this.speed) + Math.abs(this.turning) * TURN_REACH;
    // Setting off from a stand, her strides start short: every hoof gets its turn before it's left behind.
    if (!moving && this.stood > 0.25) this.come = 0;
    this.come += pace * dt;
    const stride = FIRST_STRIDE + (STRIDE - FIRST_STRIDE) * ease(this.come / STRIDE_UP);
    this.cycle += (pace * dt) / stride;
    this.stood = moving ? 0 : this.stood + dt;
    for (let i = 0; i < 2; i++) this.stance[i] = toward(this.stance[i]!, this.act === 'graze' ? GRAZE_STANCE[i === this.lead ? 0 : 1]! : 0, 3, dt);
    const tucked = (this.act === 'lieDown' && this.actTime > 0.45) || this.act === 'lying';
    for (let i = 2; i < 4; i++) if (!this.feet[i]!.swing) this.stance[i] = tucked ? TUCK : 0;
    const [s, c] = [Math.sin(this.heading), Math.cos(this.heading)];
    const swinging = () => this.feet.filter((f) => f.swing).length;
    const lift = (foot: Foot, seconds: number, home: boolean) => {
      foot.swing = { fromX: foot.x, fromZ: foot.z, toX: foot.x, toZ: foot.z, u: 0, seconds, home };
    };
    this.feet.forEach((foot, i) => {
      const hip = this.place(i);
      const home = this.under(hip);
      if (!foot.swing && !this.down) {
        const stride = Math.floor(this.cycle - OFFSETS[i]!);
        const reach = Math.hypot(foot.x - home.x, foot.z - home.z);
        if (moving && stride > foot.stepped) {
          // Her turn in the stride.
          foot.stepped = stride;
          lift(foot, clamp(((1 - DUTY) * stride) / Math.max(pace, 0.3), 0.26, 0.6), false);
        } else if (reach > OVERSTRETCHED && swinging() < 2) lift(foot, 0.28, false);
      }
      const swing = foot.swing;
      if (!swing) return;
      swing.u = Math.min(1, swing.u + dt / swing.seconds);
      // Where it comes down: under its hip as she'll stand (and be turned) then, and half its time on the ground's
      // travel ahead of that while she's walking or turning on.
      const left = (1 - swing.u) * swing.seconds;
      const ahead = swing.home ? 0 : ((DUTY * stride) / 2) * Math.min(1, pace / 0.3);
      const then = this.under(hip, this.heading + this.turning * (left + (pace > 0.05 ? ahead / pace : 0)));
      const lead = pace > 0.05 ? (ahead * this.speed) / pace : 0;
      swing.toX = then.x + s * (lead + this.speed * left);
      swing.toZ = then.z + c * (lead + this.speed * left);
      const k = ease(swing.u);
      foot.x = swing.fromX + (swing.toX - swing.fromX) * k;
      foot.z = swing.fromZ + (swing.toZ - swing.fromZ) * k;
      // Up and down gently at either end (her knee folds as it lifts, and straightens as it's set down).
      foot.lift = (0.5 - 0.5 * Math.cos(TAU * swing.u)) * LIFT[i < 2 ? 0 : 1]! * (swing.home ? 0.7 : 1);
      if (swing.u >= 1) {
        foot.lift = 0;
        foot.swing = null;
      }
    });
    // Lying down she draws her hind hooves in under her; getting up, she sets them back under her hips first.
    if (this.down) {
      for (let i = 2; i < 4; i++) {
        const foot = this.feet[i]!;
        const home = this.under(this.place(i));
        if (!foot.swing && Math.hypot(foot.x - home.x, foot.z - home.z) > 0.06) lift(foot, i === 2 ? 0.55 : 0.7, true);
      }
    }
    // Standing: a hoof left out of place (she stopped mid-stride, or turned) is put right, one at a time.
    if (!moving && !this.down && this.stood > 0.25 && swinging() === 0) {
      let worst = -1;
      let most = OUT_OF_PLACE;
      this.feet.forEach((foot, i) => {
        const home = this.under(this.place(i));
        const off = Math.hypot(foot.x - home.x, foot.z - home.z);
        if (off > most) {
          most = off;
          worst = i;
        }
      });
      if (worst >= 0) lift(this.feet[worst]!, 0.42, true);
    }
  }

  // --- Her body -----------------------------------------------------------

  private carry(dt: number): void {
    const walking = ease((Math.abs(this.speed) + Math.abs(this.turning) * TURN_REACH) / 0.35);
    // As tall as her legs allow: each end just low enough for its legs to reach their hooves, all but straight.
    const reach = (COW.thigh + COW.shin) * STRAIGHT;
    const room = (i: number) => {
      const foot = this.feet[i]!;
      const home = this.under(COW.hips[i]!);
      const off = Math.hypot(foot.x - home.x, foot.z - home.z);
      return COW.hipHeight - foot.lift - Math.sqrt(Math.max(0.09, reach * reach - off * off));
    };
    let shoulders = Math.max(STAND_DROP, room(0), room(1));
    let hips = Math.max(HOCK_DROP, room(2), room(3));
    let eased = true;
    const u = this.actTime;
    const [fromShoulders, fromHips] = this.from;
    if (this.act === 'lieDown') {
      // Down on her knees first, then her hindquarters (from however she stood).
      shoulders = fromShoulders + (LIE_DROP - fromShoulders) * ease(u / 1.0);
      hips = fromHips + (LIE_DROP - fromHips) * ease((u - 0.5) / (LIE_SECONDS - 0.55));
      eased = false;
    } else if (this.act === 'lying') {
      shoulders = hips = LIE_DROP;
      eased = false;
    } else if (this.act === 'getUp') {
      // Hindquarters up first, then her front.
      hips = LIE_DROP - (LIE_DROP - HOCK_DROP) * ease(u / 1.0);
      shoulders = LIE_DROP - (LIE_DROP - STAND_DROP) * ease((u - 0.45) / (LIE_SECONDS - 0.5));
      eased = false;
    } else if (this.act === 'graze') shoulders += GRAZE_DIP;
    const settle = (now: number, to: number) => (eased ? toward(now, to, to > now ? SINK : RISE, dt) : to);
    this.shoulderDrop = settle(this.shoulderDrop, shoulders);
    this.hipDrop = settle(this.hipDrop, hips);
    // Walking, she rolls a little from side to side; lying, she leans over.
    const lean = this.act === 'lying' || this.act === 'lieDown' ? 0.07 * ease((this.shoulderDrop - 0.3) / 0.2) : 0;
    this.roll = toward(this.roll, Math.sin(this.cycle * TAU) * 0.028 * walking + lean, 8, dt);
    const span = COW.hips[0]!.z - COW.hips[2]!.z;
    const pitch = (this.shoulderDrop - this.hipDrop) / span;
    const drop = this.hipDrop - COW.hips[2]!.z * ((this.shoulderDrop - this.hipDrop) / span);
    // Tipping forward about her feet would carry her hips on: she tips about her middle instead.
    const shift = -0.75 * COW.hipHeight * Math.sin(pitch);
    this.shift = COW.hipHeight * Math.sin(pitch) + shift;
    const pose = this.pose;
    pose.heading = this.heading;
    pose.pitch = pitch;
    pose.roll = this.roll;
    pose.x = this.x + Math.sin(this.heading) * shift;
    pose.z = this.z + Math.cos(this.heading) * shift;
    pose.y = -drop;
    this.reachFeet(dt);
  }

  /** A point in the pasture (x, height, z), as her body sees it (x to her left, y up, z ahead; from her middle on the ground). */
  private local(x: number, y: number, z: number): { x: number; y: number; z: number } {
    const p = this.pose;
    const dx = x - p.x;
    const dy = y - p.y;
    const dz = z - p.z;
    // Undo the turn, then the tip, then the roll.
    const [sh, ch] = [Math.sin(p.heading), Math.cos(p.heading)];
    const x1 = dx * ch - dz * sh;
    const z1 = dx * sh + dz * ch;
    const [sp, cp] = [Math.sin(p.pitch), Math.cos(p.pitch)];
    const y2 = dy * cp + z1 * sp;
    const z2 = -dy * sp + z1 * cp;
    const [sr, cr] = [Math.sin(p.roll), Math.cos(p.roll)];
    return { x: x1 * cr + y2 * sr, y: -x1 * sr + y2 * cr, z: z2 };
  }

  /** Each leg bent to put its hoof where it's planted (or swinging): the knee forward on a foreleg, the hock back on a hind. */
  private reachFeet(dt: number): void {
    // (Near a straight leg a small move swings the joints a long way: they follow a touch behind, with no snap.)
    const k = dt > 0 ? 1 - Math.exp(-45 * dt) : 1;
    const { thigh, shin, hipHeight } = COW;
    this.feet.forEach((foot, i) => {
      const hip = COW.hips[i]!;
      const at = this.local(foot.x, foot.lift, foot.z);
      const vx = at.x - hip.x;
      const vy = at.y - hipHeight;
      const vz = at.z - hip.z;
      const down = Math.hypot(vx, vy);
      const far = Math.hypot(down, vz);
      const d = clamp(far, Math.abs(thigh - shin) + 0.02, (thigh + shin) * 0.992);
      this.stretch[i] = Math.max(0, far - (thigh + shin));
      const bend = Math.PI - Math.acos(clamp((thigh * thigh + shin * shin - d * d) / (2 * thigh * shin), -1, 1));
      const inner = Math.acos(clamp((thigh * thigh + d * d - shin * shin) / (2 * thigh * d), -1, 1));
      const side = i < 2 ? 1 : -1;
      const leg = this.pose.legs[i]!;
      leg.abduct += (Math.atan2(vx, -vy) - leg.abduct) * k;
      leg.hip += (-(Math.atan2(vz, down) + side * inner) - leg.hip) * k;
      leg.knee += (side * bend - leg.knee) * k;
    });
  }

  // --- Her head, and the little things ------------------------------------

  /** Which side to carry her head round to (-1, 1) when another cow's body is where it would be, straight ahead of her; 0 when it's clear. */
  private headAside(pasture: Pasture): number {
    const [s, c] = [Math.sin(this.heading), Math.cos(this.heading)];
    // (Once it's round, it stays round until there's a little more room.)
    let least = this.aside !== 0 ? 0.74 : 0.58;
    let side = 0;
    for (const o of pasture.others) {
      if (o === this || Math.hypot(o.x - this.x, o.z - this.z) > 3) continue;
      const [os, oc] = [Math.sin(o.heading), Math.cos(o.heading)];
      for (const ahead of [0.95, 1.35]) {
        for (const k of BACK) {
          const px = o.x + os * k;
          const pz = o.z + oc * k;
          const d = Math.hypot(this.x + s * ahead - px, this.z + c * ahead - pz);
          if (d >= least) continue;
          least = d;
          // Away from the nearest of her, as seen from her own shoulders.
          side = angleTo(this.heading, Math.atan2(px - this.x - s * COW.shoulder.z, pz - this.z - c * COW.shoulder.z)) > 0 ? -1 : 1;
        }
      }
    }
    return side !== 0 && this.aside !== 0 ? this.aside : side;
  }

  private hold(dt: number, pasture: Pasture): void {
    const pose = this.pose;
    const t = this.time;
    const walking = ease(this.speed / 0.35);
    let neckPitch = 0.02;
    let headPitch = 0.04;
    let yaw = 0;
    let roll = 0;
    let jawOpen = 0;
    let chewing = 0;
    let earsTurn = 0;
    let droop = 0;
    let shut = 0;
    let rate = 3.5;
    let reach: { x: number; y: number; z: number } | null = null;
    const ahead = (far: number, side: number, height: number) => {
      const [s, c] = [Math.sin(this.heading), Math.cos(this.heading)];
      return this.local(this.x + s * far + c * side, height, this.z + c * far - s * side);
    };
    switch (this.act) {
      case 'walk':
        // Head a little low and nodding with her steps, looking into her turns; lifting it to look where the hero is on her way over.
        neckPitch = 0.14 + Math.sin(this.cycle * TAU * 2 + 0.6) * 0.05 * walking;
        headPitch = 0.02;
        yaw = clamp(this.turning * 0.3, -0.35, 0.35);
        if (this.intent === 'greet') {
          neckPitch = -0.02;
          earsTurn = 0.3;
        }
        break;
      case 'graze': {
        // Muzzle in the grass, drifting from side to side; a tug as she tears a mouthful, chewing all the while.
        this.tugIn -= dt;
        if (this.tugIn <= 0) {
          this.tugIn = 1.1 + this.random() * 0.9;
          this.tug = 0.32;
        }
        this.tug = Math.max(0, this.tug - dt);
        const pull = Math.sin((this.tug / 0.32) * Math.PI);
        reach = ahead(COW.shoulder.z + GRAZE_REACH - pull * 0.05, Math.sin(t * 0.5) * 0.2, GRASS + pull * 0.07);
        chewing = 1;
        rate = 4.5;
        break;
      }
      case 'eat': {
        const { trough } = pasture;
        // Her mouth in the trough, as near as she can reach.
        const at = this.local(clamp(this.x + Math.sin(t * 0.6) * 0.15, trough.x - 0.9, trough.x + 0.9), TROUGH_TOP + 0.04, trough.z);
        reach = at;
        chewing = 1;
        rate = 4.5;
        break;
      }
      case 'chew':
        neckPitch = 0.05;
        headPitch = 0.08;
        yaw = Math.sin(t * 0.35) * 0.12;
        chewing = 1;
        break;
      case 'look':
        // Head up, looking about the field, ears turning to what she hears.
        neckPitch = -0.12;
        headPitch = -0.04;
        yaw = Math.sin(t * 0.55) * 0.55 + Math.sin(t * 1.3) * 0.12;
        earsTurn = 0.2;
        break;
      case 'moo': {
        // A breath, then head up and out, mouth open; the sound as it opens.
        const u = this.actTime;
        const up = ease((u - 0.15) / 0.45) * (1 - ease((u - 1.75) / 0.45));
        const open = ease((u - 0.5) / 0.25) * (1 - ease((u - 1.6) / 0.3));
        neckPitch = 0.06 - up * 0.34;
        headPitch = -up * 0.3;
        jawOpen = open * 0.42 * (0.85 + 0.15 * Math.sin(t * 22));
        rate = 5;
        if (!this.sounded && u > 0.55) {
          this.sounded = true;
          this.mooed = this.time;
          this.onMoo(this);
        }
        break;
      }
      case 'greet': {
        // Watching the hero: head up, ears pricked, a curious tilt of the head now and then.
        neckPitch = -0.1;
        headPitch = -0.02;
        earsTurn = 0.4;
        if (pasture.hero) yaw = clamp(angleTo(this.heading, Math.atan2(pasture.hero.x - this.x, pasture.hero.z - this.z)), -1.25, 1.25);
        this.tiltIn -= dt;
        if (this.tiltIn <= 0) {
          this.tiltIn = 2.5 + this.random() * 3;
          this.tilt = this.tilt === 0 ? (this.random() < 0.5 ? -0.2 : 0.2) : 0;
        }
        roll = this.tilt;
        rate = 5;
        // A moo of hello, sometimes.
        if (!this.sounded && this.actTime > 1.2 && this.time - this.mooed > MOO_EVERY) {
          this.sounded = true;
          if (this.random() < 0.5) this.begin('moo', 2.4);
        }
        break;
      }
      case 'lieDown':
      case 'getUp':
        // Her head goes out and a little down for balance as she goes.
        neckPitch = 0.12 * Math.sin(Math.min(1, this.actTime / LIE_SECONDS) * Math.PI);
        break;
      case 'lying':
        if (this.dozing && this.actTime > 2 && this.actFor - this.actTime > 1.5) {
          // Dozing: head low, eyes shut, ears down.
          neckPitch = 0.42;
          headPitch = 0.1;
          shut = 1;
          droop = 0.3;
          rate = 1.5;
        } else {
          neckPitch = -0.04;
          yaw = Math.sin(t * 0.3) * 0.25;
          chewing = 1;
        }
        break;
    }
    // Another cow where her head would be: she lifts it and carries it round to the clear side.
    this.aside = this.headAside(pasture);
    if (this.aside !== 0) {
      reach = null;
      yaw = this.aside * 1.2;
      neckPitch = Math.min(neckPitch, -0.06);
      headPitch = Math.min(headPitch, 0.02);
      rate = Math.max(rate, 5);
    }
    let neckYaw = yaw * 0.6;
    let headYaw = yaw * 0.4;
    // Her head stays level as her body tips (kneeling to lie down, hindquarters first getting up).
    neckPitch -= pose.pitch * 0.9;
    if (reach) {
      // Neck and head bent to put her mouth there (the poll above the line from her shoulders to it).
      const rx = reach.x;
      const ry = reach.y - COW.shoulder.y;
      const rz = reach.z - COW.shoulder.z;
      const out = Math.hypot(rx, rz);
      const neck = Math.hypot(COW.neck.y, COW.neck.z);
      const head = Math.hypot(COW.mouth.y, COW.mouth.z);
      const d = clamp(Math.hypot(out, ry), Math.abs(neck - head) + 0.02, neck + head - 1e-3);
      const line = Math.atan2(ry, out);
      const inner = Math.acos(clamp((neck * neck + d * d - head * head) / (2 * neck * d), -1, 1));
      const bend = Math.PI - Math.acos(clamp((neck * neck + head * head - d * d) / (2 * neck * head), -1, 1));
      const neckUp = line + inner;
      const headUp = neckUp - bend;
      neckPitch = Math.atan2(COW.neck.y, COW.neck.z) - neckUp;
      headPitch = Math.atan2(COW.mouth.y, COW.mouth.z) - headUp - neckPitch;
      neckYaw = clamp(Math.atan2(rx, rz), -0.6, 0.6);
      headYaw = 0;
    }
    // Her head doesn't snap to it: it gathers way, swings over and settles (a spring, just short of bouncing).
    const swing = (key: 'neckPitch' | 'headPitch' | 'neckYaw' | 'headYaw' | 'headRoll', to: number, quick: number) => {
      const v = this.swing[key] + (quick * quick * (to - pose[key]) - 2 * quick * this.swing[key]) * dt;
      this.swing[key] = v;
      pose[key] += v * dt;
    };
    swing('neckPitch', neckPitch, rate * 1.6);
    swing('headPitch', headPitch, rate * 1.6);
    swing('neckYaw', neckYaw, rate * 1.3);
    swing('headYaw', headYaw, rate * 1.3);
    swing('headRoll', roll, 4.5);
    // The jaw: grinding round as she chews (open, across, shut, back), with a swallow's pause now and then.
    const grind = t * 9.5;
    const pause = Math.sin(t * 0.8) > 0.9 ? 0 : 1;
    pose.jawOpen = toward(pose.jawOpen, jawOpen + chewing * pause * (0.07 + 0.06 * Math.sin(grind)), 18, dt);
    pose.jawSlide = toward(pose.jawSlide, chewing * pause * 0.022 * Math.cos(grind), 18, dt);
    // Ears: turned to what she's watching; drooping as she dozes; a flick each, now and then.
    pose.earsTurn = toward(pose.earsTurn, earsTurn, 5, dt);
    this.droop = toward(this.droop, droop, 3, dt);
    for (const i of [0, 1] as const) {
      this.earIn[i] -= dt;
      if (this.earIn[i] <= 0) {
        this.earIn[i] = 1.8 + this.random() * 4.5;
        this.earFlick[i] = 0.22;
      }
      this.earFlick[i] = Math.max(0, this.earFlick[i] - dt);
      pose.ears[i] = this.droop + Math.sin((this.earFlick[i] / 0.22) * Math.PI) * 0.42;
    }
    // Eyes: a blink every few seconds; shut while she dozes.
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinkIn = 2.2 + this.random() * 3.5;
      this.blinking = 0.16;
    }
    this.blinking = Math.max(0, this.blinking - dt);
    pose.blink = toward(pose.blink, Math.max(shut, this.blinking > 0 ? 1 : 0), shut ? 4 : 30, dt);
    // The tail: swinging slowly, its end trailing after; a flick at the flies; swaying with her walk.
    this.tailIn -= dt;
    if (this.tailIn <= 0) {
      this.tailIn = (this.act === 'lying' ? 5 : 2.5) + this.random() * 5;
      this.tailFlick = 0.55;
      this.tailSide = this.random() < 0.5 ? -1 : 1;
    }
    this.tailFlick = Math.max(0, this.tailFlick - dt);
    const flick = Math.sin((1 - this.tailFlick / 0.55) * Math.PI) * (this.tailFlick > 0 ? 1 : 0) * this.tailSide;
    const late = Math.sin((1 - Math.min(1, (this.tailFlick + 0.12) / 0.55)) * Math.PI) * (this.tailFlick > 0 ? 1 : 0) * this.tailSide;
    const calm = this.act === 'lying' ? 0.25 : 1;
    const sway = Math.sin(t * 1.5) * 0.2 * calm + Math.sin(this.cycle * TAU) * 0.12 * walking;
    pose.tail = toward(pose.tail, sway + flick * 0.75, 14, dt);
    pose.tailTip = toward(pose.tailTip, Math.sin(t * 1.5 - 0.9) * 0.28 * calm + late * 0.95, 12, dt);
    pose.tailLift = toward(pose.tailLift, 0.06 + Math.abs(flick) * 0.35 + (this.act === 'greet' ? 0.08 : 0), 10, dt);
    pose.breath = Math.sin(t * (shut ? 1.1 : 1.7));
  }
}

/** The cows of one pasture. */
export class Herd {
  readonly cows: Cow[] = [];

  constructor(
    readonly run: Rect,
    readonly trough: Point,
    private readonly random: () => number = Math.random,
    private readonly onMoo: (cow: Cow) => void = () => {},
  ) {}

  /** Another cow, somewhere clear in the pasture. */
  add(): Cow {
    const { run, trough } = this;
    // Of a good many places, the one furthest from the others (and clear of the trough).
    let at = { x: (run.minX + run.maxX) / 2, z: run.minZ + MARGIN };
    let room = -1;
    for (let i = 0; i < 60; i++) {
      const spot = { x: run.minX + MARGIN + this.random() * (run.maxX - run.minX - MARGIN * 2), z: run.minZ + MARGIN + this.random() * (run.maxZ - run.minZ - MARGIN * 2) };
      if (Math.hypot(spot.x - trough.x, spot.z - trough.z) < TROUGH_CLEAR + 0.5) continue;
      const nearest = Math.min(6, ...this.cows.map((c) => Math.hypot(c.x - spot.x, c.z - spot.z)));
      if (nearest <= room) continue;
      room = nearest;
      at = spot;
    }
    const cow = new Cow(at, this.random() * TAU, this.random, this.onMoo);
    this.cows.push(cow);
    return cow;
  }

  update(dt: number, fed: boolean, hero: Point | null): void {
    const pasture: Pasture = { run: this.run, trough: this.trough, fed, hero, others: this.cows };
    // Long frames are taken in short steps (her feet and her easing keep their timing).
    const steps = Math.max(1, Math.ceil(dt / 0.04));
    for (let i = 0; i < steps; i++) for (const cow of this.cows) cow.update(dt / steps, pasture);
  }
}
