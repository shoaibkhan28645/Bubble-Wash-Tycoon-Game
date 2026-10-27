// Graybox player and car models. Cars have no faces (GDD); drivers come in the art pass.
import {
  BufferGeometry,
  CircleGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
} from 'three';
import { box, cylinder, mergeParts, sphere, toyMaterial, type Part } from './build';
import type { CarDef } from '../../core/config';

const shadowGeometry = new CircleGeometry(0.5, 20).rotateX(-Math.PI / 2);
const shadowMaterial = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });

/** Soft blob shadow, added as a child just above the ground. */
export function blobShadow(width: number, length: number): Mesh {
  const shadow = new Mesh(shadowGeometry, shadowMaterial);
  shadow.scale.set(width, 1, length);
  shadow.position.y = 0.02;
  return shadow;
}

/** Player: chunky body, round head, little cap peak showing which way they face (+z). */
export function playerModel(): Mesh {
  const geometry = mergeParts([
    { geometry: cylinder(0.38, 0.8, 14), color: '#6cc4ff', y: 0.55 },
    { geometry: sphere(0.36, 14), color: '#ffe3c2', y: 1.2 },
    { geometry: cylinder(0.37, 0.14, 14), color: '#ff8fc8', y: 1.44 },
    { geometry: box(0.36, 0.06, 0.26), color: '#ff8fc8', y: 1.4, z: 0.38 },
    { geometry: sphere(0.05, 6), color: '#333', x: -0.13, y: 1.24, z: 0.32 },
    { geometry: sphere(0.05, 6), color: '#333', x: 0.13, y: 1.24, z: 0.32 },
    { geometry: box(0.2, 0.2, 0.2), color: '#ffd85c', x: 0.42, y: 0.65 },
  ]);
  const mesh = new Mesh(geometry, toyMaterial);
  mesh.add(blobShadow(1.1, 1.1));
  return mesh;
}

const carGeometries = new Map<string, BufferGeometry>();

function carGeometry(def: CarDef): BufferGeometry {
  let geometry = carGeometries.get(def.id);
  if (geometry) return geometry;
  const [w, h, l] = def.size;
  const wheel = Math.min(0.36, h * 0.3);
  const bodyH = h * 0.5;
  const cabinH = h - bodyH - wheel * 0.6;
  const parts: Part[] = [
    { geometry: box(w, bodyH, l), color: def.color, y: wheel * 0.6 + bodyH / 2 },
    { geometry: box(w * 0.86, cabinH, l * 0.5), color: def.color, y: wheel * 0.6 + bodyH + cabinH / 2, z: -l * 0.08 },
    { geometry: box(w * 0.88, cabinH * 0.6, l * 0.42), color: '#cfeeff', y: wheel * 0.6 + bodyH + cabinH * 0.45, z: -l * 0.08 },
    { geometry: box(w * 0.6, 0.12, 0.1), color: '#ffffff', y: wheel * 0.6 + bodyH * 0.6, z: l / 2 },
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push({ geometry: cylinder(wheel, 0.3, 12), color: '#3a3f4a', x: sx * (w / 2 - 0.1), y: wheel, z: sz * l * 0.32, rz: Math.PI / 2 });
    }
  }
  geometry = mergeParts(parts);
  carGeometries.set(def.id, geometry);
  return geometry;
}

const MUD: Record<string, Color> = {
  dusty: new Color('#b0916a'),
  muddy: new Color('#8a6a48'),
  swamp: new Color('#5f6b3a'),
};
const CLEAN = new Color('#ffffff');

/** A pooled car: one merged mesh whose material tint shows the mud (dirty → clean). */
export class CarModel {
  readonly mesh: Mesh;
  private readonly material = new MeshLambertMaterial({ vertexColors: true });
  private readonly shadow = blobShadow(1, 1);

  constructor() {
    this.mesh = new Mesh(undefined, this.material);
    this.mesh.add(this.shadow);
  }

  setType(def: CarDef): void {
    this.mesh.geometry = carGeometry(def);
    this.shadow.scale.set(def.size[0] * 1.25, 1, def.size[2] * 1.15);
  }

  /** 0 = fully muddy, 1 = sparkling clean. */
  setClean(dirt: string, clean: number): void {
    this.material.color.copy(MUD[dirt] ?? MUD.dusty!).lerp(CLEAN, clean);
  }
}
