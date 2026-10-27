import { describe, expect, it } from 'vitest';
import { pushOut } from '../src/systems/player';

const rect = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };

describe('pushOut', () => {
  it('leaves a circle that is clear alone', () => {
    const p = { x: 3, z: 0 };
    pushOut(p, 0.5, rect);
    expect(p).toEqual({ x: 3, z: 0 });
  });

  it('slides a touching circle back to the edge', () => {
    const p = { x: 1.2, z: 0.3 };
    pushOut(p, 0.5, rect);
    expect(p.x).toBeCloseTo(1.5);
    expect(p.z).toBeCloseTo(0.3);
  });

  it('pushes out of a corner diagonally', () => {
    const p = { x: 1.1, z: 1.1 };
    pushOut(p, 0.5, rect);
    expect(Math.hypot(p.x - 1, p.z - 1)).toBeCloseTo(0.5);
  });

  it('gets out through the nearest side when fully inside', () => {
    const p = { x: 0.8, z: 0 };
    pushOut(p, 0.5, rect);
    expect(p).toEqual({ x: 1.5, z: 0 });
  });
});
