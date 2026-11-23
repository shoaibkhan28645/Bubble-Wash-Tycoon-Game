import { describe, expect, it } from 'vitest';
import { SHOP } from '../src/core/config';
import { newGame } from '../src/core/gameState';
import { BEST_NET_WORTH } from '../src/systems/career';
import { PAY_CAP, PAY_PERKS, PERK_CAPS, activeItems, perkValue, type PerkKind } from '../src/systems/perks';
import { DEFAULT_OUTFIT } from '../src/systems/wardrobe';

const TOWNS = ['roadside', 'willowbrook', 'starlight', 'skyport'];

function wearing(ids: { outfit?: string; hat?: string; trail?: string; brand?: string }) {
  const state = newGame();
  state.wardrobe.owned.push(...Object.values(ids).filter((id): id is string => !!id));
  for (const [slot, id] of Object.entries(ids)) if (id) state.wardrobe.equipped[slot as 'outfit'] = id;
  return state;
}

describe('shop perks', () => {
  it('gives every outfit, hat, trail and brand theme one perk', () => {
    for (const list of [SHOP.outfits, SHOP.hats, SHOP.trails, SHOP.brands]) {
      for (const item of list) {
        expect(item.perk, item.id).toBeDefined();
        expect(item.perk!.value, item.id).toBeGreaterThan(0);
        if (item.perk!.town) expect(TOWNS, item.id).toContain(item.perk!.town);
      }
    }
  });

  it('works only while worn: a new player has the navy suit and the classic theme', () => {
    const state = newGame();
    expect(activeItems(state).map((i) => i.id)).toEqual([DEFAULT_OUTFIT.id, SHOP.brands[0]!.id]);
    expect(perkValue(state, 'walk', 'roadside')).toBeCloseTo(0.05);
    expect(perkValue(state, 'staffWalk', 'roadside')).toBeCloseTo(0.05);
    // Owned but not worn: nothing.
    state.wardrobe.owned.push('cap');
    expect(perkValue(state, 'walk', 'roadside')).toBeCloseTo(0.05);
    state.wardrobe.equipped.hat = 'cap';
    expect(perkValue(state, 'walk', 'roadside')).toBeCloseTo(0.1);
  });

  it('works only in its own town', () => {
    const state = wearing({ outfit: 'aviator' });
    expect(perkValue(state, 'carry', 'skyport')).toBe(2);
    expect(perkValue(state, 'carry', 'roadside')).toBe(0);
  });

  it('adds up, then stops at the cap (ranks count too)', () => {
    const state = wearing({ outfit: 'classic', hat: 'cap', trail: 'contrail' });
    state.counts[BEST_NET_WORTH] = 1e12;
    // Rank 0.1 + suit 0.05 + cap 0.05 + contrail 0.12 = 0.32, capped.
    expect(perkValue(state, 'walk', 'skyport')).toBe(PERK_CAPS.walk);
    expect(perkValue(state, 'walk', 'roadside')).toBeCloseTo(0.2);
  });

  it('no loadout raises pay by more than the cap in any town', () => {
    const pick = (list: { id: string }[]) => [undefined, ...list.map((i) => i.id)];
    let worst = 0;
    for (const outfit of SHOP.outfits) {
      for (const hat of pick(SHOP.hats)) {
        for (const trail of pick(SHOP.trails)) {
          for (const brand of SHOP.brands) {
            const state = wearing({ outfit: outfit.id, hat, trail, brand: brand.id });
            for (const town of TOWNS) {
              const pay = PAY_PERKS.reduce((sum, kind: PerkKind) => sum + perkValue(state, kind, town), 0);
              worst = Math.max(worst, pay);
            }
          }
        }
      }
    }
    expect(worst).toBeLessThanOrEqual(PAY_CAP + 1e-9);
  });
});

describe('the shared pay cap', () => {
  it('shares the cap between pay perks worn together in a town', () => {
    const state = newGame();
    state.wardrobe.owned.push('tuxedo', 'skycap', 'berry');
    state.wardrobe.equipped = { outfit: 'tuxedo', hat: 'skycap', brand: 'berry' };
    // 0.2 + 0.25 + 0.1 = 0.55 at Skyport, scaled to 0.25 together.
    const total = PAY_PERKS.reduce((sum, kind) => sum + perkValue(state, kind, 'skyport'), 0);
    expect(total).toBeCloseTo(PAY_CAP);
    expect(perkValue(state, 'vipPay', 'skyport')).toBeCloseTo((0.2 * PAY_CAP) / 0.55);
    // At the car wash the captain's cap does nothing: 0.2 + 0.1 = 0.3, still over.
    expect(perkValue(state, 'takeoff', 'roadside')).toBe(0);
    expect(perkValue(state, 'vipPay', 'roadside')).toBeCloseTo((0.2 * PAY_CAP) / 0.3);
  });
});
