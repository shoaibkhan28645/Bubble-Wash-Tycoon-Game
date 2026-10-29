import { Group, Mesh, MeshLambertMaterial } from 'three';
import { asset } from '../assets';
import { toyMaterial } from './build';
import { plate } from './kit';

const glassMaterial = new MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.2, depthWrite: false });

/**
 * The detailing garage, modelled in Blender (art/blender/detailing.py):
 * lilac and white walls with windows, rolled-up doors, a glass roof, a
 * two-post lift, a tool wall, a tool chest, a vacuum and a tyre stack.
 */
export function detailingModel(): Group {
  const group = new Group();
  const garage = asset('building:detailing').scene.clone(true);
  garage.traverse((node) => {
    if (node instanceof Mesh) node.material = node.name.endsWith('_glass') ? glassMaterial : toyMaterial;
  });
  // The sign board over the way out (art/blender/detailing.py), in the game's axes.
  const sign = plate('DETAILING', 2.25, 0.36, '#9a7cf0', false);
  sign.position.set(0, 2.92, 2.33);
  group.add(garage, sign);
  return group;
}
