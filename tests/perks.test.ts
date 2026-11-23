import { describe, expect, it } from 'vitest';
import { SHOP } from '../src/core/config';
import { newGame } from '../src/core/gameState';
import { BEST_NET_WORTH } from '../src/systems/career';
import { PAY_CAP, PAY_PERKS, PAY_SHARE, PERK_CAPS, activeItems, payCapped, perkValue, type PerkKind } from '../src/systems/perks';
import { DEFAULT_OUTFIT, autoLoadout, levelUp, levelUpCost, loadoutWorn, saveLoadout, wearLoadout } from '../src/systems/wardrobe';

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

  it('no loadout, with every decoration up, lifts a town\'s pay past the cap', () => {
    const pick = (list: { id: string }[]) => [undefined, ...list.map((i) => i.id)];
    let worst = 0;
    for (const outfit of SHOP.outfits) {
      for (const hat of pick(SHOP.hats)) {
        for (const trail of pick(SHOP.trails)) {
          for (const brand of SHOP.brands) {
            const state = wearing({ outfit: outfit.id, hat, trail, brand: brand.id });
            state.wardrobe.owned.push(...SHOP.decor.map((d) => d.id));
            for (const town of TOWNS) {
              const lift = PAY_PERKS.reduce((sum, kind: PerkKind) => sum + perkValue(state, kind, town) * (PAY_SHARE[kind] ?? 1), 0);
              worst = Math.max(worst, lift);
            }
          }
        }
      }
    }
    expect(worst).toBeLessThanOrEqual(PAY_CAP + 1e-9);
  });
});

describe('decorations and sets', () => {
  it('gives every decoration a perk for its own town (the monument: every town), and every set a bonus', () => {
    for (const d of SHOP.decor) {
      expect(d.perk, d.id).toBeDefined();
      if (d.perk!.town) expect(d.perk!.town, d.id).toBe(d.town);
    }
    for (const set of SHOP.sets) expect(set.bonus, set.id).toBeDefined();
  });

  it('works only while a decoration is up, in its own town', () => {
    const state = newGame();
    state.wardrobe.owned.push('bunting');
    expect(perkValue(state, 'arrivals', 'roadside')).toBeCloseTo(0.05);
    expect(perkValue(state, 'arrivals', 'willowbrook')).toBe(0);
    state.wardrobe.hidden.push('bunting');
    expect(perkValue(state, 'arrivals', 'roadside')).toBe(0);
  });

  it("gives a set's bonus only while all of it is worn and up", () => {
    const state = wearing({ outfit: 'royal', hat: 'cap', trail: 'bubbles' });
    expect(perkValue(state, 'setPay', 'roadside')).toBe(0);
    state.wardrobe.owned.push('blower');
    expect(perkValue(state, 'setPay', 'roadside')).toBeCloseTo(0.1);
    expect(perkValue(state, 'setPay', 'skyport')).toBe(0);
    state.wardrobe.equipped.hat = 'tophat';
    state.wardrobe.owned.push('tophat');
    expect(perkValue(state, 'setPay', 'roadside')).toBe(0);
  });
});

describe('the shared pay cap', () => {
  it('lets small slices add up in full, and scales them back together past the cap', () => {
    const state = newGame();
    state.wardrobe.owned.push('tuxedo', 'skycap', 'berry');
    state.wardrobe.equipped = { outfit: 'tuxedo', hat: 'skycap', brand: 'berry' };
    // VIPs, perfect take-offs and staff tips are slices of the airport's pay: 0.05 + 0.05 + 0.02 lifted, under the cap.
    expect(perkValue(state, 'vipPay', 'skyport')).toBeCloseTo(0.2);
    expect(perkValue(state, 'takeoff', 'skyport')).toBeCloseTo(0.25);
    // The Golden Mogul and the Golden Laurels lift everything the hero picks up: 0.1 + 0.1, plus the tips 0.02 and the
    // airport's on-time decoration 0.12 = 0.34, past the cap: each scaled back by 0.25 / 0.34.
    state.wardrobe.owned.push('midas', 'laurels', 'goldjet');
    state.wardrobe.equipped = { outfit: 'midas', hat: 'laurels', brand: 'berry' };
    const lift = 0.1 + 0.1 + 0.1 * 0.2 + 0.15 * 0.8;
    expect(perkValue(state, 'pickupValue', 'skyport')).toBeCloseTo((0.1 * PAY_CAP) / lift);
    expect(payCapped(state, 'skyport')).toBe(true);
    expect(payCapped(state, 'roadside')).toBe(false);
  });
});

