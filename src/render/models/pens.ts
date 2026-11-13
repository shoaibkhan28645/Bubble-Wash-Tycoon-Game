// The animal pens as drawn: the hen house's egg table and white picket run,
// the cow barn's dairy and railed pasture, each with a trough that fills
// with corn while the animals are fed, and the animals themselves, each
// with parts that move (art/blender/farm.py): hens that trot about on
// stepping legs, bobbing their heads, pecking, wagging their tails and now
// and then flapping (the rooster crows), all heading for the trough at
// feeding time; and the cows, whose every move is worked out in
// systems/cows.ts (walking on planted hooves, grazing, lying down, coming
// over to see the hero) and put on their models by cowRig.ts.
import { BoxGeometry, Group, Mesh, type Object3D } from 'three';
import type { Point, Rect } from '../../core/config';
import type { AnimalKind, Livestock, Pen } from '../../systems/animals';
import { Herd, type Cow } from '../../systems/cows';
import { mergeParts, toyMaterial, type Part } from './build';
import { CowRig } from './cowRig';
import { farmModel, farmMover } from './farm';

const CORN = '#ffcf33';

/** How each kind of animal's pen looks: its models, its table, how far they keep from the fence, its trough's size and its fence. */
const LOOKS: Record<AnimalKind, { models: string[]; table: string; margin: number; trough: number; fence: 'picket' | 'rail' }> = {
  hens: { models: ['fm_hen', 'fm_hen_brown', 'fm_hen', 'fm_rooster'], table: 'fm_eggtable', margin: 0.45, trough: 1, fence: 'picket' },
  cows: { models: ['fm_cow', 'fm_cow_brown'], table: 'fm_dairy', margin: 1.1, trough: 1.6, fence: 'rail' },
};

/** How a hen moves (the cows' motion is all in systems/cows.ts). */
const HEN = {
  /** Walking speed (m/s), and how long she stops to peck. */
  speed: 0.7,
  pause: [0.8, 2.6],
  /** How far she lowers her head to peck (radians), and how fast she pecks. */
  nod: 1.05,
  nodRate: 9,
  /** Metres walked per stride (one swing of each leg). */
  stride: 0.22,
  /** How far the legs swing (radians), and the little hop in each step. */
  swing: 0.75,
  hop: 0.03,
  /** How fast she turns to face where she's going (radians a second). */
  turn: 8,
};

/** Seconds a hen's flap lasts; how fast her wings beat. */
const FLAP = { seconds: 0.7, rate: 32 };

/** The angle from `from` to `to`, the short way round. */
function angleTo(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/** Open in the fence where the animals come out of their house (the run's side nearest it). */
const GAP = 0.65;

/** A fence round a pen: white pickets for the hens, a wooden rail fence for the cows' pasture; open on the house's side. */
function penFence(run: Rect, gapZ: number, style: 'picket' | 'rail'): Mesh {
  const parts: Part[] = [];
  const picket = style === 'picket';
  const color = picket ? '#fbf6ea' : '#8f6036';
  const rail = picket ? '#e9e1cc' : '#c08a55';
  const spacing = picket ? 0.28 : 1.6;
  const rails = picket ? [0.22, 0.5] : [0.45, 0.85];
  const side = (x0: number, z0: number, x1: number, z1: number, gap?: [number, number]) => {
    const length = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(length / spacing));
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const x = x0 + (x1 - x0) * k;
      const z = z0 + (z1 - z0) * k;
      if (gap && z > gap[0] && z < gap[1]) continue;
      const tall = picket ? (i % 4 === 0 ? 0.8 : 0.66) : 1.1;
      parts.push({ geometry: new BoxGeometry(picket ? 0.09 : 0.16, tall, picket ? 0.05 : 0.16), color, x, y: tall / 2, z, ry: Math.atan2(x1 - x0, z1 - z0) });
    }
    const spans: [number, number][] = gap ? [[z0, gap[0]], [gap[1], z1]] : [];
    for (const y of rails) {
      if (!gap) {
        parts.push({ geometry: new BoxGeometry(Math.abs(x1 - x0) || 0.06, 0.07, Math.abs(z1 - z0) || 0.06), color: rail, x: (x0 + x1) / 2, y, z: (z0 + z1) / 2 });
        continue;
      }
      for (const [a, b] of spans) parts.push({ geometry: new BoxGeometry(0.06, 0.07, Math.abs(b - a)), color: rail, x: x0, y, z: (a + b) / 2 });
    }
  };
  const gap: [number, number] = [gapZ - GAP, gapZ + GAP];
  side(run.minX, run.minZ, run.maxX, run.minZ);
  side(run.minX, run.maxZ, run.maxX, run.maxZ);
  side(run.maxX, run.minZ, run.maxX, run.maxZ);
  side(run.minX, run.minZ, run.minX, run.maxZ, gap);
  const mesh = new Mesh(mergeParts(parts), toyMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'pen-fence';
  return mesh;
}

