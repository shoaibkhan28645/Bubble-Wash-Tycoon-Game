// Willowbrook in motion (apart from the animals, pens.ts, and the crops):
// weathervanes turning in the breeze, the chapel bell swinging now and then,
// smoke curling from the chimneys, and the vehicles, as lively as the town's
// cars: wheels that turn as they drive and front wheels that steer into a
// bend, a body that leans out of the bend, squats as it pulls away and dips
// its nose as it stops, brake lights, reversing lights and indicators, and
// puffs from the exhaust. Models name their moving parts
// (art/blender/farm.py): <model>_mesh (the body), <model>_vane, <model>_bell,
// <model>_wheel_* (the front ones end in f, f l or f r), <model>_reel, and a
// <model>_smoke spot to puff from.
import { Box3, Color, DoubleSide, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry, Vector3, type Object3D } from 'three';

interface Puff {
  mesh: Mesh;
  material: MeshLambertMaterial;
  active: boolean;
  age: number;
  life: number;
  size: number;
  rise: number;
}

/** What a vehicle's lamps show (systems/farmTraffic.ts drives it). */
export interface Lamps {
  braking: boolean;
  reversing: boolean;
  /** About to turn: 1 left, -1 right, 0 straight on. */
  signal: number;
  /** On its way (not parked). */
  readonly driving: boolean;
}

interface Vehicle {
  model: Object3D;
  wheels: { node: Object3D; radius: number }[];
  /** The front wheels, which steer. */
  steer: Object3D[];
  reel: Object3D | null;
  smoke: Object3D | null;
  last: Vector3 | null;
  /** How fast it's going (+ forward, - backing up), smoothed. */
  speed: number;
  timer: number;
  /** The body, on a pivot at its middle on the ground that leans and pitches (the wheels stay on the ground). */
  tilt: Group | null;
  yaw: number;
  yawRate: number;
  accel: number;
  dip: number;
  dipSpeed: number;
  roll: number;
  moving: boolean;
  lamps: Lamps | null;
  /** The lamp glows: brake (left, right), reversing, and their materials. */
  glow: { brake: MeshBasicMaterial[]; reverse: MeshBasicMaterial } | null;
}

