import { PerspectiveCamera, Vector3 } from 'three';
import type { Rect } from '../core/config';

const corners = Array.from({ length: 8 }, () => new Vector3());
const probe = new PerspectiveCamera();
const right = new Vector3();
const up = new Vector3();

/**
 * Where to put a fixed-angle camera so a ground rectangle (and things up to
 * `height` tall on it) fills the screen without being cut off, at any aspect.
 * `ndcLimit` < 1 leaves a margin at the screen edges.
 */
export function fitCameraToRect(
  fovDeg: number,
  aspect: number,
  viewDir: Vector3,
  rect: Rect,
  height: number,
  ndcLimit = 0.92,
): { target: Vector3; distance: number } {
  probe.fov = fovDeg;
  probe.aspect = aspect;
  probe.near = 0.1;
  probe.far = 2000;
  probe.updateProjectionMatrix();

  let i = 0;
  for (const x of [rect.minX, rect.maxX])
    for (const y of [0, height]) for (const z of [rect.minZ, rect.maxZ]) corners[i++]!.set(x, y, z);

  const target = new Vector3((rect.minX + rect.maxX) / 2, 0, (rect.minZ + rect.maxZ) / 2);
  let distance = 1;
  // Fit, then shift the target to centre the result; two rounds settle it.
  for (let round = 0; round < 3; round++) {
    let lo = 0.1;
    let hi = 2000;
    for (let step = 0; step < 40; step++) {
      const mid = (lo + hi) / 2;
      if (bounds(target, viewDir, mid).fits(ndcLimit)) hi = mid;
      else lo = mid;
    }
    distance = hi;
    const b = bounds(target, viewDir, distance);
    const halfH = distance * Math.tan((fovDeg * Math.PI) / 360);
    right.setFromMatrixColumn(probe.matrixWorld, 0);
    up.setFromMatrixColumn(probe.matrixWorld, 1);
    target
      .addScaledVector(right, ((b.minX + b.maxX) / 2) * halfH * aspect)
      .addScaledVector(up, ((b.minY + b.maxY) / 2) * halfH);
  }
  return { target, distance };
}

function bounds(target: Vector3, viewDir: Vector3, distance: number) {
  probe.position.copy(target).addScaledVector(viewDir, distance);
  probe.lookAt(target);
  probe.updateMatrixWorld();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let behind = false;
  const p = new Vector3();
  for (const corner of corners) {
    p.copy(corner).project(probe);
    if (p.z > 1 || p.z < -1) behind = true;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    fits: (limit: number) => !behind && minX >= -limit && maxX <= limit && minY >= -limit && maxY <= limit,
  };
}
