// The cars modelled in Blender (art/blender/cars.py), each as one geometry
// (one draw call): the body and its four wheels. Each wheel's vertices carry
// the wheel's centre and whether it's a front one (attribute `wheel`), so the
// car's shader (mud.ts) can roll the wheels and steer the front ones.
import { Box3, BufferAttribute, Matrix4, Mesh, Vector3, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAR_FILES, asset, hasModel, plain, specialCarFile } from './assets';

const geometries = new Map<string, BufferGeometry>();

/** A car by name, as one geometry standing on its own base, nose towards +z (its wheels' radius in userData.wheelRadius). */
export function carGeometry(name: string): BufferGeometry {
  const cached = geometries.get(name);
  if (cached) return cached;
  for (const file of [specialCarFile(name).id, ...CAR_FILES]) {
    const base = hasModel(file) ? asset(file).scene.getObjectByName(name) : undefined;
    if (!base) continue;
    base.updateMatrixWorld(true);
    const inverse = new Matrix4().copy(base.matrixWorld).invert();
    const pieces: BufferGeometry[] = [];
    let radius = 0.3;
    base.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      // Modelled facing -Y in Blender, which is +z here: already nose first.
      const piece = plain(node.geometry as BufferGeometry).applyMatrix4(new Matrix4().multiplyMatrices(inverse, node.matrixWorld));
      const wheel = new Float32Array(piece.getAttribute('position').count * 4);
      if (node.name.includes('_wheel_')) {
        const box = new Box3().setFromBufferAttribute(piece.getAttribute('position') as BufferAttribute);
        const centre = box.getCenter(new Vector3());
        radius = (box.max.y - box.min.y) / 2;
        const kind = centre.z > 0 ? 2 : 1;
        for (let i = 0; i < wheel.length; i += 4) wheel.set([centre.x, centre.y, centre.z, kind], i);
      }
      piece.setAttribute('wheel', new BufferAttribute(wheel, 4));
      pieces.push(piece);
    });
    const geometry = pieces.length === 1 ? pieces[0]! : mergeGeometries(pieces);
    if (!geometry) break;
    geometry.computeBoundingSphere();
    geometry.userData.wheelRadius = radius;
    geometries.set(name, geometry);
    return geometry;
  }
  throw new Error(`No car model called ${name}`);
}
