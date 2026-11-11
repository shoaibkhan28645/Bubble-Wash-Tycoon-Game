// The whole journey: the car wash town from $0, the land for the farm,
// Willowbrook, the land for the park, Starlight Fun Park. `npm run pacing`
// prints the report.
import { describe, expect, it } from 'vitest';
import { STARLIGHT } from '../src/core/starlight';
import { ROADSIDE } from '../src/core/towns';
import { WILLOWBROOK } from '../src/core/willowbrook';
import { FARM_PACING } from '../src/sim/farmPacing';
import { gameJourney, playJourney } from '../src/sim/journey';
import { PARK_PACING } from '../src/sim/parkPacing';
import { costOf } from '../src/systems/upgrades';

declare const process: { env: Record<string, string | undefined> };

const maps = [ROADSIDE, WILLOWBROOK, STARLIGHT] as const;
const legs = playJourney(gameJourney(ROADSIDE, WILLOWBROOK, STARLIGHT));

describe('the whole journey', () => {
  it.runIf(process.env.PACING_REPORT)('prints the report', () => {
    console.table(
      legs.map((l) => ({
        map: l.name,
        minutes: l.minutes,
        away: l.awayMinutes,
        'arrived with': l.arrivedWith,
        'bought at once': l.boughtOnArrival,
        'old towns /min': l.background,
        'own/old at 1st': l.ownAtFirst,
        'own/old halfway': l.ownAtMiddle,
        'end /min': l.endIncome,
        'cash at land': l.cashAtLand,
        land: l.land,
        left: l.left,
      })),
    );
    for (const l of legs) console.log(l.name, JSON.stringify(l.boughtAt));
  });

  it('takes each map about as long as planned (its land pad\'s minute), each longer than the last', () => {
    legs.forEach((leg, i) => {
      const planned = maps[i]!.pads.at(-1)!.targetMinute;
      expect(Math.abs(leg.minutes / planned - 1), `${leg.name}: ${leg.minutes} min, planned ${planned}`).toBeLessThanOrEqual(0.12);
      if (i > 0) expect(leg.minutes).toBeGreaterThan(legs[i - 1]!.minutes);
    });
  });

  it('has the land take nearly all the money a map ends with', () => {
    for (const leg of legs.slice(0, -1)) expect(leg.land / leg.cashAtLand, leg.name).toBeGreaterThanOrEqual(0.85);
  });

  it('leaves no more money than buys the next map\'s first purchase or two', () => {
    for (const leg of legs.slice(1)) expect(leg.boughtOnArrival, leg.name).toBeLessThanOrEqual(2);
  });

  it("matches the farm's and the park's own simulators: what the hero arrives with, and the old towns' income", () => {
    const near = (a: number, b: number) => Math.abs(a / b - 1);
    expect(near(FARM_PACING.startCash, legs[1]!.arrivedWith)).toBeLessThan(0.1);
    expect(near(FARM_PACING.background, legs[1]!.background)).toBeLessThan(0.1);
    expect(near(PARK_PACING.startCash, legs[2]!.arrivedWith)).toBeLessThan(0.1);
    expect(near(PARK_PACING.background, legs[2]!.background)).toBeLessThan(0.1);
  });

  it("prices the hero's own upgrades for the map they're bought in: about half its first purchase", () => {
    maps.slice(1).forEach((map) => {
      const first = map.pads.find((p) => p.cost > 0)!.cost;
      for (const key of ['player.walk', 'player.carry']) {
        const cost = costOf(key, 0, map.id);
        expect(cost / first, `${key} in ${map.id}: ${cost}, first purchase ${first}`).toBeGreaterThan(0.3);
        expect(cost / first).toBeLessThan(0.8);
      }
    });
  });

  it('has each new map earn its own way, not on the old towns\' income', () => {
    for (const leg of legs.slice(1)) {
      expect(leg.ownAtFirst, `${leg.name} at its first purchase`).toBeGreaterThanOrEqual(0.8);
      expect(leg.ownAtMiddle, `${leg.name} halfway`).toBeGreaterThanOrEqual(3);
    }
  });
});
