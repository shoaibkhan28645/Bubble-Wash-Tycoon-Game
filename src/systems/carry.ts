import { Group, InstancedMesh, Object3D, Scene, type BufferGeometry } from 'three';
import { box, cylinder, instancedToyMaterial, mergeParts, sphere } from '../render/models/build';
import type { Point } from '../core/config';

/** Supply items: soap bottles, folded towels, wax tins. */
export type SupplyType = 'soap' | 'towel' | 'wax';
/** Anything carried: supplies, or a farm's goods (crates of produce by crop id, cartons of eggs, crates of milk bottles). */
export type CarryItem = SupplyType | 'veg' | 'corn' | 'apple' | 'eggs' | 'milk' | 'bread' | 'pie';

const ITEM_HEIGHT = 0.24;

/** A wooden crate heaped with produce in these colours (corn cobs lie across it). */
const crate = (colors: string[], cobs: boolean): Parameters<typeof mergeParts>[0] => [
  { geometry: box(0.44, 0.16, 0.32), color: '#c08a55', y: 0.08 },
  { geometry: box(0.46, 0.04, 0.34), color: '#8f6036', y: 0.15 },
  ...[-0.12, 0, 0.12].map((x, i) =>
    cobs
      ? { geometry: cylinder(0.045, 0.28, 8), color: colors[i % colors.length]!, x, y: 0.2, rx: Math.PI / 2 }
      : { geometry: sphere(0.08, 8), color: colors[i % colors.length]!, x, y: 0.2, z: (i - 1) * 0.05 },
  ),
];

const itemGeometries: Record<CarryItem, BufferGeometry> = (() => {
  const make = (parts: Parameters<typeof mergeParts>[0]) => mergeParts(parts);
  return {
    soap: make([
      { geometry: cylinder(0.13, 0.26), color: '#6cc4ff', y: 0.13 },
      { geometry: cylinder(0.05, 0.08), color: '#ffffff', y: 0.3 },
    ]),
    towel: make([
      { geometry: box(0.42, 0.12, 0.3), color: '#ff8fc8', y: 0.06 },
      { geometry: box(0.42, 0.04, 0.3), color: '#ffffff', y: 0.13 },
    ]),
    wax: make([
      { geometry: cylinder(0.17, 0.14, 14), color: '#ffc94d', y: 0.07 },
      { geometry: cylinder(0.12, 0.04, 14), color: '#ffffff', y: 0.16 },
    ]),
    veg: make(crate(['#ff8a2a', '#9bd36a', '#ff4d3d'], false)),
    corn: make(crate(['#ffd23f'], true)),
    apple: make(crate(['#e53b30', '#ff6a3d', '#e53b30'], false)),
    bread: make([
      { geometry: box(0.44, 0.08, 0.3), color: '#c08a55', y: 0.04 },
      ...[-0.12, 0.12].map((x) => ({ geometry: box(0.2, 0.12, 0.26), color: '#d9a35c', x, y: 0.14 })),
    ]),
    pie: make([
      { geometry: cylinder(0.2, 0.06, 16), color: '#c9873e', y: 0.03 },
      { geometry: cylinder(0.18, 0.06, 16), color: '#e9b35c', y: 0.09 },
      { geometry: box(0.24, 0.02, 0.04), color: '#c9873e', y: 0.13 },
    ]),
    eggs: make([
      { geometry: box(0.42, 0.12, 0.28), color: '#cdd8e4', y: 0.06 },
      ...[-0.13, 0, 0.13].flatMap((x) => [-0.06, 0.06].map((z) => ({ geometry: sphere(0.055, 8), color: '#fff8ec', x, y: 0.15, z }))),
    ]),
    milk: make([
      { geometry: box(0.42, 0.1, 0.3), color: '#3a7fb0', y: 0.05 },
      ...[-0.12, 0.12].flatMap((x) => [-0.07, 0.07].flatMap((z) => [
        { geometry: cylinder(0.055, 0.2, 8), color: '#ffffff', x, y: 0.2, z },
        { geometry: cylinder(0.035, 0.04, 8), color: '#3a7fb0', x, y: 0.32, z },
      ])),
    ]),
  };
})();

/** Most of one kind of item drawn at once (every carrier's together). */
const MAX_ITEMS = 96;

/**
 * Every carried item in the town, drawn as one instanced mesh per kind: a
 * farmhand's stack, the pickup's bed and the packers' cartons were a draw
 * call an item, the biggest share of a busy farm's frame on a phone. Each
 * carrier keeps an empty marker per item (placed and turned as before);
 * each frame the markers of the carriers on show go into the meshes.
 */
class CarriedItems {
  private readonly meshes = new Map<CarryItem, InstancedMesh>();
  private readonly carriers = new Set<Carrier<CarryItem>>();
  private readonly counts = new Map<CarryItem, number>();

