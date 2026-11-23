// The Mogul's Boutique: looks for the hero, the business's brand colour and decorations for the towns,
// bought with gems. What the hero wears and the brand theme each carry one small perk too (src/systems/perks.ts).
// Prices are fixed and shown up front; there is nothing random. Some things can't be bought, only
// earned (finishing a town, a rank, a prize ribbon, a whole set); three things a day are featured, one
// of them cheaper; and a short ad pays a few gems, a few times a day.
import { ADS, RANKS, SHOP } from '../core/config';
import type { GameState } from '../core/gameState';
import type { ParticleKind } from '../render/effects/particles';
import { bestNetWorth } from './career';
import type { PerkDef } from './perks';

export type Slot = 'outfit' | 'hat' | 'trail' | 'brand' | 'decor';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

/**
 * How something that can't be bought is earned: a story flag (a town finished, with the town it's in),
 * a lifetime count reaching `at` (prize ribbons), a rank, or every item of a set.
 */
export interface EarnRule {
  flag?: string;
  town?: string;
  count?: string;
  at?: number;
  rank?: string;
  set?: string;
}

interface ItemBase {
  id: string;
  name: string;
  rarity: Rarity;
  /** Price in gems; 0 is free and always owned (the hero's own navy suit), unless it's earned. */
  gems: number;
  /** Earned, not bought (its gems are 0). */
  earn?: EarnRule;
  /** What it does while worn (src/systems/perks.ts); decorations have none yet. */
  perk?: PerkDef;
}

/** A collection: owning every item in it earns its reward (an item no one can buy) and a title for the rank chip. */
export interface SetDef {
  id: string;
  name: string;
  icon: string;
  title: string;
  items: string[];
  reward: string;
  /** What the set does while all of it is worn (and placed) together (src/systems/perks.ts). */
  bonus?: PerkDef;
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
  sets: SetDef[];
  /** Things featured each day, and how much cheaper one of them is (a fraction). */
  featured: { count: number; discount: number };
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
  return !!item && ((item.gems === 0 && !item.earn) || state.wardrobe.owned.includes(id));
}

