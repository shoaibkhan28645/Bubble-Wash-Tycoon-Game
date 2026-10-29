import { Mesh, type Object3D } from 'three';
import { asset } from '../assets';
import { toyMaterial } from './build';
import { plate } from './kit';

/** The polishing pads turn this fast (radians a second): still when idle, buffing while a car is waxed. */
const SPIN = { idle: 0, busy: 12 };

/**
 * The wax and polish station, modelled in Blender (art/blender/wax.py):
 * golden towers holding polishing pads against the car (they spin while a
 * car is waxed), a foam bar with red, yellow and blue nozzles and the WAX
 * sign, golden stars, and a cart of wax tins.
 */
export class WaxModel {
  readonly root: Object3D;
  private readonly pads: Object3D[] = [];

  constructor() {
    this.root = asset('building:wax').scene.clone(true);
    this.root.traverse((node) => {
      if (node instanceof Mesh) node.material = toyMaterial;
      if (node.name.startsWith('wax_pad')) this.pads.push(node);
    });
    // The sign board on the front of the foam bar (art/blender/wax.py), in the game's axes.
    const sign = plate('WAX', 1.25, 0.3, '#e0a020', false);
    sign.position.set(0, 2.62, 0.31);
    this.root.add(sign);
  }

  update(dt: number, busy: boolean): void {
    // Pads either side turn opposite ways, buffing towards the car.
    const step = dt * (busy ? SPIN.busy : SPIN.idle);
    for (const pad of this.pads) pad.rotation.x += step * (pad.position.x > 0 ? 1 : -1);
  }
}