describe('item levels', () => {
  it('costs half the price, then the whole price, and adds half the perk again each level', () => {
    const state = wearing({ hat: 'cowboy' });
    state.gems = 1000;
    expect(levelUpCost(state, 'cowboy')).toBe(60);
    expect(perkValue(state, 'livestock', 'willowbrook')).toBeCloseTo(0.1);
    expect(levelUp(state, 'cowboy')).toBe(true);
    expect(state.gems).toBe(940);
    expect(perkValue(state, 'livestock', 'willowbrook')).toBeCloseTo(0.15);
    expect(levelUpCost(state, 'cowboy')).toBe(120);
    expect(levelUp(state, 'cowboy')).toBe(true);
    expect(perkValue(state, 'livestock', 'willowbrook')).toBeCloseTo(0.2);
    expect(levelUpCost(state, 'cowboy')).toBeNull();
    expect(levelUp(state, 'cowboy')).toBe(false);
  });

  it('prices free and earned items as 100 gems, and levels nothing not owned', () => {
    const state = newGame();
    expect(levelUpCost(state, 'classic')).toBe(50);
    expect(levelUpCost(state, 'cap')).toBeNull();
    state.gems = 10;
    expect(levelUp(state, 'classic')).toBe(false);
    expect(state.gems).toBe(10);
  });

  it('adds a whole item a level to the carrying perks', () => {
    const state = wearing({ outfit: 'tan' });
    state.wardrobe.levels.tan = 2;
    expect(perkValue(state, 'carry', 'roadside')).toBe(2);
  });

  it('still stops at the caps', () => {
    const state = wearing({ outfit: 'aviator' });
    state.wardrobe.levels.aviator = 3;
    // +2 bags, +4 at level 3: carrying stops at +3.
    expect(perkValue(state, 'carry', 'skyport')).toBe(3);
  });
});

describe('loadouts', () => {
  it('keeps what is worn, puts it back on, and goes on by itself in its town', () => {
    const state = wearing({ outfit: 'country', hat: 'cowboy' });
    saveLoadout(state, 0, 'Farm', 'willowbrook');
    state.wardrobe.owned.push('royal', 'cap');
    state.wardrobe.equipped = { outfit: 'royal', hat: 'cap', trail: 'bubbles' };
    saveLoadout(state, 1, 'Car wash', 'roadside');
    expect(state.wardrobe.loadouts.map((l) => l.name)).toEqual(['Farm', 'Car wash']);
    expect(loadoutWorn(state, 1)).toBe(true);
    expect(autoLoadout(state, 'willowbrook')).toBe(0);
    expect(wearLoadout(state, 0)).toBe(true);
    expect(state.wardrobe.equipped).toEqual({ outfit: 'country', hat: 'cowboy' });
    expect(loadoutWorn(state, 0)).toBe(true);
    state.wardrobe.loadouts[0]!.auto = false;
    expect(autoLoadout(state, 'willowbrook')).toBe(-1);
    // A second one for the farm: numbered, and not going on by itself while the first is set to.
    state.wardrobe.loadouts[0]!.auto = true;
    saveLoadout(state, 2, 'Farm', 'willowbrook');
    expect(state.wardrobe.loadouts[2]).toMatchObject({ name: 'Farm 2', auto: false });
    expect(autoLoadout(state, 'willowbrook')).toBe(0);
    // No more than three: a fourth saves over the last.
    saveLoadout(state, 5, 'Airport', 'skyport');
    expect(state.wardrobe.loadouts.map((l) => l.name)).toEqual(['Farm', 'Car wash', 'Airport']);
    expect(state.wardrobe.loadouts[2]!.auto).toBe(true);
  });
});
