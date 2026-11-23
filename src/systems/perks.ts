// What the shop's items do (beyond their looks): each thing the hero wears (outfit, hat, trail) and the
// business's brand theme carries one small perk (src/data/shop.json `perk`). Only what's worn works, so
// players swap items for the town and the job in front of them. Perks of a kind add up (never multiply),
// then stop at that kind's cap; a perk tied to a town works only there. The rank perks (the Entrepreneur's
// faster walk) count towards the same caps.
import { SHOP } from '../core/config';
import type { GameState } from '../core/gameState';
import { perk as rankPerk } from './career';
import { DEFAULT_OUTFIT, equipped, type ShopItem } from './wardrobe';

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
  | 'offline'; // earnings while away higher

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
};

/** The perk kinds that raise pay, and the most they add up to together in one town. */
export const PAY_PERKS: PerkKind[] = ['pickupValue', 'tenthDouble', 'tips', 'vipPay', 'rushPay', 'contracts', 'monster', 'rideTickets', 'perfectLaunch', 'onTime', 'takeoff', 'staffTips'];
export const PAY_CAP = 0.25;

/** The free brand theme every business starts with. */
const DEFAULT_BRAND = SHOP.brands[0]!;

/** What's working now: the outfit (the navy suit if none chosen), hat, trail and brand theme (the classic if none). */
export function activeItems(state: GameState): ShopItem[] {
  const outfit = equipped(state, 'outfit') ?? { ...DEFAULT_OUTFIT, slot: 'outfit' as const };
  const brand = equipped(state, 'brand') ?? { ...DEFAULT_BRAND, slot: 'brand' as const };
  return [outfit, equipped(state, 'hat'), equipped(state, 'trail'), brand].filter((item): item is ShopItem => !!item);
}

/** Whether a perk works in this town. */
export function perkWorksIn(perk: PerkDef, town: string): boolean {
  return !perk.town || perk.town === town;
}

/** A kind's total from everything worn (and ranks, for walking), before any cap. */
function rawPerk(items: ShopItem[], rankWalk: number, kind: PerkKind, town: string): number {
  let sum = kind === 'walk' ? rankWalk : 0;
  for (const item of items) {
    const perk = item.perk;
    if (perk && perk.kind === kind && perkWorksIn(perk, town)) sum += perk.value;
  }
  return sum;
}

/** Every kind's capped total in a town, for what's worn. */
function perkTable(items: ShopItem[], rankWalk: number, town: string): Map<PerkKind, number> {
  const table = new Map<PerkKind, number>();
  const kinds = new Set<PerkKind>(['walk', ...items.flatMap((item) => (item.perk ? [item.perk.kind] : []))]);
  const pay = PAY_PERKS.reduce((total, k) => total + rawPerk(items, rankWalk, k, town), 0);
  for (const kind of kinds) {
    const sum = rawPerk(items, rankWalk, kind, town);
    if (sum <= 0) continue;
    // The pay perks share one cap in a town: worn together past it, each gives its share of the cap.
    if (PAY_PERKS.includes(kind)) table.set(kind, pay > PAY_CAP ? (sum * PAY_CAP) / pay : sum);
    else table.set(kind, Math.min(PERK_CAPS[kind] ?? Infinity, sum));
  }
  return table;
}

/** The last table worked out, and what it was worked out for (perks are read every frame). */
let cached: { key: string; table: Map<PerkKind, number> } | null = null;

/** A perk's total for the town being played, from everything worn (and ranks), capped. 0: none. */
export function perkValue(state: GameState, kind: PerkKind, town: string): number {
  const { equipped: on, owned } = state.wardrobe;
  const rankWalk = rankPerk(state, 'walk');
  const key = `${town}|${on.outfit ?? ''}|${on.hat ?? ''}|${on.trail ?? ''}|${on.brand ?? ''}|${owned.length}|${rankWalk}`;
  if (cached?.key !== key) cached = { key, table: perkTable(activeItems(state), rankWalk, town) };
  return cached.table.get(kind) ?? 0;
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
