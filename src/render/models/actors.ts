// Soft blob shadows, and the cars modelled in Blender (art/blender/cars.py); people are in person.ts.
import {
  CanvasTexture,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  Object3D,
  PlaneGeometry,
  Scene,
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

let shadowMaterial: MeshBasicMaterial | null = null;

/** Soft round shadow texture, drawn once on first use. */
function getShadowMaterial(): MeshBasicMaterial {
  if (shadowMaterial) return shadowMaterial;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(0,0,0,0.42)');
  gradient.addColorStop(0.6, 'rgba(0,0,0,0.25)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  shadowMaterial = new MeshBasicMaterial({ map: new CanvasTexture(canvas), transparent: true, depthWrite: false });
  return shadowMaterial;
}
const shadowGeometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

const MAX_BLOBS = 64;

/**
 * Every soft blob shadow in one draw call. Objects carry an invisible marker;
 * each frame the visible markers' positions go into one InstancedMesh.
 */
class BlobShadows {
  private mesh: InstancedMesh | null = null;
  private readonly markers = new Set<Object3D>();

  attach(scene: Scene): void {
    this.mesh = new InstancedMesh(shadowGeometry, getShadowMaterial(), MAX_BLOBS);
    this.mesh.name = 'blob-shadows';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  add(marker: Object3D): void {
    this.markers.add(marker);
  }

  update(): void {
    const mesh = this.mesh;
    if (!mesh) return;
    let n = 0;
    for (const marker of this.markers) {
      if (n >= MAX_BLOBS || !shown(marker)) continue;
      marker.updateWorldMatrix(true, false);
      mesh.setMatrixAt(n++, marker.matrixWorld);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
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
export function blobShadow(width: number, length: number): Object3D {
  const marker = new Object3D();
  marker.scale.set(width, 1, length);
  marker.position.y = 0.03;
  blobShadows.add(marker);
  return marker;
}

/** Paints for a car that doesn't list its own: a common silver. */
const DEFAULT_PAINTS = ['#c9ced6'];

/** A pooled car: one Blender model (one draw call), painted and muddied by its own material. The windows are opaque, so no visible driver. */
export class CarModel {
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
  private time = 0;
  private wheelRadius = 0.3;
  /** Where the car was last frame and which way it faced, to roll the wheels and lean into turns. */
  private last: { x: number; z: number; yaw: number } | null = null;
  private yawRate = 0;
  private sinceStop = 9;

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
    this.last = null;
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
   * turn; the body leans out in a corner, squats as it pulls away and dips its nose when it stops;
   * the brake lights glow as it stops and while it waits (`held`), and the indicators blink on the
   * side it's about to turn (`turn`: 1 left, -1 right).
   */
  animate(dt: number, moving: boolean, held = false, turn = 0): void {
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
    if (!this.wasMoving && moving) this.dipSpeed = 1.6;
    this.wasMoving = moving;
    this.dipSpeed += (-70 * this.dip - 8 * this.dipSpeed) * step;
    this.dip += this.dipSpeed * step;
    this.body.rotation.set(-this.dip * 0.05, 0, this.roll);
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
