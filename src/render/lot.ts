import { Mesh, PlaneGeometry } from 'three';
import { mergeParts, toyMaterial, type Part } from './models/build';
import type { LocationLayout } from '../core/config';

const GRASS = '#9fd88a';
const DIRT = '#e8d3a6';
const ROAD = '#737a87';
const LANE = '#d9c69a';
const MARK = '#ffffff';

const flat = (w: number, d: number, color: string, x: number, z: number, y: number): Part => ({
  geometry: new PlaneGeometry(w, d),
  color,
  x,
  y,
  z,
  rx: -Math.PI / 2,
});

/** Static ground (grass, dirt lot, road, lanes) merged into one mesh. */
export function lotModel(layout: LocationLayout, bayXs: number[]): Mesh {
  const { lot, roadZ, exitZ, exitX } = layout;
  const lotW = lot.maxX - lot.minX;
  const lotD = lot.maxZ - lot.minZ;
  const parts: Part[] = [
    flat(200, 200, GRASS, 0, 0, 0),
    flat(lotW, lotD, DIRT, (lot.minX + lot.maxX) / 2, (lot.minZ + lot.maxZ) / 2, 0.01),
    flat(120, 3.4, ROAD, 0, roadZ, 0.02),
  ];
  for (let x = -58; x < 60; x += 3) parts.push(flat(1.4, 0.18, MARK, x, roadZ, 0.03));
  // Lanes cars follow: from the road down through each bay, then out to the right.
  const laneTop = roadZ + 1.7;
  for (const x of bayXs) {
    const length = exitZ - laneTop;
    parts.push(flat(2.4, length, LANE, x, laneTop + length / 2, 0.015));
  }
  const left = Math.min(...bayXs) - 1.2;
  parts.push(flat(exitX + 20 - left, 2.4, LANE, (left + exitX + 20) / 2, exitZ, 0.016));
  return new Mesh(mergeParts(parts), toyMaterial);
}
