import { describe, expect, it } from 'vitest';
import { CHARACTERS, TUNING } from '../src/core/config';
import { footfalls, pickGait, type Gaits } from '../src/render/models/gait';

const PEOPLE = CHARACTERS.gaits as Gaits;

describe('gaits', () => {
  it('walks at a stroll and sprints at full speed', () => {
    expect(pickGait(PEOPLE, 1.4, null).pose).toBe('walk');
    expect(pickGait(PEOPLE, TUNING.player.speed, null).pose).toBe('sprint');
  });

  it('plays a gait at the rate that matches the ground covered', () => {
    const { pose, rate } = pickGait(PEOPLE, PEOPLE.sprint! * 1.1, 'sprint');
    expect(pose).toBe('sprint');
    expect(rate).toBeCloseTo(1.1);
    // Full speed still plays the sprint at a matching rate, not a capped one.
    expect(pickGait(PEOPLE, TUNING.player.speed, null).rate).toBeCloseTo(TUNING.player.speed / PEOPLE.sprint!);
  });

  it("doesn't flicker between two gaits right at the edge", () => {
    const edge = Math.sqrt(PEOPLE.walk! * PEOPLE.sprint!);
    expect(pickGait(PEOPLE, edge * 1.05, 'walk').pose).toBe('walk');
    expect(pickGait(PEOPLE, edge * 0.95, 'sprint').pose).toBe('sprint');
    expect(pickGait(PEOPLE, edge * 1.2, 'walk').pose).toBe('sprint');
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
