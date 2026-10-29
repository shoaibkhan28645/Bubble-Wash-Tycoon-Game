// Props around the lot, modelled in Blender (art/blender/props.py), all in
// one file: hose reel, pay kiosk, supply shelf, bench, vending machine,
// roadside sign and the moving truck to the next town.
import { Group, Mesh, type Object3D } from 'three';
import { asset } from '../assets';
import { toyMaterial } from './build';
import { plate } from './kit';

/** One prop out of the shared file, standing on its own base at the origin (the mesh inside keeps its own node, which quantizing moved). */
function prop(name: string): Object3D {
  const source = asset('building:props').scene.getObjectByName(name);
  if (!source) throw new Error(`No prop called ${name}`);
  const copy = source.clone(true);
  copy.position.set(0, 0, 0);
  copy.traverse((node) => {
    if (node instanceof Mesh) node.material = toyMaterial;
  });
  return copy;
}

/** Garden hose: a wheeled reel cart with a coiled hose, a spray gun and a puddle. */
export const hoseModel = (): Object3D => prop('prop_hose');

/** Pay kiosk: a counter with the till, a card reader and a tip jar under a striped awning. */
export const registerModel = (): Object3D => prop('prop_register');

/** Supply shelf: soap bottles below, towel stacks in the middle, wax tins on top. */
export const shelfModel = (): Object3D => prop('prop_shelf');

/** Waiting bench, with a potted plant. */
export const benchModel = (): Object3D => prop('prop_bench');

/** The truck to the next town: a blue cab and a pink box with bubbles, driving off towards +x. */
export const truckModel = (): Object3D => prop('prop_truck');

/** Snack vending machine, with its lit sign. */
export function vendingModel(): Object3D {
  const group = new Group();
  const panel = plate('SNACKS', 1.0, 0.22, '#ff8a3c', false);
  panel.position.set(0, 1.98, 0.47);
  group.add(prop('prop_vending'), panel);
  return group;
}

/** Roadside sign: a striped pole and a board edged with bulbs, with the name on both faces (the road and the lot). */
export function signModel(): Object3D {
  const group = new Group();
  group.add(prop('prop_sign'));
  for (const side of [-1, 1]) {
    const board = plate('BUBBLE\nWASH', 1.8, 1.3, '#ff6fb0', false);
    board.position.set(0, 4.2, side * 0.14);
    if (side < 0) board.rotation.y = Math.PI;
    group.add(board);
  }
  return group;
}
