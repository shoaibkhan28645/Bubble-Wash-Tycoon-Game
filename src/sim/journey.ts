// The whole journey, map after map: the car wash town from $0, its land for
// the farm, Willowbrook, its land for the park, Starlight Fun Park. Each map
// is played by a bot that buys the next pad the moment it can, with what
// really comes with it: the money left after buying the land, and the towns
// already built earning in the background all the while (their staff's
// takings, at their managers' full rate). The landmark's long build is
// waited out away from the game, earning offline (up to the first cap) in
// every town.
//
// The bot buys upgrades too, as a player does: whenever the cheapest one on
// offer costs no more than a quarter of the next pad, it buys it. Each map's
// income model counts what the upgrades do (the car wash's has been checked
// against the game itself, stage by stage, with and without them). Played
// with `upgrades: false`, it's a player who never buys one.
//
// It answers what each map's own model can't: how long each map really
// takes, how much money arrives with you, how much of it the land takes,
// and how the map's own income compares with what the old towns pay in.
// Contracts, ads and tips for perfect launches are left out.
import { TUNING, UPGRADES, type PadDef } from '../core/config';
import type { ParkTown, TownDef } from '../core/towns';
import { upgradeCost, upgradeScale } from '../systems/economy';
import { FARM_PACING, farmIncomePerSecond, farmUpgradeCounts } from './farmPacing';
import { DEFAULT_PACING, incomePerSecond, washUpgradeCounts, type Levels } from './pacing';
import { PARK_PACING, parkIncome, parkStage, parkUpgradeCounts, type ParkStage } from './parkPacing';

/** One map on the way: its pads and goals, and what it earns a second with what's built and the upgrade levels bought. */
export interface JourneyMap {
  name: string;
  town: TownDef;
  /** Everything the map earns a second (one-offs like the golden VIP included, on average). */
  income: (unlocked: ReadonlySet<string>, playSeconds: number, levels: Levels) => number;
  /** What its staff take a second, without the one-offs: what it earns in the background once the hero has moved on. */
  steady: (unlocked: ReadonlySet<string>, levels: Levels) => number;
  /** The upgrades its model counts: the only ones the bot buys (it wouldn't see what the others do). */
  counts: (key: string) => boolean;
}

export interface JourneyOptions {
  /** The bot buys upgrades (a quarter of the next pad's price at most, cheapest first). */
  upgrades: boolean;
}

/** How one map went. */
export interface JourneyLeg {
  name: string;
  /** Minutes of play to buy the land (time away waiting on the landmark not counted). */
  minutes: number;
  awayMinutes: number;
  /** Money brought in, and how many of the map's paid purchases it bought straight away. */
  arrivedWith: number;
  boughtOnArrival: number;
  /** The old towns' income a minute while playing here. */
  background: number;
  /** The map's own income over the old towns', at its first paid purchase and halfway through its pads. */
  ownAtFirst: number;
  ownAtMiddle: number;
  /** The map's own income a minute at the end, and its staff's steady takings (what it pays in once the hero moves on). */
  endIncome: number;
  endSteady: number;
  /** Cash in hand when the land could first be bought (the landmark built), the land's price, and what's left after it. */
  cashAtLand: number;
  land: number;
  left: number;
  /** Spent on upgrades, and the levels bought. */
  upgradeSpend: number;
  upgradeLevels: number;
  /** Minute each pad was bought. */
  boughtAt: Record<string, number>;
  /** The upgrade levels at the end. */
  levels: Record<string, number>;
}

const AWAY_AFTER_SECONDS = 15 * 60;
/** The bot buys an upgrade once it costs no more than this share of the next pad. */
export const UPGRADE_SHARE = 0.25;
/** The staff room's upgrade pad comes with the register, every other pad with its own station. */
const PAD_AFTER: Record<string, string> = { staffRoom: 'register' };

