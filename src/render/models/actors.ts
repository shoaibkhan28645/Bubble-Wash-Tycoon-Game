// Soft blob shadows, and the cars modelled in Blender (art/blender/cars.py); people are in person.ts.
import {
  CanvasTexture,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  Object3D,
  PlaneGeometry,
  Scene,
  Vector3,
} from 'three';
import type { CarDef } from '../../core/config';
import { carGeometry } from '../carGeometry';
import { addMud, type MudUniforms } from '../mud';
import type { DriveUniforms } from '../carShader';
import { GRAPHICS } from '../graphics';

/** How bright a car's highlights are. */
const CAR_SPECULAR = 0x5a5a5a;
const MUD: Record<string, string> = { dusty: '#a4825c', muddy: '#7a5a3a', swamp: '#5a6636' };
/** Mud threshold on a dirty car (lower = more mud): see mud.ts. */
const DIRT_START: Record<string, number> = { dusty: 0.56, muddy: 0.48, swamp: 0.36 };

/** A blob shadow's outline: round under people and animals, a soft-edged box under vehicles. */
export type BlobShape = 'round' | 'box';

const shadowMaterials = new Map<BlobShape, MeshBasicMaterial>();

/** Soft shadow textures, drawn once on first use. */
function getShadowMaterial(shape: BlobShape): MeshBasicMaterial {
  const made = shadowMaterials.get(shape);
  if (made) return made;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  if (shape === 'round') {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(0,0,0,0.42)');
    gradient.addColorStop(0.6, 'rgba(0,0,0,0.25)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  } else {
    // A rounded box, darkest inside and fading out over its outer fifth, like a vehicle's shadow in the sun.
    const image = ctx.createImageData(64, 64);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const u = Math.max(0, Math.abs((x + 0.5) / 32 - 1) - 0.6) / 0.4;
        const v = Math.max(0, Math.abs((y + 0.5) / 32 - 1) - 0.6) / 0.4;
        const t = Math.min(1, Math.hypot(u, v));
        image.data[(y * 64 + x) * 4 + 3] = Math.round(255 * 0.4 * (1 - t * t * (3 - 2 * t)));
      }
    }
    ctx.putImageData(image, 0, 0);
  }
  const material = new MeshBasicMaterial({ map: new CanvasTexture(canvas), transparent: true, depthWrite: false });
  shadowMaterials.set(shape, material);
  return material;
}
const shadowGeometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

/** Room for everyone in a busy town: people, cars, a farm's animals and machines, the cash piles. */
const MAX_BLOBS = 128;
/** How far the middle of a shadow falls from what casts it, per metre of its height (the sun of render/stage.ts). */
const SUN_SHIFT = { x: 0.22, z: -0.12 };

/**
 * Every soft blob shadow in one draw call a shape. Objects carry an invisible
 * marker; each frame the visible markers' positions go into one InstancedMesh.
 */
class BlobShadows {
  private readonly meshes = new Map<BlobShape, InstancedMesh>();
  private readonly markers = new Set<Object3D>();
  private readonly shifted = new Matrix4();
  private readonly counts = new Map<BlobShape, number>();

  attach(scene: Scene): void {
    for (const shape of ['round', 'box'] as const) {
      const mesh = new InstancedMesh(shadowGeometry, getShadowMaterial(shape), MAX_BLOBS);
      mesh.name = shape === 'round' ? 'blob-shadows' : 'box-shadows';
      mesh.frustumCulled = false;
      mesh.renderOrder = -1;
      mesh.count = 0;
      scene.add(mesh);
      this.meshes.set(shape, mesh);
    }
  }

  add(marker: Object3D): void {
    this.markers.add(marker);
  }

  /** Forgets the scene and everyone in it (leaving a town). */
  detach(): void {
    for (const mesh of this.meshes.values()) {
      mesh.removeFromParent();
      mesh.dispose();
    }
    this.meshes.clear();
    this.markers.clear();
  }

