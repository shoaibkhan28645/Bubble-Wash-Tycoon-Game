// The gift shop's shelves (Starlight Fun Park): every plush toy won at the
// ring toss sits on them, in its own colour, in the shelf's order (two
// shelves of six, lower first, left to right). One instanced mesh.
import { Color, InstancedMesh, MeshLambertMaterial, Object3D, SphereGeometry, type Scene } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Point } from '../core/config';
import type { Plush } from '../systems/prizes';

/** The places on the shelves, from the shop's middle (art/blender/park.py's gift shop): six across, two shelves up. */
const ACROSS = 6;
const FIRST_X = -1.25;
const STEP_X = 0.5;
const SHELF_Y = [1.515, 2.065];
const SHELF_Z = -1.0;

/** A little teddy: a round body, a head, two ears (metres). */
function teddy(): SphereGeometry {
  const body = new SphereGeometry(0.12, 10, 8);
  const head = new SphereGeometry(0.09, 10, 8).translate(0, 0.17, 0.01);
  const ears = [-1, 1].map((side) => new SphereGeometry(0.035, 6, 5).translate(side * 0.065, 0.245, 0.01));
  return mergeGeometries([body, head, ...ears]) as SphereGeometry;
}

export class PlushShelf {
  private readonly mesh: InstancedMesh;
  private readonly color = new Color();

  constructor(scene: Scene, shop: Point) {
    this.mesh = new InstancedMesh(teddy(), new MeshLambertMaterial({ color: '#ffffff' }), ACROSS * SHELF_Y.length);
    this.mesh.name = 'plush-shelf';
    this.mesh.count = 0;
    const place = new Object3D();
    for (let i = 0; i < ACROSS * SHELF_Y.length; i++) {
      place.position.set(shop.x + FIRST_X + (i % ACROSS) * STEP_X, SHELF_Y[Math.floor(i / ACROSS)]!, shop.z + SHELF_Z);
      // Each one sits a little askew, the way toys do on a shelf.
      place.rotation.set(0, ((i * 37) % 7) * 0.08 - 0.24, ((i * 13) % 5) * 0.04 - 0.08);
      place.updateMatrix();
      this.mesh.setMatrixAt(i, place.matrix);
      this.mesh.setColorAt(i, this.color.set('#ffffff'));
    }
    scene.add(this.mesh);
  }

  /** The toys on the shelf now. */
  show(toys: readonly Plush[]): void {
    const n = Math.min(toys.length, ACROSS * SHELF_Y.length);
    toys.slice(0, n).forEach((toy, i) => this.mesh.setColorAt(i, this.color.set(toy.color)));
    this.mesh.count = n;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
