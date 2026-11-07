// The animal pens as drawn: the hen house's egg table and white picket run,
// the cow barn's dairy and railed pasture, each with a trough that fills
// with corn while the animals are fed, and the animals themselves: hens
// that trot about and peck, cows that amble and graze, all heading for the
// trough at feeding time.
import { BoxGeometry, Group, Mesh, type Object3D } from 'three';
import type { Point, Rect } from '../../core/config';
import type { AnimalKind, Livestock, Pen } from '../../systems/animals';
import { mergeParts, toyMaterial, type Part } from './build';
import { farmModel } from './farm';

const CORN = '#ffcf33';

/** How each kind of animal looks and moves. */
const LOOKS: Record<AnimalKind, {
  models: string[];
  table: string;
  /** Walking speed (m/s), and how long it stops to peck or graze. */
  speed: number;
  pause: [number, number];
  /** How far it tips its head down, and how fast. */
  nod: number;
  nodRate: number;
  /** A little hop in each step (hens), or none (cows). */
  hop: number;
  /** Kept this far from the fence. */
  margin: number;
  trough: number;
  fence: 'picket' | 'rail';
}> = {
  hens: { models: ['fm_hen', 'fm_hen_brown', 'fm_hen'], table: 'fm_eggtable', speed: 0.7, pause: [0.8, 2.6], nod: 0.45, nodRate: 9, hop: 0.05, margin: 0.45, trough: 1, fence: 'picket' },
  cows: { models: ['fm_cow', 'fm_cow_brown'], table: 'fm_dairy', speed: 0.45, pause: [2.5, 6], nod: 0.22, nodRate: 1.6, hop: 0, margin: 1.1, trough: 1.6, fence: 'rail' },
};

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
  at: Point;
  target: Point;
  /** Seconds left pecking or grazing where it stands. */
  pause: number;
  phase: number;
}

interface PenView {
  pen: Pen;
  animals: Animal[];
  fill: Mesh;
}

export class PensView {
  readonly group = new Group();
  private readonly views: PenView[] = [];
  private time = 0;

  constructor(
    private readonly livestock: Livestock,
    /** How many animals a pen has now. */
    private readonly count: (penId: string) => number,
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
    this.views.push({ pen, animals: [], fill });
  }

  update(dt: number): void {
    this.time += dt;
    const fed = this.livestock.fed;
    for (const view of this.views) {
      this.fill(view);
      view.fill.visible = fed;
      for (const animal of view.animals) this.move(animal, view.pen, fed, dt);
    }
  }

  /** Adds animals as the pen's herd or flock grows (its upgrade). */
  private fill(view: PenView): void {
    const look = LOOKS[view.pen.animal];
    while (view.animals.length < this.count(view.pen.id)) {
      const model = farmModel(look.models[view.animals.length % look.models.length]!);
      const at = this.spotIn(view.pen.run, look.margin);
      model.position.set(at.x, 0, at.z);
      model.rotation.y = this.random() * Math.PI * 2;
      model.traverse((node) => (node.castShadow = true));
      this.group.add(model);
      view.animals.push({ model, at, target: this.spotIn(view.pen.run, look.margin), pause: this.random() * 3, phase: this.random() * 6 });
    }
  }

  private spotIn(run: Rect, margin: number): Point {
    return { x: run.minX + margin + this.random() * (run.maxX - run.minX - margin * 2), z: run.minZ + margin + this.random() * (run.maxZ - run.minZ - margin * 2) };
  }

  /** An animal's moment: pecking or grazing where it stands, or on its way to the next spot (often the trough when there's feed). */
  private move(animal: Animal, pen: Pen, fed: boolean, dt: number): void {
    const look = LOOKS[pen.animal];
    const { model } = animal;
    if (animal.pause > 0) {
      animal.pause -= dt;
      // Head down, head up: the whole animal tips forward and back.
      model.rotation.x = Math.max(0, Math.sin(this.time * look.nodRate + animal.phase)) * look.nod;
      model.position.y = 0;
      if (animal.pause <= 0) {
        const toTrough = fed && this.random() < 0.45;
        const reach = 0.55 * look.trough;
        animal.target = toTrough
          ? { x: pen.trough.x + (this.random() - 0.5) * 1.1 * look.trough, z: pen.trough.z + (this.random() < 0.5 ? -reach : reach) * 1.6 }
          : this.spotIn(pen.run, look.margin);
      }
      return;
    }
    const dx = animal.target.x - animal.at.x;
    const dz = animal.target.z - animal.at.z;
    const dist = Math.hypot(dx, dz);
    const step = look.speed * dt;
    model.rotation.x = 0;
    if (dist <= step) {
      animal.at = { ...animal.target };
      animal.pause = look.pause[0] + this.random() * (look.pause[1] - look.pause[0]);
    } else {
      animal.at = { x: animal.at.x + (dx / dist) * step, z: animal.at.z + (dz / dist) * step };
      model.rotation.y = Math.atan2(dx, dz);
    }
    model.position.set(animal.at.x, Math.abs(Math.sin(this.time * 14 + animal.phase)) * look.hop, animal.at.z);
  }
}
