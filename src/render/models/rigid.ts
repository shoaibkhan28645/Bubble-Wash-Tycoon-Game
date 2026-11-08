// Models made of rigid moving parts (an animal's head, legs, tail and wings;
// a vehicle's wheels and reel) drawn as one skinned mesh: each part becomes
// a bone where it was, with its name, so the code that turns it carries on
// as before, and the whole model is one draw call instead of one a part.
// (A farm with its flock, herd and machines was over fifty draw calls of
// parts, the biggest share of a phone's frame there.)
import {
  Bone,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  Mesh,
  Skeleton,
  SkinnedMesh,
  Vector3,
  type Material,
  type Object3D,
  type Scene,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { plain } from '../assets';

/** Each kind of model's parts, merged once and shared by every copy (the parts come in the same order in each). */
const merged = new Map<string, BufferGeometry>();
const offset = new Matrix4();

/**
 * A skeleton that sends its bones to the GPU only when one has moved: a
 * parked van's cost nothing a frame (three.js sends every skeleton every
 * frame).
 */
class RigidSkeleton extends Skeleton {
  override update(): void {
    const { bones, boneInverses, boneMatrices } = this;
    if (!boneMatrices) return;
    let moved = false;
    for (let i = 0; i < bones.length; i++) {
      offset.multiplyMatrices(bones[i]!.matrixWorld, boneInverses[i]!);
      const e = offset.elements;
      const at = i * 16;
      for (let k = 0; k < 16; k++) {
        if (boneMatrices[at + k] !== e[k]) {
          boneMatrices[at + k] = e[k]!;
          moved = true;
        }
      }
    }
    if (moved && this.boneTexture) this.boneTexture.needsUpdate = true;
  }
}

/**
 * Makes `model`'s parts painted in `material` into one skinned mesh, in
 * place: every such mesh becomes a bone (same name, same place, keeping its
 * children), and the mesh drawn is bound to those bones, so each vertex
 * follows its own part exactly, drawn in `drawWith` (the same paint, its own
 * material). `key` names the kind of model (copies of a kind share the
 * merged geometry). Returns the skinned mesh, or null if the
 * model has fewer than two parts to join.
 */
export function rigidSkin(model: Object3D, material: Material, key: string, drawWith: Material = material): SkinnedMesh | null {
  model.updateMatrixWorld(true);
  const parts: Mesh[] = [];
  model.traverse((node) => {
    if (node instanceof Mesh && !(node instanceof SkinnedMesh) && node.material === material) parts.push(node);
  });
  if (parts.length < 2) return null;
  let geometry = merged.get(key);
  if (!geometry) {
    geometry = mergeParts(model, parts);
    merged.set(key, geometry);
  }
  const bones: Bone[] = [];
  const size = new Vector3();
  for (const part of parts) {
    const bone = new Bone();
    bone.name = part.name;
    bone.position.copy(part.position);
    bone.quaternion.copy(part.quaternion);
    bone.scale.copy(part.scale);
    bone.rotation.order = part.rotation.order;
    // How tall the part is (a wheel's height gives its radius), now that it has no shape of its own.
    bone.userData = { ...part.userData, height: new Box3().setFromObject(part).getSize(size).y };
    for (const child of [...part.children]) bone.add(child);
    const parent = part.parent!;
    parent.children[parent.children.indexOf(part)] = bone;
    bone.parent = parent;
    part.parent = null;
    bones.push(bone);
  }
  const skinned = new SkinnedMesh(geometry, drawWith);
  skinned.name = `${key}:parts`;
  model.add(skinned);
  model.updateMatrixWorld(true);
  skinned.bind(new RigidSkeleton(bones));
  return skinned;
}

/** The parts' shapes in the model's own space, each vertex tied wholly to its part's bone. */
function mergeParts(model: Object3D, parts: Mesh[]): BufferGeometry {
  const toModel = new Matrix4().copy(model.matrixWorld).invert();
  let pieces = parts.map((part, bone) => {
    const geometry = plain(part.geometry as BufferGeometry).applyMatrix4(new Matrix4().multiplyMatrices(toModel, part.matrixWorld));
    const count = geometry.getAttribute('position').count;
    const index = new Uint16Array(count * 4);
    const weight = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      index[i * 4] = bone;
      weight[i * 4] = 1;
    }
    geometry.setAttribute('skinIndex', new BufferAttribute(index, 4));
    geometry.setAttribute('skinWeight', new BufferAttribute(weight, 4));
    return geometry;
  });
  // Joined pieces must all have an index, or none.
  if (pieces.some((p) => !p.index)) pieces = pieces.map((p) => (p.index ? p.toNonIndexed() : p));
  const geometry = mergeGeometries(pieces);
  for (const piece of pieces) piece.dispose();
  if (!geometry) throw new Error('Could not join the parts of a model');
  return geometry;
}

/**
 * A hidden skinned shape in `material`, so the look is compiled with the
 * town's behind the loading screen, not when the first animal or machine
 * arrives (a phone can take a second or more to compile it).
 */
export function warmRigidSkin(scene: Scene, material: Material): void {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(9), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(9), 3));
  geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(12), 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4));
  const bone = new Bone();
  const mesh = new SkinnedMesh(geometry, material);
  mesh.name = 'warm:parts';
  mesh.add(bone);
  mesh.visible = false;
  mesh.frustumCulled = false;
  scene.add(mesh);
  mesh.updateMatrixWorld(true);
  mesh.bind(new Skeleton([bone]));
}