/** The upgrades on offer in a town with what's built: every row of every upgrade pad that's out. */
export function upgradesOnOffer(town: TownDef, unlocked: ReadonlySet<string>): string[] {
  const keys: string[] = [];
  for (const padId of Object.keys(town.layout.upgradePads ?? {})) {
    if (!unlocked.has(PAD_AFTER[padId] ?? padId)) continue;
    for (const key of UPGRADES.panels[padId] ?? []) {
      const target = key.split('.')[0]!;
      if ((target === 'player' || unlocked.has(target)) && !keys.includes(key)) keys.push(key);
    }
  }
  return keys;
}

function maxLevel(key: string): number {
  return UPGRADES.maxLevels?.[key] ?? UPGRADES.kinds[key.split('.')[1]!]?.max ?? 0;
}

/** What the next level of an upgrade costs in a town. */
export function upgradePrice(key: string, level: number, townId: string): number {
  const [target, kind] = key.split('.') as [string, string];
  return upgradeCost(UPGRADES.kinds[kind]!, upgradeScale(target, townId), level, UPGRADES.growth);
}

/** Plays one map: from `startCash`, with the old towns paying `background` a second. */
export function playLeg(map: JourneyMap, startCash: number, background: number, options: JourneyOptions = { upgrades: true }): JourneyLeg {
  const { pads } = map.town;
  const goals = map.town.goals.goals.flatMap((g) => (g.built ? [g.built] : []));
  const unlocked = new Set<string>();
  const finishing = new Map<string, number>();
  const bought = new Map<string, number>();
  const levels: Record<string, number> = {};
  const next = (): PadDef | undefined => pads.find((p) => !unlocked.has(p.id) && !finishing.has(p.id) && !bought.has(p.id));
  let cash = startCash;
  let away = 0;
  let cashAtLand = 0;
  let boughtOnArrival = 0;
  let ownAtFirst = -1;
  let ownAtMiddle = -1;
  let upgradeSpend = 0;
  let upgradeLevels = 0;
  let offer: string[] = [];
  let offerFor = -1;
  /** The cheapest upgrade on offer now, if it's within the bot's budget for the next pad. */
  const buyUpgrades = () => {
    if (!options.upgrades) return;
    if (offerFor !== unlocked.size) {
      offer = upgradesOnOffer(map.town, unlocked).filter(map.counts);
      offerFor = unlocked.size;
    }
    const limit = UPGRADE_SHARE * (next()?.cost ?? 0);
    for (;;) {
      let best = '';
      let price = Infinity;
      for (const key of offer) {
        const level = levels[key] ?? 0;
        if (level >= maxLevel(key)) continue;
        const cost = upgradePrice(key, level, map.town.id);
        if (cost < price) [best, price] = [key, cost];
      }
      if (!best || price > limit || price > cash) return;
      cash -= price;
      levels[best] = (levels[best] ?? 0) + 1;
      upgradeSpend += price;
      upgradeLevels++;
    }
  };
  let t = 0;
  for (; t < 600 * 60; t++) {
    for (const [id, at] of finishing) {
      if (at > t) continue;
      unlocked.add(id);
      finishing.delete(id);
    }
    for (let pad = next(); pad && cash >= pad.cost; pad = next()) {
      if (pad.afterGoals && !goals.every((g) => unlocked.has(g))) break;
      if (pad.afterGoals && cashAtLand === 0) cashAtLand = cash;
      cash -= pad.cost;
      bought.set(pad.id, t);
      if (t === 0 && pad.cost > 0) boughtOnArrival++;
      if (pad.buildSeconds) finishing.set(pad.id, t + pad.buildSeconds);
      else unlocked.add(pad.id);
      if (ownAtFirst < 0 && pad.cost > 0) ownAtFirst = map.income(unlocked, t, levels) / Math.max(1 / 60, background);
    }
    if (bought.size === pads.length) break;
    buyUpgrades();
    const earn = map.income(unlocked, t, levels);
    if (ownAtMiddle < 0 && bought.size >= pads.length / 2) ownAtMiddle = earn / Math.max(1e-9, background);
    // Waiting on the landmark's long build, the land next: away from the game, earning offline everywhere.
    const after = next();
    if (finishing.size > 0 && after?.afterGoals) {
      const wait = Math.max(...finishing.values()) - t;
      if (wait > AWAY_AFTER_SECONDS) {
        const rules = TUNING.offline;
        const rate = unlocked.has('manager') ? rules.managerRate : rules.rate;
        cash += (map.steady(unlocked, levels) * rate + background) * Math.min(wait, (rules.capHours[0] ?? 0) * 3600);
        away += wait;
        for (const [id] of finishing) unlocked.add(id);
        finishing.clear();
        continue;
      }
    }
    if (after?.afterGoals && goals.every((g) => unlocked.has(g)) && cashAtLand === 0) cashAtLand = cash;
    cash += earn + background;
  }
  const land = pads.at(-1)!.cost;
  const boughtAt: Record<string, number> = {};
  for (const [id, at] of bought) boughtAt[id] = Math.round((at / 60) * 10) / 10;
  return {
    name: map.name,
    minutes: Math.round((t / 60) * 10) / 10,
    awayMinutes: Math.round(away / 60),
    arrivedWith: Math.round(startCash),
    boughtOnArrival,
    background: Math.round(background * 60),
    ownAtFirst: Math.round(ownAtFirst * 100) / 100,
    ownAtMiddle: Math.round(ownAtMiddle * 100) / 100,
    endIncome: Math.round(map.income(unlocked, t, levels) * 60),
    endSteady: Math.round(map.steady(unlocked, levels) * 60),
    cashAtLand: Math.round(cashAtLand),
    land,
    left: Math.round(cash),
    upgradeSpend: Math.round(upgradeSpend),
    upgradeLevels,
    boughtAt,
    levels,
  };
}

