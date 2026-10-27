import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/core/config';
import { IncomeTracker, offlineEarnings } from '../src/systems/offline';

const rules = TUNING.offline;
const HOUR = 3600_000;
const saved = 1_800_000_000_000;

describe('offlineEarnings', () => {
  it('pays 50% of the automated rate for time away', () => {
    // $60/min for 1 hour at 50% = $1,800
    expect(offlineEarnings(60, saved, saved + HOUR, rules, false, 0)).toEqual({ seconds: 3600, cash: 1800 });
  });

  it('pays 100% with a manager', () => {
    expect(offlineEarnings(60, saved, saved + HOUR, rules, true, 0).cash).toBe(3600);
  });

  it('caps at 2 hours, then 4, 6 and 8 with manager upgrades', () => {
    const week = saved + 7 * 24 * HOUR;
    expect(offlineEarnings(60, saved, week, rules, false, 0).seconds).toBe(2 * 3600);
    expect(offlineEarnings(60, saved, week, rules, true, 1).seconds).toBe(4 * 3600);
    expect(offlineEarnings(60, saved, week, rules, true, 3).seconds).toBe(8 * 3600);
    expect(offlineEarnings(60, saved, week, rules, true, 99).seconds).toBe(8 * 3600);
  });

  it('moving the device clock backwards gives nothing', () => {
    expect(offlineEarnings(60, saved, saved - 5 * HOUR, rules, true, 3)).toEqual({ seconds: 0, cash: 0 });
  });

  it('moving the clock far forward still stops at the cap', () => {
    const cash = offlineEarnings(60, saved, saved + 1e6 * HOUR, rules, false, 0).cash;
    expect(cash).toBe(60 * 120 * 0.5);
  });

  it('ignores short absences, a new game and stations nobody automated', () => {
    expect(offlineEarnings(60, saved, saved + 30_000, rules, false, 0).cash).toBe(0);
    expect(offlineEarnings(60, 0, saved, rules, false, 0).cash).toBe(0);
    expect(offlineEarnings(0, saved, saved + HOUR, rules, false, 0).cash).toBe(0);
    expect(offlineEarnings(Number.NaN, saved, saved + HOUR, rules, false, 0).cash).toBe(0);
  });
});

describe('IncomeTracker', () => {
  it('averages automated income per minute over the window', () => {
    const tracker = new IncomeTracker(300);
    for (let t = 0; t <= 600; t += 10) tracker.add(t, 20); // $20 every 10 s = $120/min
    expect(tracker.perMinute(600)).toBeCloseTo(120, -1);
  });

  it('forgets income older than the window', () => {
    const tracker = new IncomeTracker(300);
    tracker.add(10, 1000);
    expect(tracker.perMinute(400)).toBe(0);
  });

  it('starts from the saved rate and blends towards what it measures', () => {
    const tracker = new IncomeTracker(300, 90);
    expect(tracker.perMinute(0)).toBe(90);
    expect(tracker.perMinute(150)).toBeCloseTo(45);
  });
});
