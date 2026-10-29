import { Mesh, MeshLambertMaterial, type Object3D } from 'three';
import { asset } from '../assets';
import { toyMaterial } from './build';
import { plate } from './kit';

/** Brushes turn this fast (radians a second): slowly when idle, fast with a car inside. */
const SPIN = { idle: 1.5, busy: 9 };

const glassMaterial = new MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.35, depthWrite: false });

/**
 * The automatic brush tunnel, modelled in Blender (art/blender/tunnel.py):
 * a striped entrance arch with its CAR WASH sign and curtains, glass walls,
 * an open top, four side brushes and an overhead roller that spin.
 */
export class TunnelModel {
  readonly root: Object3D;
  private readonly sides: Object3D[] = [];
  private roller: Object3D | null = null;

  constructor() {
    this.root = asset('building:tunnel').scene.clone(true);
    this.root.traverse((node) => {
      if (node instanceof Mesh) node.material = node.name === 'tunnel_glass' ? glassMaterial : toyMaterial;
      if (node.name.startsWith('brush_side')) this.sides.push(node);
      if (node.name === 'brush_roller') this.roller = node;
    });
    // The words on the sign board over the way in (its front face, from art/blender/tunnel.py).
    const sign = plate('CAR WASH', 3.4, 0.8, '#5bbcff', false);
    sign.position.set(0, 5.55, -3.97);
    this.root.add(sign);
  }

  update(dt: number, busy: boolean): void {
    const step = dt * (busy ? SPIN.busy : SPIN.idle);
    // Brushes either side turn opposite ways, scrubbing towards the middle.
    for (const brush of this.sides) brush.rotation.y += step * (brush.position.x > 0 ? 1 : -1);
    if (this.roller) this.roller.rotation.x += step;
  }
}
