import { describe, expect, it } from 'vitest';
import { pushOut, stepOutOf } from '../src/systems/player';
import { PARK_SOLIDS } from '../src/render/models/park';

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

describe('stepOutOf', () => {
  it('a stall bought standing on its pad: the hero steps out in front of it, clear of its walls, not shut in behind the counter', () => {
    const at = { x: 4.6, z: 9.2 };
    const walls = PARK_SOLIDS.ringtoss!.map(([hw, hd, dx = 0, dz = 0]) => ({ minX: at.x + dx - hw, maxX: at.x + dx + hw, minZ: at.z + dz - hd, maxZ: at.z + dz + hd }));
    const footprint = { minX: Math.min(...walls.map((r) => r.minX)), maxX: Math.max(...walls.map((r) => r.maxX)), minZ: Math.min(...walls.map((r) => r.minZ)), maxZ: Math.max(...walls.map((r) => r.maxZ)) };
    const hero = { ...at };
    const radius = 0.45;
    expect(stepOutOf(hero, radius, footprint, walls, { minX: -50, maxX: 50, minZ: -50, maxZ: 50 })).toBe(true);
    expect(hero.x <= footprint.minX || hero.x >= footprint.maxX || hero.z <= footprint.minZ || hero.z >= footprint.maxZ).toBe(true);
    for (const r of walls) expect(Math.hypot(hero.x - Math.min(r.maxX, Math.max(r.minX, hero.x)), hero.z - Math.min(r.maxZ, Math.max(r.minZ, hero.z)))).toBeGreaterThanOrEqual(radius);
    // Not far: just outside.
    expect(Math.hypot(hero.x - at.x, hero.z - at.z)).toBeLessThan(2.5);
  });

  it("leaves someone who isn't inside where they are, and skips spots that are taken", () => {
    const footprint = { minX: 0, maxX: 2, minZ: 0, maxZ: 2 };
    const outside = { x: 3, z: 1 };
    expect(stepOutOf(outside, 0.45, footprint, [], { minX: -50, maxX: 50, minZ: -50, maxZ: 50 })).toBe(false);
    expect(outside).toEqual({ x: 3, z: 1 });
    // Walled in on three sides: out the fourth.
    const inside = { x: 1, z: 1 };
    const others = [
      { minX: -3, maxX: 0, minZ: -3, maxZ: 5 },
      { minX: 2, maxX: 5, minZ: -3, maxZ: 5 },
      { minX: -3, maxX: 5, minZ: -3, maxZ: 0 },
    ];
    expect(stepOutOf(inside, 0.45, footprint, others, { minX: -50, maxX: 50, minZ: -50, maxZ: 50 })).toBe(true);
    expect(inside.z).toBeGreaterThan(2);
  });
});
