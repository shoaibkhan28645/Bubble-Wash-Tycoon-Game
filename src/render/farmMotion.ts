// Willowbrook in motion (apart from the animals, pens.ts, and the crops):
// weathervanes turning in the breeze, the chapel bell swinging now and then,
// smoke curling from the chimneys, and the vehicles: wheels that turn as
// they drive, the combine's reel, and puffs from their exhausts. Models
// name their moving parts (art/blender/farm.py): <model>_vane, <model>_bell,
// <model>_wheel_*, <model>_reel, and a <model>_smoke spot to puff from.
import { Box3, Color, Group, IcosahedronGeometry, Mesh, MeshLambertMaterial, Vector3, type Object3D } from 'three';

interface Puff {
  mesh: Mesh;
  material: MeshLambertMaterial;
  active: boolean;
  age: number;
  life: number;
  size: number;
  rise: number;
}

interface Vehicle {
  model: Object3D;
  wheels: { node: Object3D; radius: number }[];
  reel: Object3D | null;
  smoke: Object3D | null;
  last: Vector3 | null;
  speed: number;
  timer: number;
}

const PUFF = new IcosahedronGeometry(0.22, 0);
const MAX_PUFFS = 56;
const CHIMNEY = { color: new Color('#f4f1ea'), life: 3.2, size: 1.1, rise: 0.7, every: 0.75 };
const EXHAUST = { color: new Color('#6b6f78'), life: 1.1, size: 0.55, rise: 0.9, every: 0.16 };
/** The breeze carries smoke this way (m/s). */
const DRIFT = new Vector3(0.35, 0, -0.12);
/** The chapel bell rings for π / RING_PACE seconds. */
const RING_PACE = 1.05;
/** A jump further than this in one frame is a vehicle put somewhere, not driven there. */
const TELEPORT = 4;

/** Drawn now: it and everything it hangs from are visible, and it's in the scene. */
function shown(node: Object3D): boolean {
  for (let at: Object3D | null = node; at; at = at.parent) {
    if (!at.visible) return false;
    if (!at.parent) return at.type === 'Scene';
  }
  return false;
}

export class FarmMotion {
  readonly group = new Group();
  private time = 0;
  private readonly vanes: { node: Object3D; phase: number }[] = [];
  private readonly bells: { node: Object3D; wait: number; ring: number }[] = [];
  private readonly chimneys: { node: Object3D; timer: number }[] = [];
  private readonly vehicles: Vehicle[] = [];
  private readonly puffs: Puff[] = [];
  private readonly at = new Vector3();
  private readonly ahead = new Vector3();

  constructor(private readonly random: () => number = Math.random) {
    this.group.name = 'farm-motion';
    // One puff made now (hidden), so its look is compiled with the town's, not at the first chimney puff.
    this.makePuff();
  }

  /** Picks up what moves by itself in a building or prop: weathervanes, a bell, a chimney. */
  watch(model: Object3D): void {
    model.traverse((node) => {
      if (node.name.endsWith('_vane')) this.vanes.push({ node, phase: this.random() * 20 });
      else if (node.name.endsWith('_bell')) this.bells.push({ node, wait: 6 + this.random() * 12, ring: 0 });
      else if (node.name.endsWith('_smoke')) this.chimneys.push({ node, timer: this.random() * CHIMNEY.every });
    });
  }

  /** A vehicle: its wheels turn as it moves, the combine's reel turns, and it puffs exhaust while it drives. */
  vehicle(model: Object3D): void {
    if (this.vehicles.some((v) => v.model === model)) return;
    const wheels: Vehicle['wheels'] = [];
    let reel: Object3D | null = null;
    let smoke: Object3D | null = null;
    model.updateMatrixWorld(true);
    const box = new Box3();
    model.traverse((node) => {
      // A part drawn with the rest of its model (rigid.ts) keeps its height; a plain one is measured.
      const height = (node.userData.height as number | undefined) ?? box.setFromObject(node).getSize(this.at).y;
      if (/_wheel_[a-z]+$/.test(node.name)) wheels.push({ node, radius: Math.max(0.1, height / 2) });
      else if (node.name.endsWith('_reel')) reel = node;
      else if (node.name.endsWith('_smoke')) smoke = node;
    });
    this.vehicles.push({ model, wheels, reel, smoke, last: null, speed: 0, timer: 0 });
  }