/** Plays the maps in order, each starting with what the last left and the old towns' income behind it. */
export function playJourney(maps: JourneyMap[], options: JourneyOptions = { upgrades: true }): JourneyLeg[] {
  const legs: JourneyLeg[] = [];
  let cash = 0;
  let background = 0;
  for (const map of maps) {
    const leg = playLeg(map, cash, background, options);
    legs.push(leg);
    cash = leg.left;
    // Every town built so far has its manager by the end: its staff's takings come in at the full rate while the hero is away.
    background += leg.endSteady / 60;
  }
  return legs;
}

/** The three maps as the game has them: the car wash town, Willowbrook, Starlight Fun Park. */
export function gameJourney(roadside: TownDef, willowbrook: TownDef, starlight: ParkTown): JourneyMap[] {
  // The park's crowd is played for a few minutes per stage: worked out once per stage (pads are bought in order).
  const stages = new Map<number, ParkStage>();
  const stage = (u: ReadonlySet<string>) => {
    if (!stages.has(u.size)) stages.set(u.size, parkStage(starlight, u, PARK_PACING));
    return stages.get(u.size)!;
  };
  const wash = (u: ReadonlySet<string>, t: number, levels: Levels) => incomePerSecond(roadside.pads, u, DEFAULT_PACING, t, levels);
  const farm = (u: ReadonlySet<string>, levels: Levels) => farmIncomePerSecond(willowbrook.pads, u, FARM_PACING, levels);
  return [
    // The golden VIPs and the hero's own work are left out of what the car wash pays in the background.
    {
      name: roadside.id,
      town: roadside,
      income: wash,
      steady: (u, levels) => incomePerSecond(roadside.pads, u, { ...DEFAULT_PACING, playerEffort: 0 }, 0, levels),
      counts: washUpgradeCounts,
    },
    { name: willowbrook.id, town: willowbrook, income: (u, _t, levels) => farm(u, levels), steady: farm, counts: farmUpgradeCounts },
    {
      name: starlight.id,
      town: starlight,
      income: (u, _t, levels) => parkIncome(stage(u), levels),
      steady: (u, levels) => parkIncome(stage(u), levels),
      counts: parkUpgradeCounts,
    },
  ];
}
