// Beach Boardwalk's buildings and props, modelled in Blender
// (art/blender/boardwalk.py), all in one file: the ice-cream kiosk,
// parasols, the menu board, palm trees, the lifeguard tower and the pier gate.
import { BufferGeometry, Matrix4, Mesh, type Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Point } from '../../core/config';
import { asset, plain } from '../assets';
import { toyMaterial } from './build';

/** One model out of the file, standing on its own base at the origin (quantizing moved the mesh's own node). */
export function boardwalkPiece(name: string): Object3D {
  const source = asset('building:boardwalk').scene.getObjectByName(name);
  if (!source) throw new Error(`No boardwalk model called ${name}`);
  const copy = source.clone(true);
  copy.position.set(0, 0, 0);
  copy.traverse((node) => {
    if (node instanceof Mesh) node.material = toyMaterial;
  });
  return copy;
}

/** Which model each of the boardwalk's pads shows once built (staff have none). */
const PAD_MODELS: Record<string, string> = {
  kiosk: 'bw_kiosk',
  kiosk2: 'bw_kiosk',
  parasols: 'bw_parasols',
  menu: 'bw_menu',
  lifeguard: 'bw_lifeguard',
  pier: 'bw_pier',
};

export function boardwalkPadModel(id: string): Object3D | null {
  const name = PAD_MODELS[id];
  return name ? boardwalkPiece(name) : null;
}

/**
 * What the player can't walk through, per pad, as boxes of half width, half
 * depth and an offset from the pad: the stall's counter and freezer (its
 * sides are open, for whoever works it), the menu board, the pier gate's posts.
 */
export const BOARDWALK_SOLIDS: Record<string, [number, number, number?, number?][]> = {
  kiosk: [
    [1.4, 0.3, 0, 0.7],
    [1.2, 0.22, 0, -0.85],
  ],
  menu: [[0.5, 0.35]],
  pier: [
    [0.25, 0.25, -2, 0],
    [0.25, 0.25, 2, 0],
  ],
};
BOARDWALK_SOLIDS.kiosk2 = BOARDWALK_SOLIDS.kiosk!;

/** Every palm tree in one mesh (one draw call). */
export function palms(points: readonly Point[]): Mesh {
  const source = asset('building:boardwalk').scene.getObjectByName('bw_palm');
  if (!source) throw new Error('No palm model');
  source.updateMatrixWorld(true);
  const inverseBase = new Matrix4().copy(source.matrixWorld).invert();
  const pieces: BufferGeometry[] = [];
  points.forEach((p, i) => {
    // Each palm turned a little differently, so the row doesn't look stamped.
    const place = new Matrix4().makeRotationY(i * 1.7).setPosition(p.x, 0, p.z);
    source.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const local = new Matrix4().multiplyMatrices(inverseBase, node.matrixWorld);
      pieces.push(plain(node.geometry as BufferGeometry).applyMatrix4(new Matrix4().multiplyMatrices(place, local)));
    });
  });
  const merged = mergeGeometries(pieces);
  for (const piece of pieces) piece.dispose();
  if (!merged) throw new Error('Could not merge the palms');
  const mesh = new Mesh(merged, toyMaterial);
  mesh.name = 'palms';
  mesh.castShadow = true;
  return mesh;
}
