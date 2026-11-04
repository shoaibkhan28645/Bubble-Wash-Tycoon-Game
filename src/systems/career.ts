// The hero's career: net worth (cash in hand plus everything put into the
// businesses, in every town) and the ranks it earns. A rank never goes back:
// it follows the best net worth reached, which is also the score sent to
// YouTube. Ranks are in src/data/ranks.json; strategy doc, section 7.
import { RANKS, UPGRADES, type RankDef } from '../core/config';
import type { GameState, TownState } from '../core/gameState';
import type { TownDef } from '../core/towns';
import { upgradeCost } from './economy';

/** The lifetime count (state.counts) that keeps the best net worth reached. */
export const BEST_NET_WORTH = 'bestNetWorth';

/** What a town is worth: its pads (built, being built, part-paid), every upgrade level bought and the cash lying in its piles. */
export function townValue(def: TownDef, town: TownState): number {
  let value = 0;
  for (const pile of Object.values(town.piles)) value += pile;
  for (const pad of def.pads) if (town.unlocked.includes(pad.id) || town.building[pad.id]) value += pad.cost;
  for (const paid of Object.values(town.padPaid)) value += paid;
  for (const [key, level] of Object.entries(town.levels)) {
    const [target, kind] = key.split('.') as [string, string];
    const upgrade = UPGRADES.kinds[kind];
    if (!upgrade) continue;
    for (let l = 0; l < level; l++) value += upgradeCost(upgrade, UPGRADES.costScale[target] ?? 1, l, UPGRADES.growth);
  }
  return value;
}

/**
 * Cash plus every town's value. `townDef` gives a town's data by id; a town
 * whose data isn't loaded yet (none today) counts as nothing until it is.
 */
export function netWorth(state: GameState, current: TownDef, townDef: (id: string) => TownDef | undefined): number {
  let worth = state.cash + townValue(current, state);
  for (const [id, town] of Object.entries(state.towns)) {
    const def = townDef(id);
    if (def) worth += townValue(def, town);
  }
  return Math.floor(worth);
}

/** The best net worth ever reached (what the rank and the score follow). */
export function bestNetWorth(state: GameState): number {
  return state.counts[BEST_NET_WORTH] ?? 0;
}

/** Records a new net worth; returns true if it's a new best. */
export function recordNetWorth(state: GameState, worth: number): boolean {
  const best = Math.min(Number.MAX_SAFE_INTEGER, Math.floor(worth));
  if (best <= bestNetWorth(state)) return false;
  state.counts[BEST_NET_WORTH] = best;
  return true;
}

/** The rank a net worth earns (the last one whose threshold it reaches). */
export function rankFor(worth: number): RankDef {
  let rank = RANKS[0]!;
  for (const r of RANKS) if (worth >= r.netWorth) rank = r;
  return rank;
}

/** The hero's rank now. */
export function currentRank(state: GameState): RankDef {
  return rankFor(bestNetWorth(state));
}

/** The next rank up and how far along the way to it (0..1), or null at the top. */
export function nextRank(state: GameState): { rank: RankDef; progress: number } | null {
  const now = currentRank(state);
  const next = RANKS[RANKS.indexOf(now) + 1];
  if (!next) return null;
  const span = next.netWorth - now.netWorth;
  return { rank: next, progress: Math.min(1, Math.max(0, (bestNetWorth(state) - now.netWorth) / span)) };
}

/** The flag that records a rank-up was celebrated. */
export function rankFlag(rank: RankDef): string {
  return `rank:${rank.id}`;
}

/** Ranks reached but not yet celebrated, lowest first (each gets its own newspaper card). */
export function uncelebratedRanks(state: GameState): RankDef[] {
  const best = bestNetWorth(state);
  return RANKS.filter((r) => r.netWorth > 0 && best >= r.netWorth && !state.flags.includes(rankFlag(r)));
}

/** A perk added up over every rank reached (walk speed, contract slots…). */
export function perk(state: GameState, name: keyof RankDef['perks']): number {
  const best = bestNetWorth(state);
  return RANKS.filter((r) => best >= r.netWorth).reduce((sum, r) => sum + (r.perks[name] ?? 0), 0);
}
