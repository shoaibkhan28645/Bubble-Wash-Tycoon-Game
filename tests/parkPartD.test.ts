// Starlight Fun Park, part D: the gift shop on the way out, the track rides
// (the log flume and the Starlight Comet), the prize shelf, and the
// chapter's last pads, story and goals.
import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/core/config';
import { newGame } from '../src/core/gameState';
import { STARLIGHT } from '../src/core/starlight';
import { ParkCrowd, type Launch, type ParkVisitor } from '../src/systems/park';
import { PLUSH, shelf, shelfBonus, winPlush } from '../src/systems/prizes';
import type { WalkUpCounter } from '../src/systems/walkups';
import { t } from '../src/ui/strings';

const { layout } = STARLIGHT;
const STEP = 0.05;

function park(seed = 11) {
  const launches: { id: string; launch: Launch }[] = [];
  const served: { id: string; visitor: ParkVisitor }[] = [];
  const perfect: ParkVisitor[] = [];
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const crowd = new ParkCrowd(
    layout,
    newGame(),
    () => 0,
    () => 0,
    null,
    (_from, to) => [to],
    {
      onServed: (visitor, counter: WalkUpCounter) => served.push({ id: counter.id, visitor }),
      onGaveUp: () => {},
      onLaunch: (ride, launch) => launches.push({ id: ride.id, launch }),
      onPerfectDay: (visitor) => perfect.push(visitor),
    },
    random,
  );
  crowd.open = true;
  crowd.addCounter('booth', 'booth', null);
  return { crowd, launches, served, perfect };
}

function run(crowd: ParkCrowd, seconds: number, staff = true, onStep?: () => void) {
  for (let t = 0; t < seconds; t += STEP) {
    crowd.update(STEP, () => ({ rate: 1, byPlayer: false }), () => ({ hero: false, staff }));
    onStep?.();
  }
}

describe('the gift shop', () => {
  it('gets a look on the way out, once everything else is done, and sends people home with a souvenir', () => {
    const { crowd, served, perfect } = park();
    crowd.addRide('carousel', 'carousel');
    crowd.addCounter('giftshop', 'giftshop', null);
    run(crowd, 400);
    const shoppers = served.filter((s) => s.id === 'giftshop').map((s) => s.visitor);
    expect(shoppers.length).toBeGreaterThan(2);
    for (const v of shoppers) {
      expect(v.shopped).toBe(true);
      // Nothing left to do but go home, holding it (no wrapper to drop).
      expect(v.wishes.filter((w) => w !== 'giftshop')).toEqual([]);
      expect(v.snackLeft).toBe(0);
    }
    // Shopping on the way out still counts as a perfect day.
    expect(perfect.some((v) => shoppers.includes(v))).toBe(true);
    // Not everyone goes in.
    const done = crowd.visitors.filter((v) => v.shopped);
    expect(served.filter((s) => s.id === 'booth').length).toBeGreaterThan(shoppers.length);
    expect(done.length + shoppers.length).toBeGreaterThan(0);
  });

  it('is never on a wish list', () => {
    const { crowd } = park();
    crowd.addRide('carousel', 'carousel');
    crowd.addCounter('giftshop', 'giftshop', null);
    let wished = false;
    run(crowd, 200, true, () => {
      for (const v of crowd.visitors) if (!v.shopped && v.wishes.includes('giftshop')) wished = true;
    });
    expect(wished).toBe(false);
  });
});

describe('the track rides', () => {
  it('boards riders up onto the station deck, runs a lap, and lets them off by the way out', () => {
    for (const id of ['flume', 'coaster'] as const) {
      const { crowd, launches } = park();
      const ride = crowd.addRide(id, id)!;
      let highest = 0;
      run(crowd, 260, true, () => {
        for (const v of crowd.visitors) if (v.ride === ride && v.step === 'boarding') highest = Math.max(highest, v.y);
      });
      const goes = launches.filter((l) => l.id === id);
      expect(goes.length).toBeGreaterThan(0);
      expect(highest).toBeCloseTo(ride.def.deck, 5);
      expect(crowd.visitors.some((v) => v.step === 'offRide' || (v.ticket && !v.wishes.includes(id)))).toBe(true);
    }
  });

  it('keeps riders on the ground while they wait in line, and below the deck on the stairs', () => {
    const { crowd } = park();
    const ride = crowd.addRide('coaster', 'coaster')!;
    const deck = layout.rides.coaster!.deck!;
    expect(ride.heightAt(ride.spot.queue[0]!)).toBe(0);
    const stairs = ride.heightAt({ x: ride.steps.x, z: deck.minZ - 0.3 });
    expect(stairs).toBeGreaterThan(0);
    expect(stairs).toBeLessThan(ride.def.deck);
  });
});