interface Animal {
  model: Object3D;
  name: string;
  at: Point;
  target: Point;
  /** Seconds left pecking where she stands. */
  pause: number;
  phase: number;
  /** How far through its stride (grows with distance walked). */
  stride: number;
  /** Which way she faces (radians), where her head is now (radians down), and seconds left flapping or crowing. */
  heading: number;
  head: number;
  flap: number;
  parts: { head?: Object3D; tail?: Object3D; wings: Object3D[]; legs: Object3D[] };
}

interface PenView {
  pen: Pen;
  animals: Animal[];
  fill: Mesh;
  /** A pasture's cows, and their models. */
  herd: Herd | null;
  rigs: CowRig[];
}

export class PensView {
  readonly group = new Group();
  private readonly views: PenView[] = [];
  private time = 0;

  constructor(
    private readonly livestock: Livestock,
    /** How many animals a pen has now. */
    private readonly count: (penId: string) => number,
    /** A cow moos: `at` where she stands. */
    private readonly onMoo: (at: Point) => void = () => {},
    private readonly random: () => number = Math.random,
  ) {
    this.group.name = 'pens';
  }

  /** Draws a newly built pen's table, fence, trough and animals (the house itself is the pad's model, at `houseAt`). */
  addPen(pen: Pen, houseAt: Point): void {
    if (this.views.some((v) => v.pen.id === pen.id)) return;
    const look = LOOKS[pen.animal];
    const table = farmModel(look.table);
    table.position.set(pen.table.x, 0, pen.table.z);
    const trough = farmModel('fm_trough');
    trough.position.set(pen.trough.x, 0, pen.trough.z);
    trough.scale.setScalar(look.trough);
    const fill = new Mesh(mergeParts([{ geometry: new BoxGeometry(1.2, 0.08, 0.32), color: CORN, y: 0.3 }]), toyMaterial);
    fill.position.copy(trough.position);
    fill.scale.copy(trough.scale);
    for (const model of [table, trough]) model.traverse((node) => (node.castShadow = node.receiveShadow = true));
    const gapZ = Math.min(pen.run.maxZ - 0.8, Math.max(pen.run.minZ + 0.8, houseAt.z - 0.3));
    this.group.add(table, trough, fill, penFence(pen.run, gapZ, look.fence));
    const herd = pen.animal === 'cows' ? new Herd(pen.run, pen.trough, this.random, (cow: Cow) => this.onMoo({ x: cow.x, z: cow.z })) : null;
    this.views.push({ pen, animals: [], fill, herd, rigs: [] });
  }

  /** One frame; the cows look up (and come over) when `hero` is by their fence. */
  update(dt: number, hero: Point | null = null): void {
    this.time += dt;
    const fed = this.livestock.fed;
    for (const view of this.views) {
      this.fill(view);
      view.fill.visible = fed;
      for (const animal of view.animals) this.move(animal, view.pen, fed, dt);
      if (view.herd) {
        view.herd.update(dt, fed, hero);
        view.rigs.forEach((rig, i) => rig.apply(view.herd!.cows[i]!.pose));
      }
    }
  }

  /** Adds animals as the pen's herd or flock grows (its upgrade). */
  private fill(view: PenView): void {
    const look = LOOKS[view.pen.animal];
    const { herd } = view;
    while (herd && herd.cows.length < this.count(view.pen.id)) {
      const name = look.models[herd.cows.length % look.models.length]!;
      const model = farmMover(name);
      this.group.add(model);
      const rig = new CowRig(model, name);
      rig.apply(herd.add().pose);
      view.rigs.push(rig);
    }
    if (herd) return;
    while (view.animals.length < this.count(view.pen.id)) {
      const name = look.models[view.animals.length % look.models.length]!;
      const model = farmMover(name);
      const at = this.spotIn(view.pen.run, look.margin);
      model.position.set(at.x, 0, at.z);
      const heading = this.random() * Math.PI * 2;
      // Turned first, then tipped and rolled about its own axes as it walks.
      model.rotation.order = 'YXZ';
      model.rotation.y = heading;
      this.group.add(model);
      const part = (id: string) => model.getObjectByName(`${name}_${id}`) ?? undefined;
      const parts = {
        head: part('head'),
        tail: part('tail'),
        wings: ['wing_l', 'wing_r'].map(part).filter((p): p is Object3D => !!p),
        legs: ['leg_l', 'leg_r', 'leg_fl', 'leg_fr', 'leg_bl', 'leg_br'].map(part).filter((p): p is Object3D => !!p),
      };
      parts.head?.rotation.set(0, 0, 0, 'YXZ');
      view.animals.push({ model, name, at, target: this.spotIn(view.pen.run, look.margin), pause: this.random() * 3, phase: this.random() * 6, stride: 0, heading, head: 0, flap: 0, parts });
    }
  }