  /** A town's scene: its meshes go in (hidden while nothing is carried). */
  attach(scene: Scene): void {
    for (const [type, geometry] of Object.entries(itemGeometries) as [CarryItem, BufferGeometry][]) {
      const mesh = new InstancedMesh(geometry, instancedToyMaterial, MAX_ITEMS);
      mesh.name = `carried:${type}`;
      mesh.count = 0;
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.meshes.set(type, mesh);
    }
  }

  /** Leaving a town: forgets its carriers and meshes. */
  detach(): void {
    for (const mesh of this.meshes.values()) {
      mesh.removeFromParent();
      mesh.dispose();
    }
    this.meshes.clear();
    this.carriers.clear();
  }

  track(carrier: Carrier<CarryItem>): void {
    this.carriers.add(carrier);
  }

  /** Before each frame is drawn: every item on show, where its carrier has it now. */
  update(): void {
    if (this.meshes.size === 0) return;
    this.counts.clear();
    for (const carrier of this.carriers) carrier.draw(this.meshes, this.counts);
    for (const [type, mesh] of this.meshes) {
      const n = this.counts.get(type) ?? 0;
      if (n === 0 && mesh.count === 0) continue;
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.visible = n > 0;
    }
  }
}

export const carriedItems = new CarriedItems();

/** Visible all the way up to the scene. */
function shown(object: Object3D): boolean {
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false;
    if (node instanceof Scene) return true;
  }
  return false;
}

/** Where a stack starts on a person's back: above the waist, just behind them. */
const BACK = [0, 1.0, -0.5] as const;
/** The hero's head is big: his stack starts lower and further back, clear of his hair. */
export const HERO_BACK = [0, 0.66, -0.74] as const;

/** Anyone who carries supplies or crates (the player, the runner, the farmhand): a stack on their back. */
export class Carrier<T extends CarryItem = SupplyType> {
  readonly stack: T[] = [];
  /** Seconds until the next item can be picked up or handed over. */
  timer = 0;
  /** Where the i-th item sits (x, y, z in the pile), if not one on top of another (a trailer's rows). */
  arrange: ((i: number) => [number, number, number]) | null = null;
  private readonly pile = new Group();
  private sway = 0;

  constructor(
    attachTo: Object3D,
    private readonly where: () => Point,
    readonly capacity: () => number,
    /** Where the stack starts on whoever carries it (x, y, z from their feet; -z is behind them). */
    at: readonly [number, number, number] = BACK,
  ) {
    // On the back, above the waist; items are drawn large enough to read on a phone.
    this.pile.position.set(...at);
    this.pile.scale.setScalar(1.6);
    attachTo.add(this.pile);
    carriedItems.track(this as Carrier<CarryItem>);
  }

  get position(): Point {
    return this.where();
  }

  get full(): boolean {
    return this.stack.length >= this.capacity();
  }

  count(type: T): number {
    return this.stack.filter((item) => item === type).length;
  }

  push(type: T): void {
    this.stack.push(type);
    // An empty marker: the item itself is drawn with all the others of its kind (CarriedItems).
    const marker = new Object3D();
    this.put(marker, this.stack.length - 1);
    marker.rotation.y = (this.stack.length % 2) * 0.3;
    this.pile.add(marker);
  }

  /** Adds this carrier's items, where they are now, to the meshes of their kinds (if it's on show). */
  draw(meshes: ReadonlyMap<CarryItem, InstancedMesh>, counts: Map<CarryItem, number>): void {
    if (this.stack.length === 0 || !shown(this.pile)) return;
    this.pile.updateWorldMatrix(true, false);
    this.stack.forEach((type, i) => {
      const marker = this.pile.children[i];
      const mesh = meshes.get(type);
      const n = counts.get(type) ?? 0;
      if (!marker || !mesh || n >= MAX_ITEMS) return;
      marker.updateMatrix();
      marker.matrixWorld.multiplyMatrices(this.pile.matrixWorld, marker.matrix);
      mesh.setMatrixAt(n, marker.matrixWorld);
      counts.set(type, n + 1);
    });
  }

  /** Takes the top-most item of a type off the stack. */
  remove(type: T): boolean {
    const index = this.stack.lastIndexOf(type);
    if (index < 0) return false;
    this.stack.splice(index, 1);
    this.pile.remove(this.pile.children[index]!);
    this.pile.children.forEach((child, i) => this.put(child, i));
    return true;
  }

  private put(item: Object3D, i: number): void {
    if (this.arrange) item.position.set(...this.arrange(i));
    else item.position.set(0, i * ITEM_HEIGHT, 0);
  }

  /** A little wobble so the stack feels physical. */
  update(dt: number, moving: boolean): void {
    this.timer = Math.max(0, this.timer - dt);
    this.sway += dt * (moving ? 10 : 2);
    this.pile.rotation.z = Math.sin(this.sway) * (moving ? 0.06 : 0.015) * Math.min(1, this.stack.length / 4);
  }
}