/** Something to buy (not a free default, and not earned instead). */
export function forSale(item: ShopItem): boolean {
  return item.gems > 0 && !item.earn;
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

export type BuyResult = 'bought' | 'owned' | 'short' | 'earned' | 'unknown';

/** What an item costs today: its price, or less if it's today's featured deal. */
export function priceOf(state: GameState, id: string, today: string): number {
  const item = ITEMS.get(id);
  if (!item) return 0;
  const { featured } = state.wardrobe;
  if (featured.date !== today || featured.sale !== id) return item.gems;
  return Math.max(1, Math.round(item.gems * (1 - SHOP.featured.discount)));
}

/** Pays the item's gems (today's price) and puts it on (a decoration goes up in its town). Nothing changes unless it's 'bought'. */
export function buy(state: GameState, id: string, today = ''): BuyResult {
  const item = ITEMS.get(id);
  if (!item) return 'unknown';
  if (owns(state, id)) return 'owned';
  if (item.earn) return 'earned';
  const price = priceOf(state, id, today);
  if (state.gems < price) return 'short';
  state.gems -= price;
  give(state, id);
  return 'bought';
}

/** Items go up to this level: each adds half the perk again (src/systems/perks.ts). */
export const MAX_LEVEL = 3;
/** What a free or earned item is priced as, for its levels. */
const LEVEL_BASE_GEMS = 100;

/** An item's level, 1 to 3. */
export function itemLevel(state: GameState, id: string): number {
  return state.wardrobe.levels[id] ?? 1;
}

/** Gems to raise an owned item with a perk one level (half its price, then its whole price), or null if it can't go up. */
export function levelUpCost(state: GameState, id: string): number | null {
  const item = ITEMS.get(id);
  if (!item?.perk || !owns(state, id)) return null;
  const level = itemLevel(state, id);
  if (level >= MAX_LEVEL) return null;
  const base = item.gems > 0 ? item.gems : LEVEL_BASE_GEMS;
  return level === 1 ? Math.round(base / 2) : base;
}

/** Pays for the next level; false (nothing changes) if it's at the top or the gems are short. */
export function levelUp(state: GameState, id: string): boolean {
  const cost = levelUpCost(state, id);
  if (cost === null || state.gems < cost) return false;
  state.gems -= cost;
  state.wardrobe.levels[id] = itemLevel(state, id) + 1;
  return true;
}

/** The slots a loadout keeps (decorations stay up whatever's worn). */
const WORN_SLOTS: Exclude<Slot, 'decor'>[] = ['outfit', 'hat', 'trail', 'brand'];
/** At most this many loadouts are kept. */
export const LOADOUT_SLOTS = 3;

/**
 * Keeps what's worn now as loadout `i` (a new one past the end), named for `town` (numbered if that name's taken) and
 * going on by itself there, unless another loadout already does.
 */
export function saveLoadout(state: GameState, i: number, name: string, town: string): void {
  const items: Record<string, string> = {};
  for (const slot of WORN_SLOTS) {
    const item = equipped(state, slot);
    if (item) items[slot] = item.id;
  }
  const list = state.wardrobe.loadouts;
  const at = Math.min(i, list.length, LOADOUT_SLOTS - 1);
  const others = list.filter((_, j) => j !== at);
  let unique = name;
  for (let n = 2; others.some((l) => l.name === unique); n++) unique = `${name} ${n}`;
  const auto = list[at]?.town === town ? list[at]!.auto : !others.some((l) => l.auto && l.town === town);
  list[at] = { name: unique, items, town, auto };
}

/** Puts on loadout `i` (anything no longer owned stays as it is); false if there's no such loadout. */
export function wearLoadout(state: GameState, i: number): boolean {
  const loadout = state.wardrobe.loadouts[i];
  if (!loadout) return false;
  for (const slot of WORN_SLOTS) {
    const id = loadout.items[slot];
    if (id && owns(state, id)) state.wardrobe.equipped[slot] = id;
    else if (!id) delete state.wardrobe.equipped[slot];
  }
  return true;
}

/** Whether loadout `i` is what's worn now. */
export function loadoutWorn(state: GameState, i: number): boolean {
  const loadout = state.wardrobe.loadouts[i];
  return !!loadout && WORN_SLOTS.every((slot) => (loadout.items[slot] ?? null) === (equipped(state, slot)?.id ?? null));
}

/** The loadout set to go on in a town (its index), or -1. */
export function autoLoadout(state: GameState, town: string): number {
  return state.wardrobe.loadouts.findIndex((l) => l.auto && l.town === town);
}

/** The free starter items a new player picks one of (each with a simple perk), at their first goal reward. */
export const STARTER_PICKS = ['cap', 'tan', 'charcoal'];
/** The flag that records the starter item was picked. */
export const STARTER_FLAG = 'starterPick';

/** Whether to offer the starter pick: not picked yet, and none of its items owned already. */
export function starterDue(state: GameState): boolean {
  return !state.flags.includes(STARTER_FLAG) && !STARTER_PICKS.some((id) => state.wardrobe.owned.includes(id));
}

/** Hands over the picked starter item, free, and puts it on. */
export function pickStarter(state: GameState, id: string): boolean {
  if (!STARTER_PICKS.includes(id) || !starterDue(state)) return false;
  state.flags.push(STARTER_FLAG);
  give(state, id);
  return true;
}

/** Adds an item to the wardrobe and puts it on (just bought). */
function give(state: GameState, id: string): void {
  if (!state.wardrobe.owned.includes(id)) state.wardrobe.owned.push(id);
  equip(state, id);
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

/** The collection book: items owned so far (bought or earned) out of all there are to have. */
export function collection(state: GameState): { owned: number; total: number } {
  const all = [...ITEMS.values()].filter((item) => item.gems > 0 || item.earn);
  return { owned: all.filter((item) => state.wardrobe.owned.includes(item.id)).length, total: all.length };
}

/** A small stable hash (a date always picks the same featured things). */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Picks today's featured things, once a day: a few not owned yet (shuffled by the date, so the same all
 * day), and the dearest of them is today's deal. Buying one doesn't change the picks.
 */
export function rollFeatured(state: GameState, today: string): void {
  if (state.wardrobe.featured.date === today) return;
  const pool = [...ITEMS.values()].filter((item) => forSale(item) && !owns(state, item.id));
  const picks = pool
    .map((item) => ({ item, key: hash(`${today}:${item.id}`) }))
    .sort((a, b) => a.key - b.key)
    .slice(0, SHOP.featured.count)
    .map((p) => p.item);
  const deal = picks.reduce<ShopItem | null>((best, item) => (!best || item.gems > best.gems ? item : best), null);
  state.wardrobe.featured = { date: today, ids: picks.map((item) => item.id), sale: deal?.id ?? '' };
}

/** Today's featured things (empty until rolled for today). */
export function featuredToday(state: GameState, today: string): ShopItem[] {
  const { featured } = state.wardrobe;
  if (featured.date !== today) return [];
  return featured.ids.map((id) => ITEMS.get(id)).filter((item): item is ShopItem => !!item);
}

/** A featured thing not owned yet that the gems would pay for today (the gem counter's dot). */
export function featuredAffordable(state: GameState, today: string): boolean {
  return featuredToday(state, today).some((item) => !owns(state, item.id) && priceOf(state, item.id, today) <= state.gems);
}

export const SETS = SHOP.sets;

/** How much of a set is owned, and whether all of it is. */
export function setProgress(state: GameState, set: SetDef): { owned: number; total: number; done: boolean } {
  const owned = set.items.filter((id) => owns(state, id)).length;
  return { owned, total: set.items.length, done: owned === set.items.length };
}

/** Whether an earned item's rule is met (whether or not it's been handed over yet). */
export function earnMet(state: GameState, rule: EarnRule): boolean {
  if (rule.flag) return state.flags.includes(rule.flag);
  if (rule.count) return (state.counts[rule.count] ?? 0) >= (rule.at ?? 1);
  if (rule.rank) {
    const rank = RANKS.find((r) => r.id === rule.rank);
    return !!rank && bestNetWorth(state) >= rank.netWorth;
  }
  if (rule.set) {
    const set = SETS.find((s) => s.id === rule.set);
    return !!set && setProgress(state, set).done;
  }
  return false;
}

/**
 * Hands over everything newly earned (a set's reward also brings its title, worn straight away if there
 * isn't one yet). Returns what was earned, and the sets just completed.
 */
export function collectEarned(state: GameState): { items: ShopItem[]; sets: SetDef[] } {
  const items: ShopItem[] = [];
  const sets: SetDef[] = [];
  // Twice: a set's reward is earned once its last item is, which may itself have just been earned.
  for (let pass = 0; pass < 2; pass++) {
    for (const item of ITEMS.values()) {
      if (!item.earn || owns(state, item.id) || !earnMet(state, item.earn)) continue;
      state.wardrobe.owned.push(item.id);
      // A decoration goes up; anything worn waits to be put on in the shop.
      if (item.slot === 'decor') equip(state, item.id);
      items.push(item);
      const set = item.earn.set ? SETS.find((s) => s.id === item.earn!.set) : undefined;
      if (set) {
        sets.push(set);
        if (!state.wardrobe.title) state.wardrobe.title = set.id;
      }
    }
  }
  return { items, sets };
}

/** The titles earned so far (each finished set's). */
export function titles(state: GameState): SetDef[] {
  return SETS.filter((set) => owns(state, set.reward));
}

/** The title shown on the rank chip, if one is chosen (and earned). */
export function shownTitle(state: GameState): string | null {
  const set = titles(state).find((s) => s.id === state.wardrobe.title);
  return set?.title ?? null;
}

/** Wears an earned title (by its set's id), or none (''). */
export function chooseTitle(state: GameState, setId: string): boolean {
  if (setId && !titles(state).some((s) => s.id === setId)) return false;
  state.wardrobe.title = setId;
  return true;
}

/** Rewarded ads for gems still allowed today. */
export function adGemsLeft(state: GameState, today: string): number {
  const used = state.wardrobe.ad.date === today ? state.wardrobe.ad.count : 0;
  return Math.max(0, ADS.gemAd.perDay - used);
}

/** An ad was watched for gems: pays them (none once today's are used up). */
export function claimAdGems(state: GameState, today: string): number {
  if (adGemsLeft(state, today) <= 0) return 0;
  const ad = state.wardrobe.ad;
  state.wardrobe.ad = { date: today, count: (ad.date === today ? ad.count : 0) + 1 };
  state.gems += ADS.gemAd.gems;
  return ADS.gemAd.gems;
}

/** Next week's gift (the calendar's 7th day): the cheapest thing not owned yet, in shop order; null when everything's owned. */
export function nextGift(state: GameState): ShopItem | null {
  return [...ITEMS.values()].filter((item) => forSale(item) && !owns(state, item.id)).reduce<ShopItem | null>((best, item) => (!best || item.gems < best.gems ? item : best), null);
}

/** Hands over the weekly gift (a decoration goes up; anything worn waits to be put on); returns it, or null if there's nothing left to give. */
export function claimGift(state: GameState): ShopItem | null {
  const gift = nextGift(state);
  if (!gift) return null;
  state.wardrobe.owned.push(gift.id);
  if (gift.slot === 'decor') equip(state, gift.id);
  return gift;
}
