// Things that come and go in the theme park: litter dropped on the paths,
// and the delivery truck's runs to the supply shed (in from the road, a stop
// at the shed, backed out to the road and away), its wheels turning.
import { Group, Mesh, type BufferGeometry, type Object3D, type Scene } from 'three';
import type { Point } from '../core/config';
import type { LitterPiece } from '../systems/litter';
import { blobShadow } from './models/actors';
import { box, cylinder, mergeParts, skinnedToyMaterial, sphere, toyMaterial } from './models/build';
import { parkModel } from './models/park';
import { rigidSkin } from './models/rigid';

/** A paper cup, a sweet wrapper, a candy floss stick. */
const LITTER: BufferGeometry[] = [
  mergeParts([
    { geometry: cylinder(0.07, 0.15, 10), color: '#ffffff', y: 0.07, rx: Math.PI / 2 - 0.2 },
    { geometry: cylinder(0.072, 0.05, 10), color: '#ff5c6c', y: 0.07, z: 0.03, rx: Math.PI / 2 - 0.2 },
  ]),
  mergeParts([
    { geometry: box(0.2, 0.03, 0.13), color: '#ffd24a', y: 0.015, ry: 0.4 },
    { geometry: box(0.08, 0.04, 0.14), color: '#ff8fc8', x: 0.05, y: 0.02, ry: 0.4 },
  ]),
  mergeParts([
    { geometry: cylinder(0.012, 0.26, 5), color: '#ffffff', y: 0.012, rz: Math.PI / 2 },
    { geometry: sphere(0.05, 6), color: '#ffb3d9', x: 0.13, y: 0.04 },
  ]),
];

/** Litter on the ground: a small model for each piece. */
export class LitterView {
  private readonly meshes = new Map<LitterPiece, Mesh>();

  constructor(private readonly scene: Scene) {}

  add(piece: LitterPiece): void {
    const mesh = new Mesh(LITTER[piece.kind % LITTER.length], toyMaterial);
    mesh.position.set(piece.at.x, 0.03, piece.at.z);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.meshes.set(piece, mesh);
  }

  remove(piece: LitterPiece): void {
    const mesh = this.meshes.get(piece);
    if (!mesh) return;
    mesh.removeFromParent();
    this.meshes.delete(piece);
  }
}

/** The truck's speed on the road and in the yard (metres a second), and how long it stops at the shed. */
const ROAD_SPEED = 7;
const YARD_SPEED = 3;
const STOP_SECONDS = 2.6;
const WHEEL_RADIUS = 0.45;

/**
 * The delivery truck: it drives in from the road to the shed, stops there
 * while its load goes in, backs out onto the road and drives away. One run
 * at a time; out of sight between runs.
 */
export class DeliveryTruck {
  readonly group = new Group();
  private readonly wheels: Object3D[] = [];
  /** The run: points still to drive to, whether backing up to each, and the stop. */
  private legs: { to: Point; reverse: boolean; slow: boolean }[] = [];
  private stopLeft = 0;
  private stopped = false;
  private at: Point;

  constructor(
    scene: Scene,
    private readonly route: { truckIn: Point[]; truckOut: Point[] },
    /** At the shed: the load goes in. */
    private readonly onArrive: () => void,
  ) {
    const model = parkModel('pk_truck');
    rigidSkin(model, toyMaterial, 'pk_truck', skinnedToyMaterial);
    model.traverse((node) => {
      node.castShadow = false;
      node.receiveShadow = true;
    });
    for (let i = 0; i < 4; i++) {
      const wheel = model.getObjectByName(`pk_truck_wheel${i}`);
      if (wheel) this.wheels.push(wheel);
    }
    this.group.add(model, blobShadow(2.8, 5.4, 2.5, 'box'));
    this.group.visible = false;
    this.at = { ...route.truckIn[0]! };
    scene.add(this.group);
  }

  get busy(): boolean {
    return this.group.visible;
  }

  /** Off on a run (if not on one already). */
  send(): void {
    if (this.busy) return;
    const { truckIn, truckOut } = this.route;
    this.at = { ...truckIn[0]! };
    this.group.position.set(this.at.x, 0, this.at.z);
    this.legs = truckIn.slice(1).map((to, i) => ({ to, reverse: false, slow: i >= truckIn.length - 3 }));
    this.legs.push({ to: truckOut[0]!, reverse: true, slow: true });
    for (const to of truckOut.slice(1)) this.legs.push({ to, reverse: false, slow: false });
    this.stopped = false;
    this.group.visible = true;
  }

  update(dt: number): void {
    if (!this.busy) return;
    if (this.stopLeft > 0) {
      this.stopLeft -= dt;
      return;
    }
    const leg = this.legs[0];
    if (!leg) {
      this.group.visible = false;
      return;
    }
    // The stop at the shed comes before the first leg driven backwards.
    if (leg.reverse && !this.stopped) {
      this.stopped = true;
      this.stopLeft = STOP_SECONDS;
      this.onArrive();
      return;
    }
    const dx = leg.to.x - this.at.x;
    const dz = leg.to.z - this.at.z;
    const d = Math.hypot(dx, dz);
    const step = Math.min(d, (leg.slow ? YARD_SPEED : ROAD_SPEED) * dt);
    if (d > 1e-3) {
      this.at = { x: this.at.x + (dx / d) * step, z: this.at.z + (dz / d) * step };
      // Facing the way it goes (or away from it, backing up), turning smoothly.
      const want = leg.reverse ? Math.atan2(-dx, -dz) : Math.atan2(dx, dz);
      const turn = Math.atan2(Math.sin(want - this.group.rotation.y), Math.cos(want - this.group.rotation.y));
      this.group.rotation.y += turn * Math.min(1, dt * 5);
      for (const wheel of this.wheels) wheel.rotation.x += ((leg.reverse ? -1 : 1) * step) / WHEEL_RADIUS;
    }
    this.group.position.set(this.at.x, 0, this.at.z);
    if (d - step < 1e-3) this.legs.shift();
  }
}
