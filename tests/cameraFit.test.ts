import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { fitCameraToRect } from '../src/render/cameraFit';
import { LOCATION1 } from '../src/core/config';

const FOV = 35;
const VIEW_DIR = new Vector3(0, 1.2, 1).normalize();
const HEIGHT = 3;
const LIMIT = 0.92;
// From 9:32 (very tall) to 32:9 (very wide), the range YouTube requires.
const ASPECTS = [9 / 32, 9 / 16, 3 / 4, 1, 4 / 3, 16 / 9, 32 / 9];
const RECTS = {
  'location 1 start': LOCATION1.cameraBase,
  'small square': { minX: -2, maxX: 2, minZ: -2, maxZ: 2 },
  'off-centre strip': { minX: 10, maxX: 30, minZ: -3, maxZ: 1 },
};

function projectedCorners(aspect: number, rect: (typeof RECTS)[keyof typeof RECTS]): Vector3[] {
  const { target, distance } = fitCameraToRect(FOV, aspect, VIEW_DIR, rect, HEIGHT, LIMIT);
  const camera = new PerspectiveCamera(FOV, aspect, 0.1, 5000);
  camera.position.copy(target).addScaledVector(VIEW_DIR, distance);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  const points: Vector3[] = [];
  for (const x of [rect.minX, rect.maxX])
    for (const y of [0, HEIGHT]) for (const z of [rect.minZ, rect.maxZ]) points.push(new Vector3(x, y, z).project(camera));
  return points;
}

describe('fitCameraToRect', () => {
  for (const [name, rect] of Object.entries(RECTS)) {
    it.each(ASPECTS)(`keeps "${name}" fully on screen and filling it at aspect %f`, (aspect) => {
      const points = projectedCorners(aspect, rect);
      for (const p of points) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(LIMIT + 1e-6);
        expect(Math.abs(p.y)).toBeLessThanOrEqual(LIMIT + 1e-6);
      }
      // Fills the screen along its tight side, and is centred.
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      const spanX = Math.max(...xs) - Math.min(...xs);
      const spanY = Math.max(...ys) - Math.min(...ys);
      expect(Math.max(spanX, spanY)).toBeGreaterThan(2 * LIMIT * 0.97);
      expect(Math.abs(Math.max(...xs) + Math.min(...xs))).toBeLessThan(0.02);
      expect(Math.abs(Math.max(...ys) + Math.min(...ys))).toBeLessThan(0.02);
    });
  }
});

describe('fitCameraToRect with a strip kept clear on the right', () => {
  it.each(ASPECTS)('keeps the lot left of the side buttons at aspect %f', (aspect) => {
    const inset = 0.3;
    const rect = LOCATION1.lot;
    const { target, distance } = fitCameraToRect(FOV, aspect, VIEW_DIR, rect, HEIGHT, LIMIT, inset);
    const camera = new PerspectiveCamera(FOV, aspect, 0.1, 5000);
    camera.position.copy(target).addScaledVector(VIEW_DIR, distance);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    const xs: number[] = [];
    for (const x of [rect.minX, rect.maxX])
      for (const y of [0, HEIGHT]) for (const z of [rect.minZ, rect.maxZ]) xs.push(new Vector3(x, y, z).project(camera).x);
    expect(Math.max(...xs)).toBeLessThanOrEqual(LIMIT - inset + 1e-6);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-LIMIT - 1e-6);
  });
});

describe('fitCameraToRect with a strip kept clear at the top', () => {
  it.each(ASPECTS)('keeps the lot below the cash and stars at aspect %f', (aspect) => {
    const inset = 0.25;
    const rect = LOCATION1.walk;
    const { target, distance } = fitCameraToRect(FOV, aspect, VIEW_DIR, rect, HEIGHT, LIMIT, 0, inset);
    const camera = new PerspectiveCamera(FOV, aspect, 0.1, 5000);
    camera.position.copy(target).addScaledVector(VIEW_DIR, distance);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    const ys: number[] = [];
    for (const x of [rect.minX, rect.maxX])
      for (const y of [0, HEIGHT]) for (const z of [rect.minZ, rect.maxZ]) ys.push(new Vector3(x, y, z).project(camera).y);
    expect(Math.max(...ys)).toBeLessThanOrEqual(LIMIT - inset + 1e-6);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-LIMIT - 1e-6);
  });
});