  update(): void {
    if (this.meshes.size === 0) return;
    this.counts.clear();
    for (const marker of this.markers) {
      const shape = (marker.userData.shape as BlobShape | undefined) ?? 'round';
      const mesh = this.meshes.get(shape)!;
      const n = this.counts.get(shape) ?? 0;
      if (n >= MAX_BLOBS || !shown(marker)) continue;
      marker.updateWorldMatrix(true, false);
      const cast = marker.userData.cast as number | undefined;
      if (cast) {
        // A tall thing's shadow falls away from the sun, like the buildings' do (render/stage.ts).
        this.shifted.copy(marker.matrixWorld);
        this.shifted.elements[12]! += SUN_SHIFT.x * cast;
        this.shifted.elements[14]! += SUN_SHIFT.z * cast;
        mesh.setMatrixAt(n, this.shifted);
      } else mesh.setMatrixAt(n, marker.matrixWorld);
      this.counts.set(shape, n + 1);
    }
    for (const [shape, mesh] of this.meshes) {
      const n = this.counts.get(shape) ?? 0;
      if (n === 0 && mesh.count === 0) continue;
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.visible = n > 0;
    }
  }
}

/** Visible all the way up to the scene. */
function shown(object: Object3D): boolean {
  let node: Object3D | null = object;
  while (node) {
    if (!node.visible) return false;
    if (node instanceof Scene) return true;
    node = node.parent;
  }
  return false;
}

export const blobShadows = new BlobShadows();

/** Soft blob shadow just above the ground, as a child of the object it belongs to. */
export function blobShadow(width: number, length: number, height = 0, shape: BlobShape = 'round'): Object3D {
  const marker = new Object3D();
  marker.scale.set(width, 1, length);
  marker.position.y = 0.03;
  // Something tall (a van, a cow) has its shadow fall away from the sun; people's sit under their feet.
  marker.userData.cast = height;
  marker.userData.shape = shape;
  blobShadows.add(marker);
  return marker;
}

/** Paints for a car that doesn't list its own: a common silver. */
const DEFAULT_PAINTS = ['#c9ced6'];

/** A pooled car: one Blender model (one draw call), painted and muddied by its own material. The windows are opaque, so no visible driver. */
export class CarModel {
  /** Where to send a puff of exhaust (the game's particles): a car pulling away from a stop. */
  static exhaust: ((at: Vector3, back: Vector3) => void) | null = null;
  readonly mesh = new Group();
  /** Glossy: clean paint and glass catch the light (mud.ts says how shiny each part is). */
  private readonly body = new Mesh(undefined, new MeshPhongMaterial({ vertexColors: true, specular: CAR_SPECULAR, shininess: 48 }));
  private readonly shadow = blobShadow(1, 1);
  /** Paint, mud and foam (the mud stays off on low graphics), wheels, lamps. */
  private readonly mud: MudUniforms & DriveUniforms;
  private wasMoving = false;
  /** Nose up (+) or down (-), springing back; and the lean in a corner. */
  private dip = 0;
  private dipSpeed = 0;
  private roll = 0;
  /** Nose up speeding up, down slowing (smoothed). */
  private pitch = 0;
  private time = 0;
  private wheelRadius = 0.3;
  /** Where the car was last frame and which way it faced, to roll the wheels and lean into turns. */
  private last: { x: number; z: number; yaw: number } | null = null;
  private yawRate = 0;
  private sinceStop = 9;
  /** The exhaust pipe, under the back on the right, and how far the puff blows (in the car's own space). */
  private readonly pipe = new Vector3();

  constructor() {
    // Cars keep their soft blob shadow; they receive the buildings' and trees' shadows.
    this.body.receiveShadow = true;
    this.mud = addMud(this.body.material as MeshPhongMaterial);
    this.mesh.add(this.body, this.shadow);
  }

  /** The model for this kind of car (art/blender/cars.py), in one of its real paint colours. */
  setType(def: CarDef): void {
    this.body.geometry = carGeometry(def.model);
    this.wheelRadius = (this.body.geometry.userData.wheelRadius as number) * def.scale;
    this.pipe.set(-(def.size[0] / 2 - 0.45), 0.24, -def.size[2] / 2 - 0.08);
    this.last = null;
    // It arrives already driving: no squat or puff as it appears.
    this.wasMoving = true;
    this.mud.uBrake.value = 0;
    this.mud.uBlinkL.value = this.mud.uBlinkR.value = 0;
    const paints = def.paints ?? DEFAULT_PAINTS;
    this.mud.uPaint.value.set(paints[Math.floor(Math.random() * paints.length)]!);
    this.mud.uTop.value = def.size[1];
    this.body.scale.setScalar(def.scale);
    this.shadow.scale.set(def.size[0] * 1.35, 1, def.size[2] * 1.2);
  }