  update(dt: number): void {
    this.time += dt;
    for (const vane of this.vanes) {
      // Swinging slowly round with the breeze, twitching in the gusts.
      vane.node.rotation.y = 0.6 + Math.sin(this.time * 0.23 + vane.phase) * 0.9 + Math.sin(this.time * 1.7 + vane.phase) * 0.1;
    }
    for (const bell of this.bells) {
      if (bell.ring > 0) {
        bell.ring = Math.max(0, bell.ring - dt);
        // A few swings, building up and dying away.
        const swing = Math.sin(bell.ring * RING_PACE) * 0.6;
        bell.node.rotation.x = Math.sin(bell.ring * 6) * swing;
        if (bell.ring === 0) bell.wait = 25 + this.random() * 30;
      } else if ((bell.wait -= dt) <= 0) bell.ring = Math.PI / RING_PACE;
    }
    for (const chimney of this.chimneys) {
      if ((chimney.timer -= dt) > 0 || !shown(chimney.node)) continue;
      chimney.timer = CHIMNEY.every * (0.8 + this.random() * 0.4);
      this.puff(chimney.node.getWorldPosition(this.at), CHIMNEY);
    }
    for (const vehicle of this.vehicles) this.drive(vehicle, dt);
    for (const puff of this.puffs) {
      if (!puff.active) continue;
      puff.age += dt;
      const k = puff.age / puff.life;
      if (k >= 1) {
        puff.active = false;
        puff.mesh.visible = false;
        continue;
      }
      puff.mesh.position.addScaledVector(DRIFT, dt * (0.4 + k));
      puff.mesh.position.y += puff.rise * dt * (1 - k * 0.5);
      puff.mesh.scale.setScalar(puff.size * (0.5 + k * 1.3));
      puff.material.opacity = Math.min(1, k * 8) * (1 - k) * 0.75;
    }
  }

  /** Turns a vehicle's wheels by how far it went (backwards if it reversed), its reel while it moves, and puffs. */
  private drive(vehicle: Vehicle, dt: number): void {
    const { model } = vehicle;
    model.getWorldPosition(this.at);
    const visible = shown(model);
    if (!vehicle.last || !visible || this.at.distanceTo(vehicle.last) > TELEPORT) {
      vehicle.last = this.at.clone();
      vehicle.speed = 0;
      return;
    }
    model.getWorldDirection(this.ahead);
    const moved = this.ahead.dot(this.at.clone().sub(vehicle.last));
    vehicle.last.copy(this.at);
    vehicle.speed += (Math.abs(moved) / Math.max(dt, 1e-3) - vehicle.speed) * Math.min(1, dt * 6);
    for (const wheel of vehicle.wheels) wheel.node.rotation.x += moved / wheel.radius;
    if (vehicle.reel && vehicle.speed > 0.2) vehicle.reel.rotation.x += dt * 2.6;
    if (vehicle.smoke && vehicle.speed > 0.3 && (vehicle.timer -= dt) <= 0) {
      vehicle.timer = EXHAUST.every;
      this.puff(vehicle.smoke.getWorldPosition(this.at), EXHAUST);
    }
  }

  private makePuff(): Puff {
    const material = new MeshLambertMaterial({ transparent: true, depthWrite: false });
    const mesh = new Mesh(PUFF, material);
    mesh.name = 'puff';
    mesh.visible = false;
    this.group.add(mesh);
    const puff = { mesh, material, active: false, age: 0, life: 1, size: 1, rise: 1 };
    this.puffs.push(puff);
    return puff;
  }

  private puff(at: Vector3, kind: typeof CHIMNEY): void {
    let puff = this.puffs.find((p) => !p.active);
    if (!puff) {
      if (this.puffs.length >= MAX_PUFFS) return;
      puff = this.makePuff();
    }
    puff.active = true;
    puff.age = 0;
    puff.life = kind.life * (0.85 + this.random() * 0.3);
    puff.size = kind.size * (0.8 + this.random() * 0.4);
    puff.rise = kind.rise;
    puff.material.color.copy(kind.color);
    puff.material.opacity = 0;
    puff.mesh.visible = true;
    puff.mesh.position.copy(at);
    puff.mesh.rotation.set(this.random() * 3, this.random() * 3, 0);
    puff.mesh.scale.setScalar(puff.size * 0.5);
  }
}
