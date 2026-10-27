import { Group, Mesh, type Object3D } from 'three';
import { box, cylinder, mergeParts, toyMaterial } from '../render/models/build';
import type { Point } from '../core/config';

/** Supply items: soap bottles, folded towels, wax tins. */
export type SupplyType = 'soap' | 'towel' | 'wax';

const ITEM_HEIGHT = 0.24;

const itemMeshes: Record<SupplyType, () => Mesh> = (() => {
  const make = (parts: Parameters<typeof mergeParts>[0]) => {
    const geometry = mergeParts(parts);
    return () => new Mesh(geometry, toyMaterial);
  };
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
  };
})();

/** Anyone who carries supplies (the player, the runner): a stack on their back. */
export class Carrier {
  readonly stack: SupplyType[] = [];
  /** Seconds until the next item can be picked up or handed over. */
  timer = 0;
  private readonly pile = new Group();
  private sway = 0;

  constructor(
    attachTo: Object3D,
    private readonly where: () => Point,
    readonly capacity: () => number,
  ) {
    // On the back, above the waist; items are drawn large enough to read on a phone.
    this.pile.position.set(0, 1.0, -0.5);
    this.pile.scale.setScalar(1.6);
    attachTo.add(this.pile);
  }

  get position(): Point {
    return this.where();
  }

  get full(): boolean {
    return this.stack.length >= this.capacity();
  }

  count(type: SupplyType): number {
    return this.stack.filter((item) => item === type).length;
  }

  push(type: SupplyType): void {
    this.stack.push(type);
    const mesh = itemMeshes[type]();
    mesh.position.y = (this.stack.length - 1) * ITEM_HEIGHT;
    mesh.rotation.y = (this.stack.length % 2) * 0.3;
    this.pile.add(mesh);
  }

  /** Takes the top-most item of a type off the stack. */
  remove(type: SupplyType): boolean {
    const index = this.stack.lastIndexOf(type);
    if (index < 0) return false;
    this.stack.splice(index, 1);
    this.pile.remove(this.pile.children[index]!);
    this.pile.children.forEach((child, i) => (child.position.y = i * ITEM_HEIGHT));
    return true;
  }

  /** A little wobble so the stack feels physical. */
  update(dt: number, moving: boolean): void {
    this.timer = Math.max(0, this.timer - dt);
    this.sway += dt * (moving ? 10 : 2);
    this.pile.rotation.z = Math.sin(this.sway) * (moving ? 0.06 : 0.015) * Math.min(1, this.stack.length / 4);
  }
}
