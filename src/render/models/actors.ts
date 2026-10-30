// Soft blob shadows, and the cars modelled in Blender (art/blender/cars.py); people are in person.ts.
import {
  CanvasTexture,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  Scene,
} from 'three';
import type { CarDef } from '../../core/config';
import { carGeometry } from '../assets';
import { addMud, type MudUniforms } from '../mud';
import { GRAPHICS } from '../graphics';

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
  private readonly body = new Mesh(undefined, new MeshLambertMaterial({ vertexColors: true }));
  private readonly shadow = blobShadow(1, 1);
  /** Paint, mud and foam (the mud stays off on low graphics). */
  private readonly mud: MudUniforms;
  private wasMoving = false;
  private dip = 0;
  private dipSpeed = 0;
  private time = 0;

  constructor() {
    // Cars keep their soft blob shadow; they receive the buildings' and trees' shadows.
    this.body.receiveShadow = true;
    this.mud = addMud(this.body.material as MeshLambertMaterial);
    this.mesh.add(this.body, this.shadow);
  }

  /** The model for this kind of car (art/blender/cars.py), in one of its real paint colours. */
  setType(def: CarDef): void {
    this.body.geometry = carGeometry(def.model);
    const paints = def.paints ?? DEFAULT_PAINTS;
    this.mud.uPaint.value.set(paints[Math.floor(Math.random() * paints.length)]!);
    this.mud.uTop.value = def.size[1];
    this.body.scale.setScalar(def.scale);
    this.shadow.scale.set(def.size[0] * 1.35, 1, def.size[2] * 1.2);
  }

  /** A little bob while driving, and the nose dips and springs back when it stops. */
  animate(dt: number, moving: boolean): void {
    this.time += dt;
    if (this.wasMoving && !moving) this.dipSpeed = -2.4;
    this.wasMoving = moving;
    const step = Math.min(dt, 0.05);
    this.dipSpeed += (-70 * this.dip - 8 * this.dipSpeed) * step;
    this.dip += this.dipSpeed * step;
    this.body.rotation.x = -this.dip * 0.05;
    this.body.position.y = moving ? Math.abs(Math.sin(this.time * 13)) * 0.025 : 0;
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