describe('the prize shelf', () => {
  it('puts a new plush on the shelf now and then, never the same one twice', () => {
    const state = newGame();
    let seed = 3;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let wins = 0;
    for (let i = 0; i < 2000; i++) if (winPlush(state, random)) wins++;
    expect(wins).toBe(shelf(state).length);
    expect(shelf(state).length).toBeGreaterThanOrEqual(PLUSH.length - 1);
    expect(new Set(shelf(state).map((p) => p.id)).size).toBe(shelf(state).length);
  });

  it('wins nothing most of the time, and the golden star only rarely', () => {
    const rules = TUNING.park.prizes;
    let goldens = 0;
    let none = 0;
    for (let k = 0; k < 400; k++) {
      const state = newGame();
      const plush = winPlush(state);
      if (!plush) none++;
      else if (plush.golden) goldens++;
    }
    expect(none / 400).toBeGreaterThan(1 - rules.chance - 0.1);
    expect(goldens).toBeLessThan(15);
  });

  it('adds to every ride ticket for each full set of four', () => {
    const { setBonus } = TUNING.park.prizes;
    expect(shelfBonus(3)).toBe(0);
    expect(shelfBonus(4)).toBeCloseTo(setBonus);
    expect(shelfBonus(12)).toBeCloseTo(3 * setBonus);
  });
});

describe("part D's pads, story and goals", () => {
  it('ends with the thrill rides, the landmark and the highway, the chapter getting dearer as it goes', () => {
    const ids = STARLIGHT.pads.map((p) => p.id);
    expect(ids.slice(-8)).toEqual(['flume', 'giftshop', 'manager', 'fireworks', 'coaster', 'crew', 'wheel', 'highway']);
    for (let i = 1; i < STARLIGHT.pads.length; i++) {
      expect(STARLIGHT.pads[i]!.targetMinute).toBeGreaterThanOrEqual(STARLIGHT.pads[i - 1]!.targetMinute);
      if (STARLIGHT.pads[i]!.cost > 0) expect(STARLIGHT.pads[i]!.cost).toBeGreaterThan(STARLIGHT.pads[i - 1]!.cost);
    }
    const highway = STARLIGHT.pads.at(-1)!;
    expect(highway.afterGoals).toBe(true);
    expect(highway.effects.travel).toBe('downtown');
    expect(STARLIGHT.pads.find((p) => p.id === 'wheel')!.buildSeconds).toBe(14400);
    expect(STARLIGHT.pads.some((p) => p.effects.endOfContent)).toBe(false);
  });

  it('has a place on the map for every new pad, and a site for the wheel', () => {
    for (const id of ['flume', 'giftshop', 'manager', 'fireworks', 'coaster', 'crew', 'wheel', 'highway']) expect(layout.pads[id]).toBeTruthy();
    expect(layout.sites.wheel).toBeTruthy();
    expect(layout.staffSpots.crew).toBeTruthy();
    expect(layout.counters.giftshop).toBeTruthy();
    expect((layout.managerRound ?? []).length).toBeGreaterThan(4);
  });

  it('names its eight goals', () => {
    expect(STARLIGHT.goals.goals.map((g) => g.id)).toEqual(['fullhouse', 'fixes', 'perfectDay', 'stars', 'shelf', 'coaster', 'fireworks', 'wheel']);
    for (const g of STARLIGHT.goals.goals) expect(t(`goal_${g.id}` as Parameters<typeof t>[0], { n: 1 })).not.toContain('goal_');
  });

  it('tells of the coaster beating MegaLand, the first fireworks and the wheel', () => {
    const beats = STARLIGHT.story.beats.map((b) => b.id);
    for (const id of ['flume', 'giftshop', 'fireworks', 'coaster', 'landmark']) expect(beats).toContain(id);
    const rival = STARLIGHT.story.beats.find((b) => b.id === 'rival')!;
    expect(rival.effect?.rival?.until).toBe('coaster');
  });
});
