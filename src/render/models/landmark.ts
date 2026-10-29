// Town 1's landmark, the Duck Fountain (art/blender/landmark.py): a giant
// rubber duck in a gold crown, bobbing in a pink basin, with bubbles rising
// from the water round it.
import { Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, type Object3D } from 'three';
import { asset } from '../assets';
import { toyMaterial } from './build';

const BUBBLES = 9;
/** Bubbles rise from the water (its surface and radius, art/blender/landmark.py) this high, then pop. */
const WATER_Y = 0.46;
const WATER_RADIUS = 1.9;
const RISE = 2.6;

const bubbleGeometry = new IcosahedronGeometry(0.13, 1);
const bubbleMaterial = new MeshBasicMaterial({ color: 0xe8f8ff, transparent: true, opacity: 0.7, depthWrite: false });

interface Bubble {
  mesh: Mesh;
  angle: number;
  radius: number;
  age: number;
  speed: number;
}

export class LandmarkModel {
  readonly root = new Group();
  private readonly duck: Object3D | null;
  /** Where the file put the duck's node (quantizing moved it); the bob is added on top. */
  private readonly duckY: number;
  private readonly bubbles: Bubble[] = [];
  private time = 0;

  constructor() {
    const model = asset('building:landmark').scene.clone(true);
    model.traverse((node) => {
      if (node instanceof Mesh) node.material = toyMaterial;
    });
    this.root.add(model);
    this.duck = model.getObjectByName('landmark_duck') ?? null;
    this.duckY = this.duck?.position.y ?? 0;
    for (let i = 0; i < BUBBLES; i++) {
      const mesh = new Mesh(bubbleGeometry, bubbleMaterial);
      // The shadow map is only redrawn when a building pops in: moving things stay out of it.
      mesh.userData.noShadow = true;
      this.root.add(mesh);
      this.bubbles.push({ mesh, angle: 0, radius: 0, age: 0, speed: 0 });
      this.respawn(this.bubbles[i]!, i / BUBBLES);
    }
  }

  update(dt: number): void {
    this.time += dt;
    if (this.duck) {
      this.duck.position.y = this.duckY + Math.sin(this.time * 1.6) * 0.06;
      this.duck.rotation.z = Math.sin(this.time * 1.1) * 0.04;
    }
    for (const b of this.bubbles) {
      b.age += dt * b.speed;
      if (b.age >= 1) this.respawn(b, 0);
      const wobble = Math.sin((b.age + b.angle) * 9) * 0.08;
      b.mesh.position.set(Math.cos(b.angle) * b.radius + wobble, WATER_Y + b.age * RISE, Math.sin(b.angle) * b.radius);
      // Grow as they rise, then pop.
      b.mesh.scale.setScalar(b.age > 0.9 ? (1 - b.age) * 10 * (0.6 + b.age) : 0.6 + b.age);
    }
  }

  private respawn(b: Bubble, age: number): void {
    b.angle = Math.random() * Math.PI * 2;
    b.radius = 1.1 + Math.random() * (WATER_RADIUS - 1.1);
    b.age = age;
    b.speed = 0.28 + Math.random() * 0.2;
  }
}
