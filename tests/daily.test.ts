import { describe, expect, it } from 'vitest';
import { DAILY, PADS } from '../src/core/config';
import { newGame } from '../src/core/gameState';
import {
  addProgress,
  calendarReady,
  carOfDay,
  claimCalendar,
  claimable,
  claimMission,
  localDate,
  pickMissions,
  rollDay,
} from '../src/systems/daily';

const all = PADS.map((p) => p.id);

describe('daily missions', () => {
  it('uses the local date', () => {
    expect(localDate(new Date(2026, 9, 28, 23, 59))).toBe('2026-10-28');
    expect(localDate(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
  });

  it('picks the same three missions all day, and different ones on other days', () => {
    const a = pickMissions('2026-10-28', all);
    expect(a.missions).toHaveLength(DAILY.missionsPerDay);
    expect(new Set(a.missions).size).toBe(DAILY.missionsPerDay);
    expect(pickMissions('2026-10-28', all)).toEqual(a);
    const days = ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'].map((d) => pickMissions(d, all).missions.join());
    expect(new Set([a.missions.join(), ...days]).size).toBeGreaterThan(1);
  });

  it('only offers what the lot can do, with goals that grow with progress', () => {
    for (let d = 1; d <= 20; d++) {
      const { missions } = pickMissions(`2026-11-${String(d).padStart(2, '0')}`, ['bay1']);
      for (const id of missions) expect(['wash', 'handWash', 'earn', 'tips', 'upgrade']).toContain(id);
    }
    const early = pickMissions('2026-10-28', ['bay1']);
    const late = pickMissions('2026-10-28', all);
    const earnEarly = DAILY.missions.find((m) => m.id === 'earn')!.goal;
    expect(Math.max(...late.goals)).toBeGreaterThan(Math.max(...early.goals));
    expect(earnEarly).toBe(400);
  });

  it('deals fresh missions on a new day only', () => {
    const state = newGame();
    state.unlocked = ['bay1'];
    expect(rollDay(state, '2026-10-28')).toBe(true);
    state.daily.progress[0] = 3;
    expect(rollDay(state, '2026-10-28')).toBe(false);
    expect(state.daily.progress[0]).toBe(3);
    expect(rollDay(state, '2026-10-29')).toBe(true);
    expect(state.daily.progress.every((p) => p === 0)).toBe(true);
  });

  it('counts progress up to the goal, reports completion once, and pays gems once', () => {
    const state = newGame();
    Object.assign(state.daily, { date: 'd', missions: ['wash', 'tips', 'wash'], goals: [3, 2, 1], progress: [0, 0, 0], claimed: [false, false, false] });
    expect(addProgress(state, 'wash', 2)).toEqual(['wash']);
    expect(addProgress(state, 'wash', 5)).toEqual(['wash']);
    expect(addProgress(state, 'wash')).toEqual([]);
    expect(state.daily.progress).toEqual([3, 0, 1]);
    expect(claimable(state, 'd').missions).toBe(2);
    const gems = DAILY.missions.find((m) => m.id === 'wash')!.gems;
    expect(claimMission(state, 0)).toBe(gems);
    expect(claimMission(state, 0)).toBe(0);
    expect(claimMission(state, 1)).toBe(0);
    expect(state.gems).toBe(gems);
  });
});

describe('login calendar', () => {
  it('one claim a day; missed days only pause it; day 7 is the chest, then it starts over', () => {
    const state = newGame();
    expect(claimCalendar(state, '2026-10-01')).toBe(DAILY.calendar[0]!.gems);
    expect(calendarReady(state, '2026-10-01')).toBe(false);
    expect(claimCalendar(state, '2026-10-01')).toBe(0);
    // Away for a week: the next claim is still day 2.
    expect(claimCalendar(state, '2026-10-09')).toBe(DAILY.calendar[1]!.gems);
    for (let d = 10; d <= 14; d++) claimCalendar(state, `2026-10-${d}`);
    expect(state.daily.loginDay).toBe(0);
    expect(DAILY.calendar[6]!.chest).toBe(true);
    expect(state.gems).toBe(DAILY.calendar.reduce((sum, r) => sum + r.gems, 0));
  });
});

describe('Car of the Day', () => {
  it('is the same car all day and comes from the list', () => {
    const car = carOfDay('2026-10-28');
    expect(carOfDay('2026-10-28')).toBe(car);
    expect(DAILY.carOfDay.cars).toContain(car);
    const week = new Set(Array.from({ length: 14 }, (_, i) => carOfDay(`2026-10-${String(i + 10)}`).id));
    expect(week.size).toBeGreaterThan(1);
  });
});
