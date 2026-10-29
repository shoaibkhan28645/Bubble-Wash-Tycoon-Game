// Building sites: while a building's construction timer runs, its spot shows
// scaffolding round a concrete slab, a striped barrier, a pallet of bricks
// and a countdown over it.
import { Group, Mesh, Vector3, type BufferGeometry, type Object3D } from 'three';
import { secondsLeft, formatClock } from '../../systems/construction';
import type { GameState } from '../../core/gameState';
import type { LocationLayout } from '../../core/config';
import type { Label, WorldLabels } from '../../ui/worldLabels';
import { withShadows } from '../stage';
import { box, cylinder, mergeParts, rbox, toyMaterial, type Part } from './build';
import { C } from './kit';

const HEIGHT = 3.2;
const STEEL = '#9aa5b3';
const PLANK = '#d9a866';
const geometries = new Map<string, BufferGeometry>();

/** Scaffolding for a width × depth footprint, centred on the origin. */
export function siteModel(width: number, depth: number): Mesh {
  const key = `${width}:${depth}`;
  let geometry = geometries.get(key);
  if (!geometry) {
    geometry = mergeParts(siteParts(width, depth));
    geometries.set(key, geometry);
  }
  return new Mesh(geometry, toyMaterial);
}

function siteParts(width: number, depth: number): Part[] {
  const hw = width / 2;
  const hd = depth / 2;
  const parts: Part[] = [{ geometry: box(width - 0.6, 0.12, depth - 0.6), color: '#c3c7cc', y: 0.06 }];
  // Poles every metre and a half or so along each side, planks at two levels.
  const posts = (length: number) => Math.max(2, Math.round(length / 1.6) + 1);
  for (const sz of [-1, 1]) {
    const n = posts(width);
    for (let i = 0; i < n; i++) parts.push({ geometry: cylinder(0.06, HEIGHT, 6), color: STEEL, x: -hw + (i * width) / (n - 1), y: HEIGHT / 2, z: sz * hd });
  }
  for (const sx of [-1, 1]) {
    const n = posts(depth);
    for (let i = 1; i < n - 1; i++) parts.push({ geometry: cylinder(0.06, HEIGHT, 6), color: STEEL, x: sx * hw, y: HEIGHT / 2, z: -hd + (i * depth) / (n - 1) });
  }
  for (const y of [1.5, HEIGHT - 0.1]) {
    for (const sz of [-1, 1]) parts.push({ geometry: rbox(width + 0.1, 0.08, 0.36, 0.03), color: PLANK, y, z: sz * (hd - 0.18) });
    for (const sx of [-1, 1]) parts.push({ geometry: rbox(0.36, 0.08, depth - 0.7, 0.03), color: PLANK, x: sx * (hw - 0.18), y });
    for (const sz of [-1, 1]) parts.push({ geometry: box(width, 0.05, 0.05), color: STEEL, y: y + 0.55, z: sz * hd });
  }
  // A brace across the front, so it reads as scaffolding from the camera.
  const brace = Math.atan2(1.4, width);
  parts.push({ geometry: box(Math.hypot(width, 1.4), 0.05, 0.05), color: STEEL, y: 0.8, z: hd, rz: brace });
  parts.push({ geometry: box(Math.hypot(width, 1.4), 0.05, 0.05), color: STEEL, y: 2.3, z: hd, rz: -brace });
  // Striped barrier round the outside, on little feet.
  const barrier = (length: number, along: 'x' | 'z', at: number) => {
    const n = Math.max(2, Math.round(length / 0.6));
    for (let i = 0; i < n; i++) {
      const offset = -length / 2 + (length / n) * (i + 0.5);
      const geometry = along === 'x' ? box(length / n + 0.01, 0.14, 0.06) : box(0.06, 0.14, length / n + 0.01);
      parts.push({ geometry, color: i % 2 ? C.white : C.red, x: along === 'x' ? offset : at, y: 0.5, z: along === 'x' ? at : offset });
    }
  };
  barrier(width + 0.8, 'x', hd + 0.4);
  barrier(depth + 0.8, 'z', -hw - 0.4);
  barrier(depth + 0.8, 'z', hw + 0.4);
  for (const [x, z] of [[-hw - 0.4, hd + 0.4], [hw + 0.4, hd + 0.4], [-hw - 0.4, -hd - 0.4], [hw + 0.4, -hd - 0.4]] as const) {
    parts.push({ geometry: box(0.08, 0.5, 0.08), color: C.dark, x, y: 0.25, z });
  }
  // A pallet of bricks at the front corner.
  parts.push({ geometry: box(0.9, 0.12, 0.7), color: PLANK, x: hw - 0.8, y: 0.18, z: hd - 0.7 });
  for (let i = 0; i < 6; i++) {
    parts.push({ geometry: rbox(0.26, 0.12, 0.6, 0.02), color: '#d9775b', x: hw - 1.1 + (i % 3) * 0.29, y: 0.31 + Math.floor(i / 3) * 0.13, z: hd - 0.7 });
  }
  return parts;
}

interface Site {
  mesh: Object3D;
  label: Label;
  text: HTMLElement;
  shown: string;
}

/** The building sites on the lot, with their countdowns. */
export class ConstructionSites {
  private readonly sites = new Map<string, Site>();

  constructor(
    private readonly scene: Object3D,
    private readonly labels: WorldLabels,
    private readonly layout: LocationLayout,
  ) {}

  show(id: string): void {
    const spot = this.layout.sites[id] ?? { ...(this.layout.buildAt[id] ?? this.layout.pads[id] ?? { x: 0, z: 0 }), width: 3, depth: 3 };
    if (this.sites.has(id)) return;
    const mesh = new Group();
    mesh.add(siteModel(spot.width, spot.depth));
    mesh.position.set(spot.x, 0, spot.z);
    mesh.name = `building:site`;
    this.scene.add(withShadows(mesh));
    const el = document.createElement('div');
    el.className = 'site-label';
    const text = document.createElement('span');
    el.append('🚧 ', text);
    const label = this.labels.add(el, new Vector3(spot.x, HEIGHT + 0.8, spot.z));
    this.sites.set(id, { mesh, label, text, shown: '' });
  }

  remove(id: string): void {
    const site = this.sites.get(id);
    if (!site) return;
    this.scene.remove(site.mesh);
    this.labels.remove(site.label);
    this.sites.delete(id);
  }

  /** Countdowns; the page is only touched when a number changes. */
  update(state: GameState, now: number): void {
    for (const [id, site] of this.sites) {
      const build = state.building[id];
      const shown = build ? formatClock(secondsLeft(build, now)) : '';
      if (shown === site.shown) continue;
      site.shown = shown;
      site.text.textContent = shown;
    }
  }
}
