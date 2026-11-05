// The ground of a boardwalk town: sand with gentle dunes, the sea with a
// line of foam that laps the shore, wet sand along it, the plank boardwalk,
// a paved plaza behind it, palm trees and the shops at either end.
import { Color, Float32BufferAttribute, Group, Mesh, MeshLambertMaterial, PlaneGeometry } from 'three';
import type { BoardwalkLayout, Rect } from '../core/config';
import { box, mergeParts, toyMaterial, type Part } from './models/build';
import { palms } from './models/boardwalk';
import { townModel } from './models/town';

const SAND_A = new Color('#f3dcae');
const SAND_B = new Color('#ead097');
const WET_SAND = '#d8bd86';
const SEA_NEAR = new Color('#46d3d9');
const SEA_FAR = new Color('#1f8fc2');
const FOAM = '#f4fbff';
const PLANK_A = '#c9935d';
const PLANK_B = '#b98350';
const BEAM = '#8f6036';
const PAVING_A = '#efe3c8';
const PAVING_B = '#e4d5b4';
const SIZE = 160;

const wobble = (x: number, z: number) => Math.sin(x * 0.21 + z * 0.13) * 0.5 + Math.sin(x * 0.07 - z * 0.19) * 0.5;

function inside(x: number, z: number, r: Rect, margin = 0): boolean {
  return x >= r.minX - margin && x <= r.maxX + margin && z >= r.minZ - margin && z <= r.maxZ + margin;
}

/** Sand everywhere, flat where people walk, with low dunes beyond. */
function sand(layout: BoardwalkLayout): Mesh {
  const geometry = new PlaneGeometry(SIZE, SIZE, 40, 40).rotateX(-Math.PI / 2);
  const pos = geometry.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const n = wobble(x, z);
    c.copy(SAND_A).lerp(SAND_B, 0.5 + n * 0.5);
    colors.set([c.r, c.g, c.b], i * 3);
    const flat = inside(x, z, layout.walk, 2) || z < layout.shoreZ + 3;
    pos.setY(i, flat ? -0.03 : Math.max(0, n) * 0.6 - 0.03);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new Mesh(geometry, new MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = true;
  mesh.name = 'sand';
  return mesh;
}

/** The sea beyond the shore, turquoise in the shallows and deeper blue further out. */
function sea(layout: BoardwalkLayout): Mesh {
  const depth = 70;
  const geometry = new PlaneGeometry(SIZE, depth, 8, 14).rotateX(-Math.PI / 2);
  geometry.translate(0, 0.01, layout.shoreZ - depth / 2);
  const pos = geometry.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const out = Math.min(1, (layout.shoreZ - pos.getZ(i)) / 22);
    c.copy(SEA_NEAR).lerp(SEA_FAR, out);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const mesh = new Mesh(geometry, new MeshLambertMaterial({ vertexColors: true }));
  mesh.name = 'sea';
  return mesh;
}

/** Planks across the boardwalk in two tones, on a beam along each edge. */
function boardwalk(layout: BoardwalkLayout): Mesh {
  const { minX, maxX, minZ, maxZ } = layout.boardwalk;
  const depth = maxZ - minZ;
  const midZ = (minZ + maxZ) / 2;
  const plank = 0.55;
  const parts: Part[] = [];
  let i = 0;
  for (let x = minX + plank / 2; x < maxX; x += plank, i++) {
    parts.push({ geometry: box(plank - 0.05, 0.08, depth), color: i % 2 ? PLANK_A : PLANK_B, x, y: 0.04, z: midZ });
  }
  for (const z of [minZ, maxZ]) parts.push({ geometry: box(maxX - minX, 0.14, 0.22), color: BEAM, x: (minX + maxX) / 2, y: 0.05, z });
  const mesh = new Mesh(mergeParts(parts), toyMaterial);
  mesh.receiveShadow = true;
  mesh.name = 'boardwalk';
  return mesh;
}

/** Paving behind the boardwalk, where the businesses stand, in a two-tone check. */
function plaza(layout: BoardwalkLayout): Mesh {
  const { lot, boardwalk: walk } = layout;
  const tile = 2;
  const parts: Part[] = [];
  for (let x = lot.minX; x < lot.maxX; x += tile) {
    for (let z = walk.maxZ; z < lot.maxZ; z += tile) {
      const even = (Math.round(x / tile) + Math.round(z / tile)) % 2 === 0;
      parts.push({ geometry: new PlaneGeometry(tile, tile), color: even ? PAVING_A : PAVING_B, x: x + tile / 2, y: 0.005, z: z + tile / 2, rx: -Math.PI / 2 });
    }
  }
  const mesh = new Mesh(mergeParts(parts), toyMaterial);
  mesh.receiveShadow = true;
  mesh.name = 'plaza';
  return mesh;
}

export interface BeachGround {
  readonly group: Group;
  /** Laps the foam up and down the shore. */
  update(dt: number): void;
}

export function beachGround(layout: BoardwalkLayout): BeachGround {
  const group = new Group();
  const wet = new Mesh(mergeParts([{ geometry: new PlaneGeometry(SIZE, 2.4), color: WET_SAND, y: -0.02, z: layout.shoreZ + 1.2, rx: -Math.PI / 2 }]), toyMaterial);
  const foam = new Mesh(mergeParts([{ geometry: new PlaneGeometry(SIZE, 0.6), color: FOAM, rx: -Math.PI / 2 }]), toyMaterial);
  foam.position.set(0, 0.02, layout.shoreZ);
  group.add(sand(layout), sea(layout), wet, foam, plaza(layout), boardwalk(layout), palms(layout.palms), townModel(layout));
  let time = 0;
  return {
    group,
    update(dt) {
      time += dt;
      foam.position.z = layout.shoreZ + 0.35 + Math.sin(time * 0.9) * 0.45;
    },
  };
}
