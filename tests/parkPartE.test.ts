// Starlight Fun Park, part E: the Visitor of the Day, wish lists, the park's
// own daily missions (and each town keeping its set of the day), and the side
// buttons opening wherever the hero is.
import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/core/config';
import { newGame } from '../src/core/gameState';
import { STARLIGHT } from '../src/core/starlight';
import { ParkCrowd, type ParkVisitor } from '../src/systems/park';
import { addProgress, pickMissions, rollDay } from '../src/systems/daily';
import { sideButtonOpen } from '../src/systems/guide';
import DAILY from '../src/data/daily.json';

const { layout } = STARLIGHT;
const STEP = 0.05;

function park() {
  const wishes: ParkVisitor[] = [];
  const perfect: ParkVisitor[] = [];
  let seed = 9;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const crowd = new ParkCrowd(layout, newGame(), () => 0, () => 0, null, (_from, to) => [to], {
    onServed: () => {},
    onGaveUp: () => {},
    onLaunch: () => {},
    onPerfectDay: (v) => perfect.push(v),
    onWishes: (v) => wishes.push(v),
  }, random);
  crowd.open = true;
  crowd.addCounter('booth', 'booth', null);
  for (const id of ['carousel', 'bumper', 'teacups', 'swings', 'haunted', 'flume', 'coaster']) crowd.addRide(id, id);
  for (const id of ['cart', 'ringtoss', 'burger']) crowd.addCounter(id, id, null);
  return { crowd, wishes, perfect };
}

function run(crowd: ParkCrowd, seconds: number) {
  for (let t = 0; t < seconds; t += STEP) crowd.update(STEP, () => ({ rate: 1, byPlayer: false }), () => ({ hero: false, staff: true }));
}

describe('wish lists', () => {
  it('gives each visitor two to four wishes, told as soon as they have a ticket', () => {
    const { crowd, wishes } = park();
    run(crowd, 120);
    expect(wishes.length).toBeGreaterThan(10);
    const [low, high] = TUNING.park.wishes.count as [number, number];
    for (const v of wishes) {
      expect(v.wished).toBeGreaterThanOrEqual(low);
      expect(v.wished).toBeLessThanOrEqual(high);
    }
  });
});

describe('the Visitor of the Day', () => {
  it('comes with a long wish list and far more patience, and counts what they spend', () => {
    const { crowd, wishes } = park();
    const vip = crowd.spawnVip()!;
    expect(vip.vip).toBe(true);
    expect(vip.patienceMax).toBeCloseTo(TUNING.park.visitors.patience * TUNING.park.vip.patience);
    run(crowd, 60);
    expect(wishes).toContain(vip);
    expect(vip.wished).toBe(TUNING.park.vip.wishes);
    expect(vip.spent).toBe(0);
  });

  it('can have a perfect day, given time', () => {
    const { crowd, perfect } = park();
    const vip = crowd.spawnVip()!;
    run(crowd, 500);
    expect(perfect).toContain(vip);
  });
});

describe("the park's daily missions", () => {
  const park = STARLIGHT.pads.map((p) => p.id);

  it('picks only park missions in the park, and only car wash ones at the car wash', () => {
    const inTown = (m: { town?: string; towns?: string[] }, town: string) => (m.towns ? m.towns.includes(town) : (m.town ?? 'carWash') === town);
    const parkIds = DAILY.missions.filter((m) => inTown(m, 'park')).map((m) => m.id);
    const parkOnly = DAILY.missions.filter((m) => inTown(m, 'park') && !inTown(m, 'carWash')).map((m) => m.id);
    for (let d = 1; d <= 20; d++) {
      const date = `2026-11-${String(d).padStart(2, '0')}`;
      const inPark = pickMissions(date, park, 'park').missions;
      expect(inPark.length).toBe(DAILY.missionsPerDay);
      for (const id of inPark) expect(parkIds).toContain(id);
      for (const id of pickMissions(date, ['bay1', 'mart', 'pump1'], 'carWash').missions) expect(parkOnly).not.toContain(id);
    }
    // A town with no missions of its own has none (rush jobs only once it has a job that can come: the barn's rush order).
    expect(pickMissions('2026-11-02', ['stand'], 'farm').missions).toEqual([]);
    expect(pickMissions('2026-11-02', ['stand', 'barn'], 'farm').missions).toEqual(['jobs']);
  });

  it('keeps each town its own set of the day: travelling away and back never deals a fresh one', () => {
    const state = newGame();
    state.unlocked = ['bay1', 'mart'];
    rollDay(state, '2026-11-10', 'carWash');
    const carWash = [...state.daily.missions];
    addProgress(state, state.daily.missions[0] as never, 2);
    state.unlocked = park;
    expect(rollDay(state, '2026-11-10', 'park')).toBe(true);
    expect(state.daily.missions).not.toEqual(carWash);
    const parkSet = [...state.daily.missions];
    state.unlocked = ['bay1', 'mart'];
    rollDay(state, '2026-11-10', 'carWash');
    expect(state.daily.missions).toEqual(carWash);
    expect(state.daily.progress[0]).toBe(2);
    state.unlocked = park;
    rollDay(state, '2026-11-10', 'park');
    expect(state.daily.missions).toEqual(parkSet);
    // A new day deals a new set.
    expect(rollDay(state, '2026-11-11', 'park')).toBe(true);
  });
});

describe('the side buttons', () => {
  it('stay open in a new town once their pad was built in any town', () => {
    const state = newGame();
    state.playSeconds = 9999;
    state.unlocked = ['booth', 'carousel'];
    expect(sideButtonOpen(state, 'missions')).toBe(false);
    state.towns.roadside = { ...newGame(), unlocked: ['bay1', 'washer', 'mart', 'bay2'] } as never;
    expect(sideButtonOpen(state, 'missions')).toBe(true);
    expect(sideButtonOpen(state, 'calendar')).toBe(true);
  });
});
