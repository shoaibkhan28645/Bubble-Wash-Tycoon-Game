// The town round the car wash (art/blender/town.py): shops along Main
// Street, homes with gardens, street lamps, the bus stop and café tables,
// placed from the layout and merged into a few meshes by area, with
// each shop's name painted on its sign board.
import { BufferGeometry, Group, Matrix4, Mesh, type Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { LocationLayout, TownPiece } from '../../core/config';
import { asset, plain } from '../assets';
import { toyMaterial } from './build';
import { plate } from './kit';

/** The shop sign board's front, from the shop's middle (art/blender/town.py). */
const SIGN = { y: 3.55, z: 2.66, width: 3.4, height: 0.6 };

/** The named model, from the homes, shops or props file. */
function source(name: string): Object3D {
  const file = name.startsWith('prop_') ? 'building:props' : name.startsWith('house_') ? 'building:town-homes' : 'building:town-shops';
  const found = asset(file).scene.getObjectByName(name);
  if (!found) throw new Error(`No town model called ${name}`);
  return found;
}

/** The town is merged in squares this size, so the ones off screen aren't drawn. */
const CHUNK = 16;

export function townModel(layout: LocationLayout): Group {
  const group = new Group();
  const chunks = new Map<string, BufferGeometry[]>();
  const place = new Matrix4();
  for (const piece of layout.town) {
    place.makeRotationY(piece.rot ?? 0).setPosition(piece.x, 0, piece.z);
    const base = source(piece.model);
    base.updateMatrixWorld(true);
    // Relative to the model's own base node, wherever it sits in the file.
    const inverseBase = new Matrix4().copy(base.matrixWorld).invert();
    const key = `${Math.floor(piece.x / CHUNK)},${Math.floor(piece.z / CHUNK)}`;
    const pieces = chunks.get(key) ?? [];
    chunks.set(key, pieces);
    base.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const local = new Matrix4().multiplyMatrices(inverseBase, node.matrixWorld);
      pieces.push(plain(node.geometry as BufferGeometry).applyMatrix4(new Matrix4().multiplyMatrices(place, local)));
    });
    if (piece.sign) group.add(signFor(piece));
  }
  for (const [key, pieces] of chunks) {
    const geometry = mergeGeometries(pieces);
    for (const p of pieces) p.dispose();
    if (!geometry) throw new Error(`Could not merge the town at ${key}`);
    geometry.computeBoundingSphere();
    const mesh = new Mesh(geometry, toyMaterial);
    mesh.name = `town:${key}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

function signFor(piece: TownPiece): Mesh {
  const sign = plate(piece.sign!, SIGN.width, SIGN.height, piece.signColor ?? '#2f80d1', false);
  const rot = piece.rot ?? 0;
  sign.position.set(piece.x + Math.sin(rot) * SIGN.z, SIGN.y, piece.z + Math.cos(rot) * SIGN.z);
  sign.rotation.y = rot;
  return sign;
}
