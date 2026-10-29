// The Mini-Mart across the road, modelled in Blender (art/blender/mini_mart.py):
// a little shop with a window full of snacks, a striped awning, a giant soda
// cup on the roof, and its till out front under a parasol.
import { Group, Mesh, PlaneGeometry } from 'three';
import { asset } from '../assets';
import { mergeParts, toyMaterial } from './build';
import { plate } from './kit';

/** How far in front of the shop's middle (its +z face) the till stands. */
export const MART_TILL_Z = 3.6;
/** The sign board above the awning (art/blender/mini_mart.py), in the game's axes. */
const SIGN = { y: 2.52, z: 2.03 };

/** Paving from the forecourt's edge out to the pavement by the road. */
const paving = mergeParts([{ geometry: new PlaneGeometry(5.8, 7.5), color: '#d9d2c4', y: 0.016, z: 1.95, rx: -Math.PI / 2 }]);

/** Centred on the shop; the till stands out front (towards +z). */
export function martModel(): Group {
  const group = new Group();
  const shop = asset('building:mini-mart').scene.clone(true);
  shop.traverse((node) => {
    if (node instanceof Mesh) node.material = toyMaterial;
  });
  const sign = plate('MINI MART', 3.2, 0.44, '#ff5fa8', false);
  sign.position.set(0, SIGN.y, SIGN.z);
  group.add(new Mesh(paving, toyMaterial), shop, sign);
  return group;
}