  /**
   * One frame of driving: the wheels roll as far as the car went and the front ones steer into the
   * turn; the body leans out in a corner, squats as it pulls away and dips its nose when it stops,
   * and tips back a little while it speeds up and forward while it slows (`accel`, m/s²); the brake
   * lights glow as it slows, stops and while it waits (`held`), and the indicators blink on the side
   * it's about to turn (`turn`: 1 left, -1 right).
   */
  animate(dt: number, moving: boolean, held = false, turn = 0, accel = 0): void {
    this.time += dt;
    const step = Math.min(dt, 0.05);
    const p = this.mesh.position;
    const yaw = this.mesh.rotation.y;
    let speed = 0;
    if (this.last && dt > 0) {
      const dx = p.x - this.last.x;
      const dz = p.z - this.last.z;
      const along = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      // A jump (a car just placed) doesn't roll the wheels.
      if (Math.abs(along) < 1.5) {
        this.mud.uSpin.value = (this.mud.uSpin.value + along / this.wheelRadius) % (Math.PI * 2);
        speed = along / dt;
      }
      const turned = Math.atan2(Math.sin(yaw - this.last.yaw), Math.cos(yaw - this.last.yaw));
      this.yawRate += (turned / dt - this.yawRate) * Math.min(1, step * 8);
    }
    this.last = { x: p.x, z: p.z, yaw };
    // Steering follows the turn; the body leans out of it, more the faster it goes.
    const steer = Math.max(-0.5, Math.min(0.5, this.yawRate * 0.3));
    this.mud.uSteer.value += (steer - this.mud.uSteer.value) * Math.min(1, step * 10);
    const lean = Math.max(-0.07, Math.min(0.07, this.yawRate * speed * 0.012));
    this.roll += (lean - this.roll) * Math.min(1, step * 6);
    // Squat pulling away, dive stopping, then spring back.
    if (this.wasMoving && !moving) this.dipSpeed = -2.4;
    if (!this.wasMoving && moving) {
      this.dipSpeed = 1.6;
      // A puff of exhaust as it pulls away (not when it has only just appeared).
      if (this.last && CarModel.exhaust && this.mesh.visible) {
        const back = new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        CarModel.exhaust(this.mesh.localToWorld(this.pipe.clone()), back);
      }
    }
    this.wasMoving = moving;
    this.dipSpeed += (-70 * this.dip - 8 * this.dipSpeed) * step;
    this.dip += this.dipSpeed * step;
    this.pitch += (Math.max(-0.03, Math.min(0.03, accel * 0.004)) - this.pitch) * Math.min(1, step * 6);
    this.body.rotation.set(-this.dip * 0.05 - this.pitch, 0, this.roll);
    this.body.position.y = moving ? Math.abs(Math.sin(this.time * 13)) * 0.012 : 0;
    // Brake lights: on as it stops and while it waits; off once it's parked or moving again.
    this.sinceStop = moving ? 0 : this.sinceStop + dt;
    const braking = held || (!moving && this.sinceStop < 0.9);
    this.mud.uBrake.value += ((braking ? 1 : 0) - this.mud.uBrake.value) * Math.min(1, step * 12);
    const blink = Math.sin(this.time * 9.4) > 0 ? 1 : 0;
    this.mud.uBlinkL.value = turn > 0 ? blink : 0;
    this.mud.uBlinkR.value = turn < 0 ? blink : 0;
  }

  /** 0 = fully muddy, 1 = sparkling clean. */
  setClean(dirt: string, clean: number): void {
    if (!GRAPHICS.mud) clean = 1;
    this.mud.uMudColor.value.set(MUD[dirt] ?? MUD.dusty!);
    // How high the mud reaches on a dirty car: dust stays low, swamp mud covers most of it.
    const start = DIRT_START[dirt] ?? DIRT_START.dusty!;
    this.mud.uClean.value = clean >= 1 ? 9 : start + clean * (1.2 - start);
    // Suds build up quickly, then the last fifth of the wash rinses them off.
    this.mud.uFoam.value = clean <= 0 || clean >= 1 ? 0 : Math.min(1, clean * 4) * Math.min(1, (1 - clean) * 5);
  }
}
