// The hen house as drawn: its egg table, the white picket run beside it, a
// trough that fills with corn while the hens are fed, and the hens
// themselves, wandering the run, stopping to peck, and heading for the
// trough at feeding time.
import { BoxGeometry, Group, Mesh, type Object3D } from 'three';
import type { Point, Rect } from '../../core/config';
import type { Coop, Poultry } from '../../systems/animals';
import { mergeParts, toyMaterial, type Part } from './build';
import { farmModel } from './farm';

const PICKET = '#fbf6ea';
const RAIL = '#e9e1cc';
const CORN = '#ffcf33';
/** Hens walk this fast (m/s), and stop to peck for this long. */
const HEN_SPEED = 0.7;
const PECK_SECONDS: [number, number] = [0.8, 2.6];
/** Where the coop's ramp comes down into the run (from the run's west edge), left open in the fence. */
const RAMP_GAP = 0.65;

/** A low white picket fence round the run, open where the hens' ramp comes down. */
function runFence(run: Rect, rampZ: number): Mesh {
  const parts: Part[] = [];
  const side = (x0: number, z0: number, x1: number, z1: number, gap?: [number, number]) => {
    const length = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(length / 0.28));
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const x = x0 + (x1 - x0) * k;
      const z = z0 + (z1 - z0) * k;
      if (gap && z > gap[0] && z < gap[1]) continue;
      parts.push({ geometry: new BoxGeometry(0.09, i % 4 === 0 ? 0.8 : 0.66, 0.05), color: PICKET, x, y: i % 4 === 0 ? 0.4 : 0.33, z, ry: Math.atan2(x1 - x0, z1 - z0) });
    }
    const pieces: [number, number][] = gap ? [[z0, gap[0]], [gap[1], z1]] : [[0, 1]];
    for (const y of [0.22, 0.5]) {
      if (!gap) {
        parts.push({ geometry: new BoxGeometry(Math.abs(x1 - x0) || 0.05, 0.06, Math.abs(z1 - z0) || 0.05), color: RAIL, x: (x0 + x1) / 2, y, z: (z0 + z1) / 2 });
        continue;
      }
      for (const [a, b] of pieces) parts.push({ geometry: new BoxGeometry(0.05, 0.06, Math.abs(b - a)), color: RAIL, x: x0, y, z: (a + b) / 2 });
    }
  };
  side(run.minX, run.minZ, run.maxX, run.minZ);
  side(run.minX, run.maxZ, run.maxX, run.maxZ);
  side(run.maxX, run.minZ, run.maxX, run.maxZ);
  side(run.minX, run.minZ, run.minX, run.maxZ, [rampZ - RAMP_GAP, rampZ + RAMP_GAP]);
  const mesh = new Mesh(mergeParts(parts), toyMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'run-fence';
  return mesh;
}

interface Hen {
  model: Object3D;
  at: Point;
  target: Point;
  /** Seconds left pecking where it stands. */
  peck: number;
  phase: number;
}

interface CoopView {
  coop: Coop;
  hens: Hen[];
  fill: Mesh;
}

export class PoultryView {
  readonly group = new Group();
  private readonly views: CoopView[] = [];
  private time = 0;

  constructor(
    private readonly poultry: Poultry,
    /** How many hens a hen house has now. */
    private readonly hens: (coopId: string) => number,
    private readonly random: () => number = Math.random,
  ) {
    this.group.name = 'poultry';
  }

  /** Where the hens' ramp comes down: the coop's right side, level with its door (art/blender/farm.py). */
  private static rampZ(coop: Coop, coopAt: Point): number {
    return Math.min(coop.run.maxZ - 0.5, Math.max(coop.run.minZ + 0.5, coopAt.z - 0.3));
  }

  /** Draws a newly built hen house's table, run, trough and hens (the coop itself is the pad's model). */
  addCoop(coop: Coop, coopAt: Point): void {
    if (this.views.some((v) => v.coop.id === coop.id)) return;
    const table = farmModel('fm_eggtable');
    table.position.set(coop.table.x, 0, coop.table.z);
    const trough = farmModel('fm_trough');
    trough.position.set(coop.trough.x, 0, coop.trough.z);
    const fill = new Mesh(mergeParts([{ geometry: new BoxGeometry(1.2, 0.08, 0.32), color: CORN, y: 0.3 }]), toyMaterial);
    fill.position.copy(trough.position);
    for (const model of [table, trough]) model.traverse((node) => (node.castShadow = node.receiveShadow = true));
    this.group.add(table, trough, fill, runFence(coop.run, PoultryView.rampZ(coop, coopAt)));
    this.views.push({ coop, hens: [], fill });
  }

  update(dt: number): void {
    this.time += dt;
    const fed = this.poultry.fed;
    for (const view of this.views) {
      this.flock(view);
      view.fill.visible = fed;
      for (const hen of view.hens) this.move(hen, view.coop, fed, dt);
    }
  }

  /** Adds hens as the flock grows (the hen house's upgrade). */
  private flock(view: CoopView): void {
    const { run } = view.coop;
    while (view.hens.length < this.hens(view.coop.id)) {
      const model = farmModel(view.hens.length % 3 === 1 ? 'fm_hen_brown' : 'fm_hen');
      const at = this.spotIn(run);
      model.position.set(at.x, 0, at.z);
      this.group.add(model);
      view.hens.push({ model, at, target: this.spotIn(run), peck: this.random() * 2, phase: this.random() * 6 });
    }
  }

  private spotIn(run: Rect, margin = 0.45): Point {
    return { x: run.minX + margin + this.random() * (run.maxX - run.minX - margin * 2), z: run.minZ + margin + this.random() * (run.maxZ - run.minZ - margin * 2) };
  }

  /** A hen's moment: pecking where it stands, or trotting to its next spot (often the trough when there's feed). */
  private move(hen: Hen, coop: Coop, fed: boolean, dt: number): void {
    const { model } = hen;
    if (hen.peck > 0) {
      hen.peck -= dt;
      // Head down, head up: the whole hen tips forward and back.
      model.rotation.x = Math.max(0, Math.sin(this.time * 9 + hen.phase)) * 0.45;
      model.position.y = 0;
      if (hen.peck <= 0) {
        const toTrough = fed && this.random() < 0.45;
        hen.target = toTrough
          ? { x: coop.trough.x + (this.random() - 0.5) * 1.1, z: coop.trough.z + (this.random() < 0.5 ? -0.45 : 0.45) }
          : this.spotIn(coop.run);
      }
      return;
    }
    const dx = hen.target.x - hen.at.x;
    const dz = hen.target.z - hen.at.z;
    const dist = Math.hypot(dx, dz);
    const step = HEN_SPEED * dt;
    model.rotation.x = 0;
    if (dist <= step) {
      hen.at = { ...hen.target };
      hen.peck = PECK_SECONDS[0] + this.random() * (PECK_SECONDS[1] - PECK_SECONDS[0]);
    } else {
      hen.at = { x: hen.at.x + (dx / dist) * step, z: hen.at.z + (dz / dist) * step };
      model.rotation.y = Math.atan2(dx, dz);
    }
    // A little hop in the step.
    model.position.set(hen.at.x, Math.abs(Math.sin(this.time * 14 + hen.phase)) * 0.05, hen.at.z);
  }
}
