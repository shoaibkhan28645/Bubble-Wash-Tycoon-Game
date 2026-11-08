// The ways a busy town is drawn with fewer draw calls (and less work a frame)
// still draw the same thing: animals and machines as one skinned mesh, every
// carried item instanced, and the road rules' kept sums.
import { describe, expect, it } from 'vitest';
import { Bone, BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial, Scene, SkinnedMesh, Vector3 } from 'three';
import type { Point } from '../src/core/config';
import { rigidSkin } from '../src/render/models/rigid';
import { Carrier, carriedItems, type CarryItem } from '../src/systems/carry';
import type { Car } from '../src/systems/cars';
import { RoadRules } from '../src/systems/roadRules';

describe('a model of moving parts drawn as one', () => {
  it('turns each part into a bone of the same name, and its shape follows the bone as the part did', () => {
    const paint = new MeshLambertMaterial();
    const model = new Group();
    model.name = 'toy';
    const body = new Mesh(new BoxGeometry(1, 1, 1), paint);
    body.name = 'toy_mesh';
    const leg = new Mesh(new BoxGeometry(0.2, 0.6, 0.2), paint);
    leg.name = 'toy_leg';
    leg.position.set(1, -0.5, 0);
    const marker = new Group();
    marker.name = 'toy_smoke';
    leg.add(marker);
    model.add(body, leg);
    model.position.set(5, 0, 2);
    model.rotation.y = 0.7;

    const skinned = rigidSkin(model, paint, 'toy-test');
    expect(skinned).toBeInstanceOf(SkinnedMesh);
    const bone = model.getObjectByName('toy_leg')!;
    expect(bone).toBeInstanceOf(Bone);
    expect(bone.position.toArray()).toEqual([1, -0.5, 0]);
    // A marker on a part stays on it.
    expect(model.getObjectByName('toy_smoke')!.parent).toBe(bone);
    expect(model.children.filter((c) => c instanceof Mesh && !(c instanceof SkinnedMesh))).toHaveLength(0);

    // Swing the leg and move the whole model: a leg vertex lands where the leg mesh's would have.
    bone.rotation.z = 0.9;
    model.position.set(-3, 1, 4);
    model.updateMatrixWorld(true);
    const legVertices = leg.geometry.getAttribute('position');
    const first = body.geometry.getAttribute('position').count;
    for (const i of [0, 5, 11]) {
      const expected = new Vector3().fromBufferAttribute(legVertices, i).applyMatrix4(bone.matrixWorld);
      const drawn = skinned!.getVertexPosition(first + i, new Vector3()).applyMatrix4(skinned!.matrixWorld);
      expect(drawn.distanceTo(expected)).toBeLessThan(1e-4);
    }
  });

  it('leaves a model with one part alone', () => {
    const paint = new MeshLambertMaterial();
    const model = new Group();
    model.add(new Mesh(new BoxGeometry(), paint));
    expect(rigidSkin(model, paint, 'one-part-test')).toBeNull();
  });
});

describe('carried items drawn together', () => {
  it('puts every carrier’s items on show into one instanced mesh a kind', () => {
    const scene = new Scene();
    carriedItems.attach(scene);
    const mesh = (type: CarryItem) => scene.getObjectByName(`carried:${type}`) as InstancedMesh;
    const back = new Group();
    const other = new Group();
    scene.add(back, other);
    const a = new Carrier<CarryItem>(back, () => ({ x: 0, z: 0 }), () => 10);
    const b = new Carrier<CarryItem>(other, () => ({ x: 0, z: 0 }), () => 10);
    a.push('veg');
    a.push('corn');
    a.push('veg');
    b.push('veg');
    carriedItems.update();
    expect(mesh('veg').count).toBe(3);
    expect(mesh('corn').count).toBe(1);
    expect(mesh('eggs').visible).toBe(false);
    a.remove('veg');
    other.visible = false;
    carriedItems.update();
    expect(mesh('veg').count).toBe(1);
    // Each item sits where its carrier holds it: the stack climbs.
    back.position.set(3, 0, 1);
    carriedItems.update();
    const matrix = new Matrix4();
    mesh('corn').getMatrixAt(0, matrix);
    const at = new Vector3().setFromMatrixPosition(matrix);
    expect(at.x).toBeCloseTo(3);
    expect(at.z).toBeCloseTo(1 - 0.5);
    carriedItems.detach();
    expect(scene.getObjectByName('carried:veg')).toBeUndefined();
  });
});

describe('road rules keep their sums only while nothing has changed', () => {
  /** A car driving straight along its points (a fresh array is a new route, as in the game). */
  type Mover = Omit<Car, 'position' | 'facing'> & { position: Point; facing: number; path: Point[] };
  function car(x: number, z: number, path: Point[], facing = 0): Mover {
    return {
      position: { x, z },
      path,
      get pathKey(): Point[] {
        return (this as { path: Point[] }).path;
      },
      aim(this: { position: Point; path: Point[] }, d: number) {
        let at = this.position;
        let left = d;
        for (const p of this.path) {
          const step = Math.hypot(p.x - at.x, p.z - at.z);
          if (step >= left) return { x: at.x + ((p.x - at.x) * left) / step, z: at.z + ((p.z - at.z) * left) / step };
          left -= step;
          at = p;
        }
        return this.path.length > 0 ? at : null;
      },
      facing,
      def: { size: [1.7, 1.5, 3] },
      model: { mesh: { visible: true } },
      state: 'arriving',
      station: null,
      serial: 0,
      held: false,
      heldFor: 0,
    } as unknown as Mover;
  }

  it('sees the car in front move off, come back, and a new route turn the car away from it', () => {
    const me = car(0, 0, [{ x: 0, z: 10 }]);
    const front = car(0, 3.2, []);
    const rules = new RoadRules(() => [me, front] as unknown as Car[], () => []);
    const blocked = (c: Mover) => rules.blocked(c as unknown as Car);
    expect(blocked(me)).toBe(true);
    front.position = { x: 0, z: 30 };
    expect(blocked(me)).toBe(false);
    front.position = { x: 0, z: 3.2 };
    expect(blocked(me)).toBe(true);
    // Same spot, a new route the other way: it's no longer heading into the car.
    me.path = [{ x: 0, z: -10 }];
    me.facing = Math.PI;
    expect(blocked(me)).toBe(false);
  });
});