  private spotIn(run: Rect, margin: number): Point {
    return { x: run.minX + margin + this.random() * (run.maxX - run.minX - margin * 2), z: run.minZ + margin + this.random() * (run.maxZ - run.minZ - margin * 2) };
  }

  /** A hen's moment: pecking where she stands, or on her way to the next spot (often the trough when there's feed). */
  private move(animal: Animal, pen: Pen, fed: boolean, dt: number): void {
    const look = LOOKS[pen.animal];
    const { model } = animal;
    const eating = animal.pause > 0;
    if (eating) {
      animal.pause -= dt;
      if (animal.pause <= 0) {
        const toTrough = fed && this.random() < 0.45;
        const reach = 0.55 * look.trough;
        animal.target = toTrough
          ? { x: pen.trough.x + (this.random() - 0.5) * 1.1 * look.trough, z: pen.trough.z + (this.random() < 0.5 ? -reach : reach) * 1.6 }
          : this.spotIn(pen.run, look.margin);
        // Off again: she sometimes flaps as she sets off (and the rooster stops to crow).
        if (this.random() < 0.25) animal.flap = FLAP.seconds * (animal.name === 'fm_rooster' ? 2.2 : 1);
      }
      // Standing: she settles.
      model.position.y += (0 - model.position.y) * Math.min(1, dt * 6);
    } else {
      // Turning to face where she's going, and walking on as she comes round.
      const dx = animal.target.x - animal.at.x;
      const dz = animal.target.z - animal.at.z;
      const dist = Math.hypot(dx, dz);
      const off = angleTo(animal.heading, Math.atan2(dx, dz));
      animal.heading += Math.sign(off) * Math.min(Math.abs(off), HEN.turn * dt);
      const step = Math.min(dist, HEN.speed * dt * Math.max(0.15, Math.cos(Math.min(Math.abs(off), Math.PI / 2))));
      animal.stride += step / HEN.stride;
      if (dist <= HEN.speed * dt) {
        animal.at = { ...animal.target };
        animal.pause = HEN.pause[0]! + this.random() * (HEN.pause[1]! - HEN.pause[0]!);
      } else {
        animal.at = { x: animal.at.x + (dx / dist) * step, z: animal.at.z + (dz / dist) * step };
      }
      // A little hop in each step.
      model.position.set(animal.at.x, Math.abs(Math.sin(animal.stride * Math.PI * 2)) * HEN.hop, animal.at.z);
    }
    model.rotation.y = animal.heading;
    this.pose(animal, eating, dt);
  }

  /** Legs, head, tail and wings for this moment. */
  private pose(animal: Animal, eating: boolean, dt: number): void {
    const { parts } = animal;
    const t = this.time + animal.phase;
    // Legs: a stepping stride while walking, standing square while still.
    const cycle = Math.sin(animal.stride * Math.PI * 2);
    parts.legs.forEach((leg, i) => {
      const target = eating ? 0 : cycle * HEN.swing * (i === 0 ? 1 : -1);
      leg.rotation.x += (target - leg.rotation.x) * Math.min(1, dt * 14);
    });
    const crowing = animal.flap > 0 && animal.name === 'fm_rooster';
    // The head: pecking while still; while walking, it bobs with the steps.
    const head = crowing ? -0.5 : eating ? Math.pow(Math.max(0, Math.sin(t * HEN.nodRate)), 3) * HEN.nod : Math.sin(animal.stride * Math.PI * 4) * 0.22;
    animal.head += (head - animal.head) * Math.min(1, dt * 22);
    if (parts.head) parts.head.rotation.x = animal.head;
    // The tail wags in quick bursts.
    if (parts.tail) parts.tail.rotation.y = Math.sin(t * 13) * 0.3 * Math.max(0, Math.sin(t * 0.9)) ** 4;
    // Wings: folded, or beating out from her sides while she flaps.
    if (animal.flap > 0) animal.flap = Math.max(0, animal.flap - dt);
    const spread = animal.flap > 0 ? (0.55 + Math.sin(this.time * FLAP.rate) * 0.45) * Math.min(1, animal.flap * 6) : 0;
    parts.wings.forEach((wing, i) => (wing.rotation.z = (i === 0 ? -1 : 1) * spread * 1.1));
  }
}
