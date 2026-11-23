// What the shop's items do (beyond their looks): each thing the hero wears (outfit, hat, trail), the
// business's brand theme and each decoration carries one small perk (src/data/shop.json `perk`), and a
// whole set worn (and placed) together gives a bonus of its own (`bonus`). Only what's worn works, and a
// decoration only while it's up, in its own town, so players swap items for the town and the job in front
// of them. Perks of a kind add up (never multiply), then stop at that kind's cap; a perk tied to a town
// works only there. The rank perks (the Entrepreneur's faster walk) count towards the same caps.
import { SHOP } from '../core/config';
import type { GameState } from '../core/gameState';
import { perk as rankPerk } from './career';
import { DEFAULT_OUTFIT, decorShown, equipped, itemLevel, SETS, type SetDef, type ShopItem } from './wardrobe';

export type PerkKind =
  // The hero.
  | 'walk' // walk faster (a fraction)
  | 'walkLoaded' // walk faster while carrying something
  | 'handWork' // hand work faster: washing, picking, packing, serving
  | 'carry' // more items carried (a count)
  | 'reach' // pick up cash from further away (metres)
  | 'magnet' // cash piles this close (metres) fly to the hero
  | 'pickupValue' // cash the hero picks up is worth more
  | 'tenthDouble' // one cash pile in so many picked up is doubled (0.1: every 10th)
  | 'tips' // customers the hero serves tip more
  | 'vipChance' // VIP customers come more often
  | 'vipPay' // VIP customers pay more
  | 'rushTime' // rush jobs give more time
  | 'rushPay' // rush jobs pay more
  | 'buildTime' // buildings with a build timer finish sooner
  | 'boost' // speed boosts last longer
  | 'patience' // customers wait longer before giving up
  | 'contracts' // contracts pay more
  | 'monster' // monster trucks pay more
  | 'livestock' // hens and cows produce more
  | 'rideTickets' // rides the hero launches sell more tickets
  | 'perfectLaunch' // perfectly timed launches pay more
  | 'rideFill' // rides the hero stands by fill faster
  | 'litter' // litter is swept up from this far (metres) as the hero walks
  | 'onTime' // on-time flight bonus higher
  | 'takeoff' // perfect take-offs pay more
  // The staff (the brand theme).
  | 'staffWalk'
  | 'breaks' // coffee breaks shorter
  | 'staffCarry'
  | 'staffTips'
  | 'staffWork'
  | 'offline' // earnings while away higher
  // The towns (decorations: each in its own town, while it's up).
  | 'arrivals' // customers come more often
  | 'eveningArrivals' // more visitors in the evening (the park)
  | 'martSpend' // the Mini-Mart takes more
  | 'tipsAll' // every tip bigger
  | 'carOfDay' // the Car of the Day pays more
  | 'grow' // fields regrow faster
  | 'fruit' // apple trees bear more
  | 'buyerOfDay' // the Buyer of the Day pays more
  | 'milk' // cows give more milk
  | 'litterDrop' // visitors drop less litter
  | 'perfectDay' // perfect-day tips bigger
  | 'shopSpend' // passengers spend more at the café and duty-free
  | 'flightSlack' // flights get more time before they're late
  | 'onTimePay' // on-time flights pay more
  // A whole set worn and placed together.
  | 'setPay'; // everything in a town pays more

export interface PerkDef {
  kind: PerkKind;
  value: number;
  /** The only town it works in (a town's id); none: every town. */
  town?: string;
}

/** The most a kind of perk adds up to, whatever is worn (and ranks reached, for walking). */
export const PERK_CAPS: Partial<Record<PerkKind, number>> = {
  walk: 0.25,
  handWork: 0.25,
  carry: 3,
  reach: 2,
  arrivals: 0.15,
  patience: 0.25,
  magnet: 6,
  litter: 4,
};

/** Perks counted in whole items: a level adds one more. */
const COUNTED: PerkKind[] = ['carry', 'staffCarry'];

/** A perk at an item's level: each level past the first adds half of it again (+10%, +15%, +20%), or one more item. */
export function leveled(perk: PerkDef, level: number): PerkDef {
  if (level <= 1) return perk;
  return { ...perk, value: COUNTED.includes(perk.kind) ? perk.value + (level - 1) : perk.value * (1 + 0.5 * (level - 1)) };
}

/**
 * The perks that raise pay, each with the most of a town's income it can touch, rounded up: the cash the hero
 * picks up and a set's bonus are nearly all of it; a tip, a VIP or the Car of the Day a slice. Together they
 * lift a town's income by at most PAY_CAP: worn past it, each gives its share of the cap.
 */
export const PAY_SHARE: Partial<Record<PerkKind, number>> = {
  pickupValue: 1,
  tenthDouble: 1,
  setPay: 1,
  tips: 0.2,
  staffTips: 0.2,
  tipsAll: 0.2,
  vipPay: 0.25,
  monster: 0.2,
  rushPay: 0.3,
  contracts: 0.2,
  rideTickets: 0.6,
  perfectLaunch: 0.2,
  onTime: 0.25,
  takeoff: 0.2,
  martSpend: 0.2,
  carOfDay: 0.1,
  buyerOfDay: 0.15,
  perfectDay: 0.15,
  shopSpend: 0.25,
  onTimePay: 0.8,
};
export const PAY_PERKS = Object.keys(PAY_SHARE) as PerkKind[];
export const PAY_CAP = 0.25;