/** Each vehicle's tail lamps (art/blender/farm.py, tail_lamps): how far back, the body's width there, how high. */
const TAIL_LAMPS: Record<string, { back: number; width: number; height: number }> = {
  fm_van: { back: 1.98, width: 1.8, height: 0.9 },
  fm_tanker: { back: 2.92, width: 1.6, height: 0.72 },
  fm_pickup: { back: 1.83, width: 1.7, height: 1.1 },
  fm_feedtruck: { back: 2.48, width: 1.95, height: 0.9 },
};
const BRAKE_RED = new Color('#ff2a1a');
const AMBER = new Color('#ffb21f');
const LAMP = new PlaneGeometry(0.2, 0.15);
const REVERSE_LAMP = new PlaneGeometry(0.12, 0.1);

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

  /**
   * A vehicle: its wheels turn as it moves (the front ones steer), its body leans and pitches, it puffs
   * exhaust while it drives, and, given what its `lamps` show, its brake lights, reversing lights and
   * indicators light up.
   */
  vehicle(model: Object3D, lamps: Lamps | null = null): void {
    if (this.vehicles.some((v) => v.model === model)) return;
    const wheels: Vehicle['wheels'] = [];
    const steer: Object3D[] = [];
    let reel: Object3D | null = null;
    let smoke: Object3D | null = null;
    let body: Object3D | null = null;
    model.updateMatrixWorld(true);
    const box = new Box3();
    model.traverse((node) => {
      // A part drawn with the rest of its model (rigid.ts) keeps its height; a plain one is measured.
      const height = (node.userData.height as number | undefined) ?? box.setFromObject(node).getSize(this.at).y;
      if (/_wheel_[a-z]+$/.test(node.name)) {
        wheels.push({ node, radius: Math.max(0.1, height / 2) });
        if (/_wheel_f[lr]?$/.test(node.name)) {
          // Steering turns it about the upright, then it rolls about its axle.
          node.rotation.order = 'YXZ';
          steer.push(node);
        }
      } else if (node.name.endsWith('_reel')) reel = node;
      else if (node.name.endsWith('_smoke')) smoke = node;
      else if (node.name === `${model.name}_mesh` && node.parent === model) body = node;
    });
    let tilt: Group | null = null;
    let glow: Vehicle['glow'] = null;
    if (body) {
      tilt = new Group();
      tilt.name = `${model.name}_tilt`;
      tilt.rotation.order = 'YXZ';
      model.add(tilt);
      tilt.add(body);
      const spot = TAIL_LAMPS[model.name];
      if (spot && lamps) glow = this.addLamps(tilt, spot);
    }
    this.vehicles.push({ model, wheels, steer, reel, smoke, last: null, speed: 0, timer: 0, tilt, yaw: model.rotation.y, yawRate: 0, accel: 0, dip: 0, dipSpeed: 0, roll: 0, moving: false, lamps, glow });
  }

  /** Glows over the tail lamps (red braking, amber flashing to turn) and little white reversing lights inside them. */
  private addLamps(tilt: Group, spot: { back: number; width: number; height: number }): Vehicle['glow'] {
    const make = (geometry: PlaneGeometry, color: Color, x: number) => {
      const material = new MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide });
      const mesh = new Mesh(geometry, material);
      mesh.position.set(x, spot.height, -spot.back - 0.045);
      mesh.rotation.y = Math.PI;
      mesh.visible = false;
      mesh.renderOrder = 2;
      tilt.add(mesh);
      return material;
    };
    const x = spot.width / 2 - 0.15;
    // Left is +x (the model faces +z).
    const brake = [make(LAMP, BRAKE_RED, x), make(LAMP, BRAKE_RED, -x)];
    const reverse = new MeshBasicMaterial({ color: '#fffbe8', transparent: true, opacity: 0, depthWrite: false, side: DoubleSide });
    for (const sx of [1, -1]) {
      const mesh = new Mesh(REVERSE_LAMP, reverse);
      mesh.position.set(sx * (x - 0.19), spot.height, -spot.back - 0.045);
      mesh.rotation.y = Math.PI;
      mesh.renderOrder = 2;
      tilt.add(mesh);
    }
    return { brake, reverse };
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

  /**
   * Turns a vehicle's wheels by how far it went (backwards if it reversed) and steers the front ones into
   * the bend; leans the body out of the bend, more the faster it goes, squats it as it pulls away and dips
   * its nose as it stops (springing back); lights its lamps; turns its reel while it moves, and puffs.
   */
  private drive(vehicle: Vehicle, dt: number): void {
    const { model } = vehicle;
    model.getWorldPosition(this.at);
    const visible = shown(model);
    if (!vehicle.last || !visible || this.at.distanceTo(vehicle.last) > TELEPORT) {
      vehicle.last = this.at.clone();
      vehicle.speed = 0;
      vehicle.yaw = model.rotation.y;
      vehicle.yawRate = 0;
      vehicle.moving = false;
      return;
    }
    const step = Math.min(dt, 0.05);
    model.getWorldDirection(this.ahead);
    const moved = this.ahead.dot(this.at.clone().sub(vehicle.last));
    vehicle.last.copy(this.at);
    const before = vehicle.speed;
    vehicle.speed += (moved / Math.max(dt, 1e-3) - vehicle.speed) * Math.min(1, dt * 6);
    vehicle.accel += ((vehicle.speed - before) / Math.max(dt, 1e-3) - vehicle.accel) * Math.min(1, dt * 5);
    const turned = Math.atan2(Math.sin(model.rotation.y - vehicle.yaw), Math.cos(model.rotation.y - vehicle.yaw));
    vehicle.yaw = model.rotation.y;
    vehicle.yawRate += (turned / Math.max(dt, 1e-3) - vehicle.yawRate) * Math.min(1, step * 8);
    for (const wheel of vehicle.wheels) wheel.node.rotation.x += moved / wheel.radius;
    // Into the bend (the other way round backing up).
    const steer = Math.max(-0.5, Math.min(0.5, vehicle.yawRate * 0.35 * (vehicle.speed < -0.05 ? -1 : 1)));
    for (const wheel of vehicle.steer) wheel.rotation.y += (steer - wheel.rotation.y) * Math.min(1, step * 10);
    const moving = Math.abs(vehicle.speed) > 0.15;
    if (vehicle.tilt) {
      const lean = Math.max(-0.06, Math.min(0.06, vehicle.yawRate * vehicle.speed * 0.012));
      vehicle.roll += (lean - vehicle.roll) * Math.min(1, step * 6);
      // Squat pulling away, dive stopping, then spring back; and a little nose-up while it speeds up.
      if (vehicle.moving && !moving) vehicle.dipSpeed = -2.4;
      if (!vehicle.moving && moving) vehicle.dipSpeed = 1.6;
      vehicle.dipSpeed += (-70 * vehicle.dip - 8 * vehicle.dipSpeed) * step;
      vehicle.dip += vehicle.dipSpeed * step;
      const pitch = Math.max(-0.04, Math.min(0.04, vehicle.dip * 0.05 + vehicle.accel * 0.004));
      vehicle.tilt.rotation.set(-pitch, 0, vehicle.roll);
      vehicle.tilt.position.y = moving ? Math.abs(Math.sin(this.time * 13)) * 0.01 : 0;
    }
    if (vehicle.smoke && ((!vehicle.moving && moving) || (moving && (vehicle.timer -= dt) <= 0))) {
      vehicle.timer = EXHAUST.every * (Math.abs(vehicle.speed) > 3 ? 1.6 : 1);
      this.puff(vehicle.smoke.getWorldPosition(this.at), EXHAUST);
    }
    vehicle.moving = moving;
    if (vehicle.reel && Math.abs(vehicle.speed) > 0.2) vehicle.reel.rotation.x += dt * 2.6;
    this.light(vehicle, step);
  }

  /** Brake lights as it stops and while it waits; amber flashing on the side it's turning; white backing up. */
  private light(vehicle: Vehicle, step: number): void {
    const { lamps, glow } = vehicle;
    if (!lamps || !glow) return;
    const on = lamps.driving;
    const blink = Math.sin(this.time * 9.4) > 0;
    glow.brake.forEach((material, i) => {
      const side = i === 0 ? 1 : -1;
      const flashing = on && !lamps.braking && lamps.signal === side;
      const target = on && lamps.braking ? 0.95 : flashing && blink ? 0.9 : 0;
      material.color.copy(flashing ? AMBER : BRAKE_RED);
      material.opacity += (target - material.opacity) * Math.min(1, step * (flashing ? 40 : 12));
    });
    glow.reverse.opacity += ((on && lamps.reversing ? 0.95 : 0) - glow.reverse.opacity) * Math.min(1, step * 12);
    for (const child of vehicle.tilt!.children) {
      if (child instanceof Mesh && child.material instanceof MeshBasicMaterial) child.visible = child.material.opacity > 0.02;
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
