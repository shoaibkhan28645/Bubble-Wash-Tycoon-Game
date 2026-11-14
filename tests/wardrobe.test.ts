import { describe, expect, it } from 'vitest';
import { SHOP } from '../src/core/config';
import { newGame } from '../src/core/gameState';
import { DECOR_MODELS } from '../src/render/models/decor';
import { HAT_MODELS, hatGeometry } from '../src/render/models/hats';
import { brandColours, buy, collection, decorShown, DEFAULT_OUTFIT, equip, equipped, heroLook, lookWith, owns, shopItem, shopItems, toggleDecor, townDecor, unequip } from '../src/systems/wardrobe';

const PARTICLES = ['sparkle', 'bubble', 'bill', 'water', 'confetti', 'smoke'];
const RARITIES = ['common', 'rare', 'epic', 'legendary'];
const HEX = /^#[0-9a-f]{6}$/;

describe('shop.json', () => {
  const all = [...SHOP.outfits, ...SHOP.hats, ...SHOP.trails, ...SHOP.brands, ...SHOP.decor];

  it('has unique ids, known rarities and whole gem prices', () => {
    expect(new Set(all.map((i) => i.id)).size).toBe(all.length);
    for (const item of all) {
      expect(RARITIES).toContain(item.rarity);
      expect(Number.isInteger(item.gems) && item.gems >= 0).toBe(true);
      expect(item.name.length).toBeGreaterThan(0);
    }
  });

  it('starts the hero in the free navy suit and the business in its own colours; everything else costs gems', () => {
    expect(DEFAULT_OUTFIT).toMatchObject({ id: 'classic', gems: 0, suit: SHOP.hero.suit, tie: SHOP.hero.tie });
    expect(SHOP.brands[0]).toMatchObject({ gems: 0 });
    expect(SHOP.brands[0]).not.toHaveProperty('main');
    expect(all.filter((i) => i.gems === 0)).toEqual([DEFAULT_OUTFIT, SHOP.brands[0]]);
  });

  it('lists each slot cheapest first, and dearer rarities cost more', () => {
    const towns = [...new Set(SHOP.decor.map((d) => d.town))];
    for (const list of [SHOP.outfits, SHOP.hats, SHOP.trails, SHOP.brands, ...towns.map((town) => SHOP.decor.filter((d) => d.town === town))]) {
      for (let i = 1; i < list.length; i++) {
        expect(list[i]!.gems).toBeGreaterThanOrEqual(list[i - 1]!.gems);
        expect(RARITIES.indexOf(list[i]!.rarity)).toBeGreaterThanOrEqual(RARITIES.indexOf(list[i - 1]!.rarity));
      }
    }
  });

  it('paints every brand but the classic in real colours, and has four decorations a town, each with a model', () => {
    for (const b of SHOP.brands.slice(1)) for (const c of [b.main, b.vehicle]) expect(c).toMatch(HEX);
    const towns = ['roadside', 'willowbrook', 'starlight'];
    for (const town of towns) expect(SHOP.decor.filter((d) => d.town === town)).toHaveLength(4);
    expect(SHOP.decor.every((d) => towns.includes(d.town))).toBe(true);
    expect([...DECOR_MODELS].sort()).toEqual(SHOP.decor.map((d) => d.id).sort());
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
    const total = (['outfit', 'hat', 'trail', 'brand', 'decor'] as const).reduce((n, slot) => n + shopItems(slot).filter((i) => i.gems > 0).length, 0);
    expect(collection(state)).toEqual({ owned: 0, total });
    state.gems = 1000;
    buy(state, 'cap');
    buy(state, 'bubbles');
    expect(collection(state)).toEqual({ owned: 2, total });
  });

  it('paints the business in a brand once it is bought and chosen', () => {
    const state = newGame();
    expect(brandColours(state)).toBeNull();
    expect(brandColours(state, 'purple')).toEqual({ main: SHOP.brands.find((b) => b.id === 'purple')!.main, vehicle: SHOP.brands.find((b) => b.id === 'purple')!.vehicle });
    state.gems = 1000;
    expect(buy(state, 'purple')).toBe('bought');
    expect(equipped(state, 'brand')?.id).toBe('purple');
    expect(brandColours(state)?.main).toMatch(HEX);
    expect(equip(state, 'aqua')).toBe(true);
    expect(brandColours(state)).toBeNull();
  });

  it('puts bought decorations up in their own town, and away and back', () => {
    const state = newGame();
    state.gems = 1000;
    expect(townDecor(state, 'roadside')).toEqual([]);
    expect(townDecor(state, 'roadside', 'tubeman').map((d) => d.id)).toEqual(['tubeman']);
    expect(buy(state, 'tubeman')).toBe('bought');
    expect(buy(state, 'scarecrow')).toBe('bought');
    expect(state.wardrobe.equipped).toEqual({});
    expect(townDecor(state, 'roadside').map((d) => d.id)).toEqual(['tubeman']);
    expect(townDecor(state, 'willowbrook').map((d) => d.id)).toEqual(['scarecrow']);
    expect(toggleDecor(state, 'tubeman')).toBe(false);
    expect(decorShown(state, 'tubeman')).toBe(false);
    expect(townDecor(state, 'roadside')).toEqual([]);
    expect(toggleDecor(state, 'tubeman')).toBe(true);
    expect(state.wardrobe.hidden).toEqual([]);
    expect(toggleDecor(state, 'goldcar')).toBe(false);
    expect(toggleDecor(state, 'cap')).toBe(false);
  });
});
