// The Phase 1 gate for the shop's perks: a player wearing the strongest loadout for each town still takes
// at least 80% of the planned time over it (the whole-journey model, src/sim/journey.ts).
import { describe, expect, it } from 'vitest';
import { SHOP } from '../src/core/config';
import { newGame } from '../src/core/gameState';
import { STARLIGHT } from '../src/core/starlight';
import { ROADSIDE } from '../src/core/towns';
import { WILLOWBROOK } from '../src/core/willowbrook';
import { gameJourney, playJourney } from '../src/sim/journey';
import { PAY_PERKS, perkValue } from '../src/systems/perks';

const pick = (list: { id: string }[]) => [undefined, ...list.map((i) => i.id)];

/**
 * The most of a town's income each pay perk can touch, rounded up: the cash the hero picks up is nearly all of it;
 * tips, VIPs, monster trucks, contracts and rush jobs are a slice each (a fifth to a third at most); the hero's
 * own ride launches over half the park's; the on-time and perfect take-off bonuses a quarter of a flight's pay.
 */
const PAY_SHARE: Partial<Record<(typeof PAY_PERKS)[number], number>> = {
  pickupValue: 1,
  tenthDouble: 1,
  tips: 0.2,
  staffTips: 0.2,
  vipPay: 0.25,
  monster: 0.2,
  rushPay: 0.3,
  contracts: 0.2,
  rideTickets: 0.6,
  perfectLaunch: 0.2,
  onTime: 0.25,
  takeoff: 0.2,
};

/**
 * The most a loadout can lift a town's income, counted generously: each pay perk on its share of the income, hand
 * work on the hero's half of the work, the staff's work on all of it, and walking (past the free suit's) on a quarter.
 */
function strongest(town: string): { factor: number; loadout: string } {
  let best = { factor: 1, loadout: '' };
  for (const outfit of SHOP.outfits) {
    for (const hat of pick(SHOP.hats)) {
      for (const trail of pick(SHOP.trails)) {
        for (const brand of SHOP.brands) {
          const state = newGame();
          state.wardrobe.owned.push(...[outfit.id, hat, trail, brand.id].filter((id): id is string => !!id));
          state.wardrobe.equipped = { outfit: outfit.id, brand: brand.id, ...(hat ? { hat } : {}), ...(trail ? { trail } : {}) };
          const v = (kind: Parameters<typeof perkValue>[1]) => perkValue(state, kind, town);
          const pay = PAY_PERKS.reduce((sum, kind) => sum + v(kind) * (PAY_SHARE[kind] ?? 1), 0);
          const factor = (1 + pay) * (1 + 0.5 * v('handWork')) * (1 + v('staffWork')) * (1 + 0.25 * Math.max(0, v('walk') - 0.05));
          if (factor > best.factor) best = { factor, loadout: [outfit.id, hat, trail, brand.id].join(' ') };
        }
      }
    }
  }
  return best;
}

describe('shop perks and the pacing plan', () => {
  const maps = [ROADSIDE, WILLOWBROOK, STARLIGHT];
  const journey = gameJourney(ROADSIDE, WILLOWBROOK, STARLIGHT);
  const plain = playJourney(journey);
  const lifts = maps.map((m) => strongest(m.id));
  const kitted = playJourney(journey.map((map, i) => ({ ...map, income: (u, t, levels) => map.income(u, t, levels) * lifts[i]!.factor })));

  it('keeps every town at 80% or more of its planned time with the strongest loadout', () => {
    for (const [i, map] of maps.entries()) {
      const planned = map.pads.at(-1)!.targetMinute;
      const leg = kitted[i]!;
      console.log(`${map.id}: x${lifts[i]!.factor.toFixed(3)} (${lifts[i]!.loadout}) -> ${leg.minutes.toFixed(1)} min, plain ${plain[i]!.minutes.toFixed(1)}, planned ${planned}`);
      expect(leg.minutes / planned, map.id).toBeGreaterThanOrEqual(0.8);
    }
  });
});
