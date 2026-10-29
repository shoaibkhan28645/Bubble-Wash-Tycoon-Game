import { Mesh, type Object3D } from 'three';
import { asset } from '../assets';
import { toyMaterial } from './build';
import { plate } from './kit';

/** The fan turns this fast (radians a second): idling, and blasting while a car dries. */
const SPIN = { idle: 2, busy: 14 };

/**
 * The dryer, modelled in Blender (art/blender/dryer.py): blower towers with
 * round nozzles either side, a hood with the DRYER sign, a big fan on top
 * that spins up while a car is drying, a towel rack and a laundry basket.
 */
export class DryerModel {
  readonly root: Object3D;
  private fan: Object3D | null = null;

  constructor() {
    this.root = asset('building:dryer').scene.clone(true);
    this.root.traverse((node) => {
      if (node instanceof Mesh) node.material = toyMaterial;
      if (node.name === 'dryer_fan') this.fan = node;
    });
    // The sign board on the front of the hood (art/blender/dryer.py), in the game's axes.
    const sign = plate('DRYER', 1.9, 0.34, '#2f80d1', false);
    sign.position.set(0, 2.79, 0.44);
    this.root.add(sign);
  }

  update(dt: number, busy: boolean): void {
    if (this.fan) this.fan.rotation.y += dt * (busy ? SPIN.busy : SPIN.idle);
  }
}
