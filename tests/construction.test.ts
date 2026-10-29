// Construction timers: real time, halved once by an ad, finished with gems.
import { describe, expect, it } from 'vitest';
import { PADS, TUNING } from '../src/core/config';
import { newGame } from '../src/core/gameState';
import { finishGems, formatClock, halveBuild, secondsLeft, soonestBuild, startBuild, takeFinished } from '../src/systems/construction';

describe('construction timers', () => {
  it('counts down in real time, and finished builds are taken once', () => {
    const state = newGame();
    startBuild(state, 'mart', 300, 1_000_000);
    const build = state.building.mart!;
    expect(secondsLeft(build, 1_000_000)).toBe(300);
    expect(secondsLeft(build, 1_000_000 + 100_000)).toBe(200);
    expect(takeFinished(state, 1_000_000 + 299_000)).toEqual([]);
    expect(takeFinished(state, 1_000_000 + 300_000)).toEqual(['mart']);
    expect(state.building.mart).toBeUndefined();
  });

  it('the ad halves what is left, only once', () => {
    const state = newGame();
    startBuild(state, 'tunnel', 1800, 0);
    const build = state.building.tunnel!;
    expect(halveBuild(build, 600_000)).toBe(true);
    expect(secondsLeft(build, 600_000)).toBe(600);
    expect(halveBuild(build, 600_000)).toBe(false);
    expect(secondsLeft(build, 600_000)).toBe(600);
  });

  it('gems to finish grow with the time left, at least one', () => {
    const per = TUNING.construction.gemSeconds;
    expect(finishGems(1)).toBe(1);
    expect(finishGems(per)).toBe(1);
    expect(finishGems(per + 1)).toBe(2);
    expect(finishGems(30 * 60)).toBe(Math.ceil(1800 / per));
  });

  it('finds the build that ends soonest, and finished ones come out in order', () => {
    const state = newGame();
    startBuild(state, 'garage', 900, 0);
    startBuild(state, 'mart', 300, 0);
    expect(soonestBuild(state)?.id).toBe('mart');
    expect(takeFinished(state, 1e9)).toEqual(['mart', 'garage']);
    expect(soonestBuild(state)).toBeNull();
  });

  it('shows minutes, or hours for long builds', () => {
    expect(formatClock(299.2)).toBe('5:00');
    expect(formatClock(61)).toBe('1:01');
    expect(formatClock(4 * 3600)).toBe('4:00:00');
  });

  it('only buildings take time, and none in the first five minutes of play', () => {
    for (const pad of PADS) {
      if (pad.buildSeconds) expect(pad.targetMinute, pad.id).toBeGreaterThan(5);
    }
    expect(PADS.find((p) => p.id === 'mart')?.buildSeconds).toBeGreaterThan(0);
  });
});
