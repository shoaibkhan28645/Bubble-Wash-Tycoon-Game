// The Mogul's Boutique: looks for the hero, bought with gems. Purely cosmetic: nothing here changes how
// fast anyone works or what anything pays. Prices are fixed and shown up front; there is nothing random.
import { SHOP } from '../core/config';
import type { GameState } from '../core/gameState';
import type { ParticleKind } from '../render/effects/particles';

export type Slot = 'outfit' | 'hat' | 'trail';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

interface ItemBase {
  id: string;
  name: string;
  rarity: Rarity;
  /** Price in gems; 0 is free and always owned (the hero's own navy suit). */
  gems: number;
}

/** A suit in new colours: the jacket and trousers, the tie and (when given) the shirt. */
export interface OutfitDef extends ItemBase {
  suit: string;
  tie: string;
  shirt?: string;
}

/** Something worn on the head, built in code (src/render/models/hats.ts). */
export interface HatDef extends ItemBase {
  icon: string;
}

/** Particles left behind as the hero walks: a puff of `count` every `every` metres, flung out at `speed`. */
export interface TrailDef extends ItemBase {
  icon: string;
  particle: ParticleKind;
  every: number;
  count: number;
  speed: number;
}

export interface ShopData {
  /** The colours the hero's model is painted in (art/blender/kenney_tycoon.py), which outfits replace. */
  hero: { suit: string; tie: string; shirt: string };
  outfits: OutfitDef[];
  hats: HatDef[];
  trails: TrailDef[];
}

export type ShopItem = (OutfitDef & { slot: 'outfit' }) | (HatDef & { slot: 'hat' }) | (TrailDef & { slot: 'trail' });

/** Every item, by id (ids are unique across the slots). */
const ITEMS = new Map<string, ShopItem>([
  ...SHOP.outfits.map((o): [string, ShopItem] => [o.id, { ...o, slot: 'outfit' }]),
  ...SHOP.hats.map((h): [string, ShopItem] => [h.id, { ...h, slot: 'hat' }]),
  ...SHOP.trails.map((t): [string, ShopItem] => [t.id, { ...t, slot: 'trail' }]),
]);

/** The outfit the hero starts in. */
export const DEFAULT_OUTFIT = SHOP.outfits[0]!;

export function shopItem(id: string): ShopItem | undefined {
  return ITEMS.get(id);
}

/** What's on sale in a slot, in shop order (cheapest first). */
export function shopItems(slot: Slot): ShopItem[] {
  return [...ITEMS.values()].filter((item) => item.slot === slot);
}

/** What the hero has on: an outfit always; a hat and a trail only if chosen. */
export interface Look {
  outfit: OutfitDef;
  hat: HatDef | null;
  trail: TrailDef | null;
}

export function owns(state: GameState, id: string): boolean {
  const item = ITEMS.get(id);
  return !!item && (item.gems === 0 || state.wardrobe.owned.includes(id));
}

/** Worn now: an item that's owned and still on sale (anything else saved there is ignored). */
export function equipped(state: GameState, slot: Slot): ShopItem | null {
  const id = state.wardrobe.equipped[slot];
  const item = id ? ITEMS.get(id) : undefined;
  return item && item.slot === slot && owns(state, item.id) ? item : null;
}

/** The hero's look as saved. */
export function heroLook(state: GameState): Look {
  return lookWith(state, null);
}

/**
 * The hero's look with one item tried on over it (the shop's preview), owned or not; trying on
 * the slot's "nothing" (a hat or trail slot with null id) takes that item off.
 */
export function lookWith(state: GameState, tryOn: { slot: Slot; id: string | null } | null): Look {
  const pick = (slot: Slot): ShopItem | null => {
    if (tryOn?.slot === slot) return tryOn.id ? (ITEMS.get(tryOn.id) ?? null) : null;
    return equipped(state, slot);
  };
  const outfit = pick('outfit');
  const hat = pick('hat');
  const trail = pick('trail');
  return {
    outfit: outfit?.slot === 'outfit' ? outfit : DEFAULT_OUTFIT,
    hat: hat?.slot === 'hat' ? hat : null,
    trail: trail?.slot === 'trail' ? trail : null,
  };
}

export type BuyResult = 'bought' | 'owned' | 'short' | 'unknown';

/** Pays the item's gems and puts it on. Nothing changes unless it's 'bought'. */
export function buy(state: GameState, id: string): BuyResult {
  const item = ITEMS.get(id);
  if (!item) return 'unknown';
  if (owns(state, id)) return 'owned';
  if (state.gems < item.gems) return 'short';
  state.gems -= item.gems;
  state.wardrobe.owned.push(id);
  state.wardrobe.equipped[item.slot] = id;
  return 'bought';
}

/** Puts on an owned item; false if it isn't owned. */
export function equip(state: GameState, id: string): boolean {
  const item = ITEMS.get(id);
  if (!item || !owns(state, id)) return false;
  state.wardrobe.equipped[item.slot] = id;
  return true;
}

/** Takes off the hat or the trail (the hero always wears an outfit). */
export function unequip(state: GameState, slot: Exclude<Slot, 'outfit'>): void {
  delete state.wardrobe.equipped[slot];
}

/** Items bought so far, and how many there are to buy. */
export function collection(state: GameState): { owned: number; total: number } {
  const forSale = [...ITEMS.values()].filter((item) => item.gems > 0);
  return { owned: forSale.filter((item) => state.wardrobe.owned.includes(item.id)).length, total: forSale.length };
}
