// The gate for the shop's perks: a keen player wearing the strongest loadout they could have by then for each
// town (and every decoration for it they could afford up) still takes at least 80% of the planned time over it
// (the whole-journey model, src/sim/journey.ts).
import { describe, expect, it } from 'vitest';
import { SHOP } from '../src/core/config';
import { newGame } from '../src/core/gameState';
import { STARLIGHT } from '../src/core/starlight';
import { ROADSIDE } from '../src/core/towns';
import { WILLOWBROOK } from '../src/core/willowbrook';
import { gameJourney, playJourney } from '../src/sim/journey';
import { PAY_PERKS, PAY_SHARE, perkValue, type PerkKind } from '../src/systems/perks';

/**
 * Gems a keen player has had to spend by each town, rounded up: the town goals so far (118, then 170, 165), the
 * starter item, and two days of the calendar, missions and gem ads (about 50 a day) per town.
 */
const BUDGET: Record<string, number> = { roadside: 250, willowbrook: 600, starlight: 1000 };

/** What the busier and more productive towns' perks add, counted generously: more customers lift income by half as much, more crops, fruit, eggs and milk by their part of the farm's. */
const MORE_SHARE: Partial<Record<PerkKind, number>> = {
  arrivals: 0.5,
  eveningArrivals: 0.25,
  grow: 0.4,
  fruit: 0.15,
  milk: 0.15,
  livestock: 0.3,
  flightSlack: 0.1,
  litterDrop: 0.1,
};

/** What an item costs a player: its gems; a set's reward, the whole set; the rank hats, nothing (they come early); anything else earned, out of reach. */
function cost(id: string | undefined): number {
  if (!id) return 0;
  const item = [...SHOP.outfits, ...SHOP.hats, ...SHOP.trails, ...SHOP.brands, ...SHOP.decor].find((i) => i.id === id)!;
  if (!item.earn) return item.gems;
  if (item.earn.rank) return 0;
  const set = SHOP.sets.find((s) => s.reward === id);
  if (set) return set.items.reduce((sum, i) => sum + cost(i), 0);
  return Infinity;
}

const options = (list: { id: string }[]) => [undefined, ...list.map((i) => i.id)];
/** Every way to choose some of a list. */
const subsets = <T,>(list: T[]): T[][] => list.reduce<T[][]>((all, x) => [...all, ...all.map((s) => [...s, x])], [[]]);

/**
 * The most a loadout the budget buys can lift a town's income, counted generously: the pay perks as they lift it
 * together (PAY_SHARE, capped), hand work on the hero's half of the work and the staff's work on theirs, walking
 * (past the free suit's) on a quarter, and more customers and more produce on their parts (MORE_SHARE).
 */
function strongest(town: string, budget: number): { factor: number; loadout: string } {
  let best = { factor: 1, loadout: '' };
  const decor = subsets(SHOP.decor.filter((d) => d.town === town && cost(d.id) <= budget).map((d) => d.id));
  for (const outfit of SHOP.outfits) {
    for (const hat of options(SHOP.hats)) {
      for (const trail of options(SHOP.trails)) {
        for (const brand of SHOP.brands) {
          const worn = cost(outfit.id) + cost(hat) + cost(trail) + cost(brand.id);
          if (worn > budget) continue;
          for (const up of decor) {
            if (worn + up.reduce((sum, id) => sum + cost(id), 0) > budget) continue;
            const state = newGame();
            state.wardrobe.owned.push(...[outfit.id, hat, trail, brand.id].filter((id): id is string => !!id), ...up);
            state.wardrobe.equipped = { outfit: outfit.id, brand: brand.id, ...(hat ? { hat } : {}), ...(trail ? { trail } : {}) };
            const v = (kind: PerkKind) => perkValue(state, kind, town);
            const pay = PAY_PERKS.reduce((sum, kind) => sum + v(kind) * (PAY_SHARE[kind] ?? 1), 0);
            const more = Object.entries(MORE_SHARE).reduce((sum, [kind, share]) => sum + v(kind as PerkKind) * share, 0);
            const factor = (1 + pay) * (1 + 0.5 * v('handWork') + 0.5 * v('staffWork')) * (1 + 0.25 * Math.max(0, v('walk') - 0.05)) * (1 + more);
            if (factor > best.factor) best = { factor, loadout: [outfit.id, hat, trail, brand.id, ...up].filter(Boolean).join(' ') };
          }
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
  const lifts = maps.map((m) => strongest(m.id, BUDGET[m.id]!));
  const kitted = playJourney(journey.map((map, i) => ({ ...map, income: (u, t, levels) => map.income(u, t, levels) * lifts[i]!.factor })));

  it('keeps every town at 80% or more of its planned time with the strongest loadout a keen player has by then', () => {
    for (const [i, map] of maps.entries()) {
      const planned = map.pads.at(-1)!.targetMinute;
      const leg = kitted[i]!;
      console.log(`${map.id}: x${lifts[i]!.factor.toFixed(3)} (${lifts[i]!.loadout}) -> ${leg.minutes.toFixed(1)} min, plain ${plain[i]!.minutes.toFixed(1)}, planned ${planned}`);
      expect(leg.minutes / planned, map.id).toBeGreaterThanOrEqual(0.8);
    }
  });
});
