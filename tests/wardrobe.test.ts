import { describe, expect, it } from 'vitest';
import { SHOP } from '../src/core/config';
import { newGame } from '../src/core/gameState';
import { HAT_MODELS, hatGeometry } from '../src/render/models/hats';
import { buy, collection, DEFAULT_OUTFIT, equip, equipped, heroLook, lookWith, owns, shopItem, shopItems, unequip } from '../src/systems/wardrobe';

const PARTICLES = ['sparkle', 'bubble', 'bill', 'water', 'confetti', 'smoke'];
const RARITIES = ['common', 'rare', 'epic', 'legendary'];
const HEX = /^#[0-9a-f]{6}$/;

describe('shop.json', () => {
  const all = [...SHOP.outfits, ...SHOP.hats, ...SHOP.trails];

  it('has unique ids, known rarities and whole gem prices', () => {
    expect(new Set(all.map((i) => i.id)).size).toBe(all.length);
    for (const item of all) {
      expect(RARITIES).toContain(item.rarity);
      expect(Number.isInteger(item.gems) && item.gems >= 0).toBe(true);
      expect(item.name.length).toBeGreaterThan(0);
    }
  });

  it('starts the hero in the free navy suit, and everything else costs gems', () => {
    expect(DEFAULT_OUTFIT).toMatchObject({ id: 'classic', gems: 0, suit: SHOP.hero.suit, tie: SHOP.hero.tie });
    expect(all.filter((i) => i.gems === 0)).toEqual([DEFAULT_OUTFIT]);
  });

  it('lists each slot cheapest first, and dearer rarities cost more', () => {
    for (const list of [SHOP.outfits, SHOP.hats, SHOP.trails]) {
      for (let i = 1; i < list.length; i++) {
        expect(list[i]!.gems).toBeGreaterThanOrEqual(list[i - 1]!.gems);
        expect(RARITIES.indexOf(list[i]!.rarity)).toBeGreaterThanOrEqual(RARITIES.indexOf(list[i - 1]!.rarity));
      }
    }
  });

  it('has a model for every hat on sale', () => {
    expect([...HAT_MODELS].sort()).toEqual(SHOP.hats.map((h) => h.id).sort());
    for (const hat of SHOP.hats) expect(hatGeometry(hat.id)?.getAttribute('color')).toBeTruthy();
  });

  it('paints outfits in real colours and leaves trails of real particles', () => {
    for (const o of SHOP.outfits) for (const c of [o.suit, o.tie, o.shirt ?? '#ffffff']) expect(c).toMatch(HEX);
    for (const t of SHOP.trails) {
      expect(PARTICLES).toContain(t.particle);
      expect(t.every).toBeGreaterThan(0.2);
      expect(t.count).toBeGreaterThan(0);
      expect(t.count).toBeLessThanOrEqual(3);
    }
  });
});

describe('wardrobe', () => {
  it('owns only the free outfit at the start, and wears it', () => {
    const state = newGame();
    expect(owns(state, 'classic')).toBe(true);
    expect(owns(state, 'cap')).toBe(false);
    expect(heroLook(state)).toEqual({ outfit: DEFAULT_OUTFIT, hat: null, trail: null });
  });

  it('buys with gems and puts the item on', () => {
    const state = newGame();
    state.gems = 100;
    expect(buy(state, 'cap')).toBe('bought');
    expect(state.gems).toBe(100 - shopItem('cap')!.gems);
    expect(owns(state, 'cap')).toBe(true);
    expect(equipped(state, 'hat')?.id).toBe('cap');
    expect(heroLook(state).hat?.id).toBe('cap');
  });

  it("won't buy twice, without enough gems, or what isn't sold", () => {
    const state = newGame();
    state.gems = 45;
    expect(buy(state, 'cap')).toBe('bought');
    const left = state.gems;
    expect(buy(state, 'cap')).toBe('owned');
    expect(buy(state, 'crown')).toBe('short');
    expect(buy(state, 'jetpack')).toBe('unknown');
    expect(buy(state, 'classic')).toBe('owned');
    expect(state.gems).toBe(left);
    expect(state.wardrobe.owned).toEqual(['cap']);
  });

  it('equips only what is owned, and takes a hat or trail off', () => {
    const state = newGame();
    expect(equip(state, 'crown')).toBe(false);
    state.gems = 1000;
    buy(state, 'crown');
    buy(state, 'tophat');
    expect(equipped(state, 'hat')?.id).toBe('tophat');
    expect(equip(state, 'crown')).toBe(true);
    expect(equipped(state, 'hat')?.id).toBe('crown');
    unequip(state, 'hat');
    expect(equipped(state, 'hat')).toBeNull();
    expect(equip(state, 'classic')).toBe(true);
    expect(heroLook(state).outfit.id).toBe('classic');
  });

  it('ignores a worn item that is not owned or no longer sold', () => {
    const state = newGame();
    state.wardrobe.equipped = { outfit: 'midas', hat: 'jetpack', trail: 'cap' };
    expect(heroLook(state)).toEqual({ outfit: DEFAULT_OUTFIT, hat: null, trail: null });
  });

  it('tries an item on over the look without buying it', () => {
    const state = newGame();
    state.gems = 100;
    buy(state, 'cap');
    expect(lookWith(state, { slot: 'outfit', id: 'midas' })).toMatchObject({ outfit: { id: 'midas' }, hat: { id: 'cap' } });
    expect(lookWith(state, { slot: 'hat', id: null }).hat).toBeNull();
    expect(state.wardrobe.owned).toEqual(['cap']);
    expect(equipped(state, 'outfit')).toBeNull();
  });

  it('counts the collection', () => {
    const state = newGame();
    const total = shopItems('outfit').length + shopItems('hat').length + shopItems('trail').length - 1;
    expect(collection(state)).toEqual({ owned: 0, total });
    state.gems = 1000;
    buy(state, 'cap');
    buy(state, 'bubbles');
    expect(collection(state)).toEqual({ owned: 2, total });
  });
});
