import { describe, expect, it } from 'vitest';
import { CHARACTERS, TUNING } from '../src/core/config';
import { footfalls, pickGait, type Gaits } from '../src/render/models/gait';

const HERO = CHARACTERS.gaits as Gaits;

describe('gaits', () => {
  it('walks slowly, jogs in between and sprints at full speed', () => {
    expect(pickGait(HERO, 0.8, null).pose).toBe('walk');
    expect(pickGait(HERO, 2.2, null).pose).toBe('jog');
    expect(pickGait(HERO, TUNING.player.speed, null).pose).toBe('sprint');
  });

  it('plays a gait at the rate that matches the ground covered', () => {
    const { pose, rate } = pickGait(HERO, HERO.sprint! * 1.1, 'sprint');
    expect(pose).toBe('sprint');
    expect(rate).toBeCloseTo(1.1);
    // Full speed with the walk upgrade still fits the sprint.
    expect(pickGait(HERO, TUNING.player.speed, null).rate).toBeLessThan(1.3);
  });

  it("doesn't flicker between two gaits right at the edge", () => {
    const edge = Math.sqrt(HERO.walk! * HERO.jog!);
    expect(pickGait(HERO, edge * 1.05, 'walk').pose).toBe('walk');
    expect(pickGait(HERO, edge * 0.95, 'jog').pose).toBe('jog');
    expect(pickGait(HERO, edge * 1.2, 'walk').pose).toBe('jog');
  });

  it('works with only some gaits', () => {
    expect(pickGait({ walk: 1, sprint: 4 }, 3, null).pose).toBe('sprint');
    expect(pickGait({ walk: 1 }, 6, null)).toEqual({ pose: 'walk', rate: 1.7 });
  });
});

describe('footfalls', () => {
  it('a foot lands at the start of the cycle and halfway', () => {
    expect(footfalls(0.1, 0.4)).toBe(0);
    expect(footfalls(0.4, 0.6)).toBe(1);
    expect(footfalls(0.9, 0.1)).toBe(1);
    expect(footfalls(0.6, 0.55)).toBe(2);
    expect(footfalls(0.4, 0.3)).toBe(2);
  });
});
