// The boutique's hats, built from simple shapes and worn on the hero's head bone. Sizes are in the
// model's own units (Kenney Mini Characters, before PERSON_SCALE), measured from the head bone: the
// head is a rounded box about 0.34 wide and deep, its crown at y ≈ 0.33, the glasses below y ≈ 0.22 at
// the front (+z), the ears out to x ≈ ±0.23 at y ≈ 0.09–0.15.
import { BufferGeometry, ConeGeometry, CylinderGeometry, SphereGeometry, TorusGeometry } from 'three';
import { box, cylinder, mergeParts, rbox, sphere, type Part } from './build';

/** The top half of a ball, squashed to `squash` of its height. */
const dome = (radius: number, squash = 1): BufferGeometry => new SphereGeometry(radius, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, squash, 1);
const cone = (radius: number, height: number, segments = 14): BufferGeometry => new ConeGeometry(radius, height, segments);
/** A ring with no top or bottom (a crown's band); `inside` turns its faces inward, for the far wall seen over the rim. */
const band = (radius: number, height: number, inside = false): BufferGeometry => {
  const g = new CylinderGeometry(radius, radius, height, 18, 1, true);
  return inside ? g.scale(-1, 1, 1) : g;
};

const HAT_PARTS: Record<string, () => Part[]> = {
  cap: () => [
    { geometry: rbox(0.38, 0.13, 0.38, 0.05), color: '#2f80d1', y: 0.305 },
    { geometry: rbox(0.32, 0.025, 0.17, 0.01), color: '#2364a8', y: 0.25, z: 0.25 },
    { geometry: sphere(0.028, 6), color: '#ffffff', y: 0.375 },
  ],
  party: () => [
    { geometry: cone(0.15, 0.34), color: '#ff5fa8', y: 0.5 },
    { geometry: cylinder(0.153, 0.045, 14), color: '#ffd24a', y: 0.355 },
    { geometry: cylinder(0.098, 0.035, 14), color: '#7ee0c3', y: 0.5 },
    { geometry: sphere(0.05, 8), color: '#ffd24a', y: 0.68 },
  ],
  hardhat: () => [
    { geometry: dome(0.22, 0.8), color: '#ffc21a', y: 0.245 },
    { geometry: cylinder(0.27, 0.025, 18), color: '#f2b200', y: 0.25 },
    { geometry: box(0.05, 0.04, 0.36), color: '#f2b200', y: 0.41 },
  ],
  cowboy: () => [
    { geometry: rbox(0.3, 0.17, 0.3, 0.07), color: '#a8693a', y: 0.37 },
    { geometry: rbox(0.31, 0.045, 0.31, 0.02), color: '#5a3a1e', y: 0.31 },
    { geometry: cylinder(0.37, 0.025, 20).scale(1, 1, 0.88), color: '#a8693a', y: 0.29 },
  ],
  headphones: () => [
    { geometry: new TorusGeometry(0.215, 0.022, 6, 18, Math.PI), color: '#f4f6f8', y: 0.15 },
    { geometry: cylinder(0.078, 0.07, 14), color: '#ff5fa8', x: 0.24, y: 0.13, rz: Math.PI / 2 },
    { geometry: cylinder(0.078, 0.07, 14), color: '#ff5fa8', x: -0.24, y: 0.13, rz: Math.PI / 2 },
    { geometry: cylinder(0.05, 0.075, 12), color: '#2d3440', x: 0.24, y: 0.13, rz: Math.PI / 2 },
    { geometry: cylinder(0.05, 0.075, 12), color: '#2d3440', x: -0.24, y: 0.13, rz: Math.PI / 2 },
  ],
  tophat: () => [
    { geometry: cylinder(0.26, 0.025, 20), color: '#1f2026', y: 0.335 },
    { geometry: cylinder(0.17, 0.3, 18), color: '#1f2026', y: 0.49 },
    { geometry: cylinder(0.173, 0.055, 18), color: '#c8282f', y: 0.38 },
  ],
  wizard: () => [
    { geometry: cylinder(0.3, 0.02, 20), color: '#3b47b8', y: 0.325 },
    { geometry: cone(0.2, 0.56), color: '#3b47b8', y: 0.61, rx: -0.12 },
    { geometry: sphere(0.032, 5), color: '#ffd24a', y: 0.45, z: 0.155 },
    { geometry: sphere(0.026, 5), color: '#ffd24a', x: 0.1, y: 0.57, z: 0.06 },
    { geometry: sphere(0.026, 5), color: '#ffd24a', x: -0.11, y: 0.5, z: 0.05 },
  ],
  crown: () => [
    { geometry: band(0.19, 0.09), color: '#ffc24a', y: 0.345 },
    { geometry: band(0.183, 0.09, true), color: '#e0a32e', y: 0.345 },
    ...[0, 1, 2, 3, 4, 5].map((i): Part => {
      const a = (i / 6) * Math.PI * 2;
      return { geometry: cone(0.04, 0.1, 6), color: '#ffc24a', x: Math.sin(a) * 0.19, y: 0.44, z: Math.cos(a) * 0.19 };
    }),
    { geometry: sphere(0.03, 6), color: '#e8423f', y: 0.345, z: 0.195 },
    { geometry: sphere(0.024, 6), color: '#4aa3f0', x: 0.195, y: 0.345 },
    { geometry: sphere(0.024, 6), color: '#4aa3f0', x: -0.195, y: 0.345 },
  ],
};

const geometries = new Map<string, BufferGeometry>();

/** A hat's model (built once, then shared); null for an id with no model. */
export function hatGeometry(id: string): BufferGeometry | null {
  let geometry = geometries.get(id);
  if (!geometry) {
    const parts = HAT_PARTS[id];
    if (!parts) return null;
    geometry = mergeParts(parts());
    geometries.set(id, geometry);
  }
  return geometry;
}

/** Ids of every hat with a model (tests check each one on sale has one). */
export const HAT_MODELS = Object.keys(HAT_PARTS);