/** The free brand theme every business starts with. */
const DEFAULT_BRAND = SHOP.brands[0]!;

/** What's working now: the outfit (the navy suit if none chosen), hat, trail and brand theme (the classic if none), and the decorations up. */
export function activeItems(state: GameState): ShopItem[] {
  const outfit = equipped(state, 'outfit') ?? { ...DEFAULT_OUTFIT, slot: 'outfit' as const };
  const brand = equipped(state, 'brand') ?? { ...DEFAULT_BRAND, slot: 'brand' as const };
  const decor = SHOP.decor.filter((d) => decorShown(state, d.id)).map((d) => ({ ...d, slot: 'decor' as const }));
  return [outfit, equipped(state, 'hat'), equipped(state, 'trail'), brand, ...decor].filter((item): item is ShopItem => !!item);
}

/** The sets whose every item is worn (or, for a decoration, up) right now: their bonuses work. */
export function activeSets(state: GameState): SetDef[] {
  const on = new Set(activeItems(state).map((item) => item.id));
  return SETS.filter((set) => set.bonus && set.items.every((id) => on.has(id)));
}

/** Something that gives a perk: an item worn or up, or a whole set. */
export interface PerkSource {
  id: string;
  name: string;
  perk: PerkDef;
  set?: boolean;
}

/** Every perk working, with where it comes from (in any town: `perkWorksIn` says where). */
export function perkSources(state: GameState): PerkSource[] {
  const items = activeItems(state).flatMap((item) => (item.perk ? [{ id: item.id, name: item.name, perk: leveled(item.perk, itemLevel(state, item.id)) }] : []));
  const sets = activeSets(state).map((set) => ({ id: set.id, name: set.name, perk: set.bonus!, set: true }));
  return [...items, ...sets];
}

/** Whether a perk works in this town. */
export function perkWorksIn(perk: PerkDef, town: string): boolean {
  return !perk.town || perk.town === town;
}

/** A kind's total from every source (and ranks, for walking), before any cap. */
function rawPerk(sources: readonly PerkSource[], rankWalk: number, kind: PerkKind, town: string): number {
  let sum = kind === 'walk' ? rankWalk : 0;
  for (const { perk } of sources) if (perk.kind === kind && perkWorksIn(perk, town)) sum += perk.value;
  return sum;
}

/** How much the pay perks would lift a town's income together, each on its share of it (before the cap). */
export function payLift(sources: readonly PerkSource[], town: string): number {
  return PAY_PERKS.reduce((total, k) => total + rawPerk(sources, 0, k, town) * (PAY_SHARE[k] ?? 1), 0);
}

/** Every kind's capped total in a town. */
function perkTable(sources: readonly PerkSource[], rankWalk: number, town: string): Map<PerkKind, number> {
  const table = new Map<PerkKind, number>();
  const kinds = new Set<PerkKind>(['walk', ...sources.map((s) => s.perk.kind)]);
  const lift = payLift(sources, town);
  for (const kind of kinds) {
    const sum = rawPerk(sources, rankWalk, kind, town);
    if (sum <= 0) continue;
    // The pay perks share one cap in a town: worn together past it, each gives its share of the cap.
    if (kind in PAY_SHARE) table.set(kind, lift > PAY_CAP ? (sum * PAY_CAP) / lift : sum);
    else table.set(kind, Math.min(PERK_CAPS[kind] ?? Infinity, sum));
  }
  return table;
}

/** The last table worked out, and what it was worked out for (perks are read every frame). */
let cached: { key: string; table: Map<PerkKind, number> } | null = null;

/** A perk's total for the town being played, from everything worn and up (and ranks), capped. 0: none. */
export function perkValue(state: GameState, kind: PerkKind, town: string): number {
  const { equipped: on, owned, hidden, levels } = state.wardrobe;
  const rankWalk = rankPerk(state, 'walk');
  const key = `${town}|${on.outfit ?? ''}|${on.hat ?? ''}|${on.trail ?? ''}|${on.brand ?? ''}|${owned.length}|${hidden.join(',')}|${Object.entries(levels).join(',')}|${rankWalk}`;
  if (cached?.key !== key) cached = { key, table: perkTable(perkSources(state), rankWalk, town) };
  return cached.table.get(kind) ?? 0;
}

/** Whether the town's pay perks are past their shared cap (each giving only its share of it). */
export function payCapped(state: GameState, town: string): boolean {
  return payLift(perkSources(state), town) > PAY_CAP;
}

/** A multiplier from a perk: 1 + its total (×1.1 for +10%). */
export function perkBoost(state: GameState, kind: PerkKind, town: string): number {
  return 1 + perkValue(state, kind, town);
}

/** Whether something worn has this perk here (the on/off ones: the litter pick-up, the cash magnet's reach). */
export function hasPerk(state: GameState, kind: PerkKind, town: string): boolean {
  return perkValue(state, kind, town) > 0;
}

/** A perk's total in the town being played (`state.currentTown`), for systems that don't know their town. */
export function perkHere(state: GameState, kind: PerkKind): number {
  return perkValue(state, kind, state.currentTown);
}

/** A multiplier from a perk in the town being played: 1 + its total. */
export function boostHere(state: GameState, kind: PerkKind): number {
  return 1 + perkHere(state, kind);
}
