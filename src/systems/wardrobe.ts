// The Mogul's Boutique: looks for the hero, the business's brand colour and decorations for the towns,
// bought with gems. Purely cosmetic: nothing here changes how fast anyone works or what anything pays.
// Prices are fixed and shown up front; there is nothing random.
import { SHOP } from '../core/config';
import type { GameState } from '../core/gameState';
import type { ParticleKind } from '../render/effects/particles';

export type Slot = 'outfit' | 'hat' | 'trail' | 'brand' | 'decor';
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

/**
 * The business's colour (src/render/brand.ts): the staff's polos (`main`) and the farm's vans and tanker
 * (`vehicle`). The free classic theme has neither: everything keeps the colours it was painted in.
 */
export interface BrandDef extends ItemBase {
  main?: string;
  vehicle?: string;
}

/**
 * A decoration on its own spot in one town (built in code, src/render/models/decor.ts): where it stands and
 * which way it faces, how high it floats (a balloon), where a string of bunting runs `to`, and the ground it
 * takes up (half-widths across x and z, before turning), solid to the hero.
 */
export interface DecorDef extends ItemBase {
  icon: string;
  town: string;
  x: number;
  z: number;
  y?: number;
  rot?: number;
  to?: { x: number; z: number };
  solid?: [number, number];
}

export interface ShopData {
  /** The colours the hero's model is painted in (art/blender/kenney_tycoon.py), which outfits replace. */
  hero: { suit: string; tie: string; shirt: string };
  outfits: OutfitDef[];
  hats: HatDef[];
  trails: TrailDef[];
  brands: BrandDef[];
  decor: DecorDef[];
}

export type ShopItem =
  | (OutfitDef & { slot: 'outfit' })
  | (HatDef & { slot: 'hat' })
  | (TrailDef & { slot: 'trail' })
  | (BrandDef & { slot: 'brand' })
  | (DecorDef & { slot: 'decor' });

/** Every item, by id (ids are unique across the slots). */
const ITEMS = new Map<string, ShopItem>([
  ...SHOP.outfits.map((o): [string, ShopItem] => [o.id, { ...o, slot: 'outfit' }]),
  ...SHOP.hats.map((h): [string, ShopItem] => [h.id, { ...h, slot: 'hat' }]),
  ...SHOP.trails.map((t): [string, ShopItem] => [t.id, { ...t, slot: 'trail' }]),
  ...SHOP.brands.map((b): [string, ShopItem] => [b.id, { ...b, slot: 'brand' }]),
  ...SHOP.decor.map((d): [string, ShopItem] => [d.id, { ...d, slot: 'decor' }]),
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

/** Pays the item's gems and puts it on (a decoration goes up in its town). Nothing changes unless it's 'bought'. */
export function buy(state: GameState, id: string): BuyResult {
  const item = ITEMS.get(id);
  if (!item) return 'unknown';
  if (owns(state, id)) return 'owned';
  if (state.gems < item.gems) return 'short';
  state.gems -= item.gems;
  state.wardrobe.owned.push(id);
  equip(state, id);
  return 'bought';
}

/** Puts on an owned item (a decoration: shows it again); false if it isn't owned. */
export function equip(state: GameState, id: string): boolean {
  const item = ITEMS.get(id);
  if (!item || !owns(state, id)) return false;
  if (item.slot === 'decor') state.wardrobe.hidden = state.wardrobe.hidden.filter((h) => h !== id);
  else state.wardrobe.equipped[item.slot] = id;
  return true;
}

/** The business's colours as chosen, or with a theme tried on (null: the classic look, the towns' own colours). */
export function brandColours(state: GameState, tryOn?: string): { main: string; vehicle: string } | null {
  const item = tryOn ? ITEMS.get(tryOn) : equipped(state, 'brand');
  return item?.slot === 'brand' && item.main && item.vehicle ? { main: item.main, vehicle: item.vehicle } : null;
}

/** Whether an owned decoration is up (bought ones are, until put away in the shop). */
export function decorShown(state: GameState, id: string): boolean {
  return owns(state, id) && !state.wardrobe.hidden.includes(id);
}

/** Puts an owned decoration away, or back up; returns whether it's up now. */
export function toggleDecor(state: GameState, id: string): boolean {
  if (!owns(state, id) || ITEMS.get(id)?.slot !== 'decor') return false;
  if (decorShown(state, id)) {
    state.wardrobe.hidden.push(id);
    return false;
  }
  equip(state, id);
  return true;
}

/** A town's decorations that are up (and one being tried on in the shop, bought or not). */
export function townDecor(state: GameState, town: string, tryOn: string | null = null): DecorDef[] {
  return SHOP.decor.filter((d) => d.town === town && (d.id === tryOn || decorShown(state, d.id)));
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
