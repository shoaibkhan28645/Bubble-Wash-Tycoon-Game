import { describe, expect, it } from 'vitest';
import { Euler, PerspectiveCamera, Vector3 } from 'three';
import { fitDistance } from '../src/render/cameraFit';

const FOV = 40;
const RADIUS = 1;
const VIEW_DIR = new Vector3(0, 1, 1).normalize();
// From 9:32 (very tall) to 32:9 (very wide), the range YouTube requires.
const ASPECTS = [9 / 32, 9 / 16, 3 / 4, 1, 4 / 3, 16 / 9, 32 / 9];

function cameraFor(aspect: number): PerspectiveCamera {
  const camera = new PerspectiveCamera(FOV, aspect, 0.01, 1000);
  camera.position.copy(VIEW_DIR).multiplyScalar(fitDistance(RADIUS, FOV, aspect));
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}

/** Corners of a cube whose bounding sphere has radius RADIUS, at a given rotation. */
function cubeCorners(rotation: Euler): Vector3[] {
  const half = RADIUS / Math.sqrt(3);
  const corners: Vector3[] = [];
  for (const x of [-half, half])
    for (const y of [-half, half])
      for (const z of [-half, half]) corners.push(new Vector3(x, y, z).applyEuler(rotation));
  return corners;
}

describe('fitDistance', () => {
  it.each(ASPECTS)('keeps a spinning cube fully on screen at aspect %f', (aspect) => {
    const camera = cameraFor(aspect);
    let widest = 0;
    for (let step = 0; step < 24; step++) {
      const rotation = new Euler(step * 0.37, step * 0.61, step * 0.23);
      for (const corner of cubeCorners(rotation)) {
        const ndc = corner.project(camera);
        expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1);
        widest = Math.max(widest, Math.abs(ndc.x), Math.abs(ndc.y));
      }
    }
    // ...and isn't shrunk to a speck: it uses a good part of the narrow side.
    expect(widest).toBeGreaterThan(0.5);
  });

  it('backs the camera off on tall screens and not on wide ones', () => {
    const square = fitDistance(RADIUS, FOV, 1);
    expect(fitDistance(RADIUS, FOV, 9 / 32)).toBeGreaterThan(square);
    expect(fitDistance(RADIUS, FOV, 32 / 9)).toBeCloseTo(square);
  });

  it('scales with the margin', () => {
    expect(fitDistance(RADIUS, FOV, 1, 1.2)).toBeCloseTo(fitDistance(RADIUS, FOV, 1) * 1.2);
  });
});
