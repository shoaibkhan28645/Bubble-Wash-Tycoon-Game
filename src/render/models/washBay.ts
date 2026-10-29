import { Group, Mesh } from 'three';
import { asset } from '../assets';
import { toyMaterial } from './build';
import { plate } from './kit';

/**
 * A self-service hand wash bay, modelled in Blender (art/blender/wash_bay.py):
 * tiled floor, half walls, a hose boom over the car, a coin panel. The
 * game writes its name ("BAY 1") on the sign over the way in.
 */
export function washBayModel(label: string): Group {
  const group = new Group();
  const bay = asset('building:wash-bay').scene.clone(true);
  bay.traverse((node) => {
    if (node instanceof Mesh) node.material = toyMaterial;
  });
  // The sign board's front face (art/blender/wash_bay.py), turned to the game's axes.
  const sign = plate(label, 2.1, 0.56, '#5bbcff');
  sign.position.set(0, 3.55, -2.23);
  group.add(bay, sign);
  return group;
}
