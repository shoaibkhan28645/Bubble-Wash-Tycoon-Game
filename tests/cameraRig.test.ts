import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { CameraRig } from '../src/render/cameraRig';

// From 9:32 (very tall) to 32:9 (very wide), the range YouTube requires.
const ASPECTS = [9 / 32, 9 / 16, 3 / 4, 1, 4 / 3, 16 / 9, 32 / 9];

/** Pixels per metre at the hero, on a screen `width` × `height` pixels. */
function scale(width: number, height: number): number {
  const { fov, distance } = CameraRig.framing(width / height);
  return height / (2 * distance * Math.tan((fov * Math.PI) / 360));
}

function rigFor(width: number, height: number, insets = { right: 0, top: 0 }) {
  const camera = new PerspectiveCamera(35, width / height, 0.5, 200);
  const rig = new CameraRig(camera);
  rig.setRightInset(insets.right, width);
  rig.setTopInset(insets.top, height);
  rig.refit();
  return { camera, rig };
}

describe('camera framing', () => {
  it('draws the hero the same size on a phone held upright or sideways', () => {
    for (const [w, h] of [[412, 915], [428, 810], [360, 740]] as const) {
      expect(scale(h, w) / scale(w, h)).toBeCloseTo(1, 5);
    }
  });

  it.each(ASPECTS)('never looks wider than 42° across or taller than 35° at aspect %f', (aspect) => {
    const { fov } = CameraRig.framing(aspect);
    const across = (2 * Math.atan(Math.tan((fov * Math.PI) / 360) * aspect) * 180) / Math.PI;
    expect(fov).toBeLessThanOrEqual(35 + 1e-9);
    expect(across).toBeLessThanOrEqual(Math.max(42, fov * aspect) + 1e-6);
  });

  it('looks down a little lower on a wide screen than on a tall one', () => {
    expect(CameraRig.framing(9 / 16).pitch).toBe(50);
    expect(CameraRig.framing(16 / 9).pitch).toBeLessThan(45);
  });

  it('shows less of the town on a phone than the old fixed 11 × 13 m box did', () => {
    // Upright, the old box was about 16.5 m across at the hero; sideways about 46 m.
    const across = (w: number, h: number) => w / scale(w, h);
    expect(across(428, 810)).toBeLessThan(14);
    expect(across(876, 331)).toBeLessThan(30);
  });
});

describe('camera rig', () => {
  const big = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };

  it.each([[428, 810], [876, 331], [1280, 720]] as const)('puts the hero in the middle of the screen clear of the HUD and buttons at %ix%i', (w, h) => {
    const insets = { right: 64, top: 56 };
    const { camera, rig } = rigFor(w, h, insets);
    rig.setArea(big);
    rig.snap({ x: 7, z: -3 });
    camera.updateMatrixWorld();
    const at = new Vector3(7, 0, -3).project(camera);
    expect(at.x).toBeCloseTo(-insets.right / w, 3);
    expect(at.y).toBeCloseTo(-insets.top / h, 3);
  });

  it('stops at the edge of what is built instead of following the hero past it', () => {
    const { camera, rig } = rigFor(876, 331);
    const area = { minX: -10, maxX: 30, minZ: -8, maxZ: 8 };
    rig.setArea(area);
    rig.snap({ x: -10, z: 0 });
    camera.updateMatrixWorld();
    // The screen's left edge, across its middle, meets the ground no further left than the area.
    const hero = new Vector3(-10, 0, 0).project(camera);
    const edge = new Vector3(-1, 0, 0.5).unproject(camera).sub(camera.position);
    const ground = camera.position.clone().addScaledVector(edge, -camera.position.y / edge.y);
    expect(ground.x).toBeCloseTo(area.minX, 3);
    expect(hero.x).toBeLessThan(-0.5);
  });
});
