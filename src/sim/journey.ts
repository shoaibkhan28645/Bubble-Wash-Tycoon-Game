// The whole journey, map after map: the car wash town from $0, its land for
// the farm, Willowbrook, its land for the park, Starlight Fun Park. Each map
// is played by a bot that plays as a keen player does (and as the
// playthrough bot that drives the real game did, whose timings this was
// checked against): it buys the next pad the moment it can, with what really
// comes with it: the money left after buying the land, and the towns already
// built earning in the background all the while (what each stored as its
// staff's takings, at its manager's full rate). A town's goals count once
// their buildings are paid for, so the landmark builds in its 20 minutes while
// the bot saves for the land (a build longer than half an hour would be
// waited out away from the game, earning offline).
//
// It does the rush jobs as they come (from the end of the town's tutorial,
// as the game deals them out, paying what the game pays), and it buys
// upgrades: the cheapest on offer, if it costs no more than a quarter of the
// next pad, keeping what it spends on them to a fifth of what it's earned
// (a new player on the first map follows the tutorial pad to pad first). It
// buys every kind; each map's income model counts what the ones it knows do.
// Played with `jobs: false` or `upgrades: false`, it's a player who never
// does a job or never buys an upgrade.
//
// It answers what each map's own model can't: how long each map really
// takes, how much money arrives with you, how much of it the land takes,
// and how the map's own income compares with what the old towns pay in.
// Contracts, ads and tips for perfect launches are left out.
import { CONTRACTS, JOBS, TUNING, UPGRADES, type PadDef } from '../core/config';
import type { ParkTown, TownDef } from '../core/towns';
import { upgradeCost, upgradeScale } from '../systems/economy';
import { basePay, secondsToNext, streakMultiplier } from '../systems/jobs';
import { FARM_PACING, farmIncomePerSecond } from './farmPacing';
import { DEFAULT_PACING, incomePerSecond, type Levels } from './pacing';
import { PARK_PACING, parkIncome, parkStage, type ParkStage } from './parkPacing';

/** One map on the way: its pads and goals, and what it earns a second with what's built and the upgrade levels bought. */
export interface JourneyMap {
  name: string;
  town: TownDef;
  /** Everything the map earns a second (one-offs like the golden VIP included, on average). */
  income: (unlocked: ReadonlySet<string>, playSeconds: number, levels: Levels) => number;
  /** What its staff take a second, without the one-offs: what it earns in the background once the hero has moved on. */
  steady: (unlocked: ReadonlySet<string>, levels: Levels) => number;
  /** The pad that ends the town's tutorial (its first helper at the counter): rush jobs come only after it. */
  tutorial: string;
  /** Upgrades bought during the tutorial too (not on the first map: a player new to the game follows it pad to pad). */
  upgradesInTutorial: boolean;
  /** The share of what's earned in the town that goes on upgrades, at most (the playthrough bot's: more where the helpers leave the hero free). */
  upgradeSpend: number;
  /** The pad that puts up the contracts board, if the town has one. */
  contracts?: string;
}

export interface JourneyOptions {
  /** The bot buys upgrades (a quarter of the next pad's price at most, cheapest first). */
  upgrades: boolean;
  /** The bot does the rush jobs as they come (all of them, as a keen player does). */
  jobs: boolean;
}

export const ACTIVE: JourneyOptions = { upgrades: true, jobs: true };

/** Seconds a rush job takes the hero, on average (the playthrough bot's: jobs every minute or so with 35 s between). */
export const JOB_SECONDS = 30;
/** Once the contracts board is up, one's finished and claimed every so often (the playthrough bot's: seven in 21 minutes). */
export const CONTRACT_SECONDS = 180;

/** What a contract pays on average with what's built: any of those the lot can take, the gem ones paying no cash. */
export function contractPay(unlocked: ReadonlySet<string>): number {
  const kinds = CONTRACTS.kinds.filter((def) => !def.requires || unlocked.has(def.requires));
  const built = Math.max(0, unlocked.size - 1);
  return kinds.reduce((sum, def) => sum + (def.cash ? def.goal * def.cash * CONTRACTS.cashGrowth ** built : 0), 0) / Math.max(1, kinds.length);
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
  /** Rush jobs done, and what they paid; what contracts paid. */
  jobs: number;
  jobPay: number;
  contractPay: number;
  /** Minute each pad was bought. */
  boughtAt: Record<string, number>;
  /** The upgrade levels at the end. */
  levels: Record<string, number>;
}

const AWAY_AFTER_SECONDS = 30 * 60;
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
export function playLeg(map: JourneyMap, startCash: number, background: number, options: JourneyOptions = ACTIVE): JourneyLeg {
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
  // Rush jobs, as the game deals them out (src/systems/jobs.ts): a gap, then a job (unless the next purchase is
  // nearly affordable), done in JOB_SECONDS, paying for the streak kept up, every few a golden one.
  const T = JOBS.tuning;
  let jobs = 0;
  let jobPaid = 0;
  let since = 0;
  let job: { left: number; pay: number } | null = null;
  let contractIn = 0;
  let contractPaid = 0;
  /** The cheapest upgrade on offer now, if it's within the bot's budget for the next pad. */
  let earned = 0;
  const buyUpgrades = () => {
    if (!options.upgrades || (!map.upgradesInTutorial && !unlocked.has(map.tutorial))) return;
    if (offerFor !== unlocked.size) {
      offer = upgradesOnOffer(map.town, unlocked);
      offerFor = unlocked.size;
    }
    const limit = UPGRADE_SHARE * (next()?.cost ?? 0);
    let best = '';
    let price = Infinity;
    for (const key of offer) {
      const level = levels[key] ?? 0;
      if (level >= maxLevel(key)) continue;
      const cost = upgradePrice(key, level, map.town.id);
      if (cost < price) [best, price] = [key, cost];
    }
    if (!best || price > limit || price > cash || upgradeSpend + price > map.upgradeSpend * earned) return;
    cash -= price;
    levels[best] = (levels[best] ?? 0) + 1;
    upgradeSpend += price;
    upgradeLevels++;
  };
  let t = 0;
  for (; t < 600 * 60; t++) {
    for (const [id, at] of finishing) {
      if (at > t) continue;
      unlocked.add(id);
      finishing.delete(id);
    }
    for (let pad = next(); pad && cash >= pad.cost; pad = next()) {
      if (pad.afterGoals && !goals.every((g) => unlocked.has(g) || finishing.has(g))) break;
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
        cash += (map.steady(unlocked, levels) * rate + background) * Math.min(wait, (rules.capMinutes[0] ?? 0) * 60);
        away += wait;
        for (const [id] of finishing) unlocked.add(id);
        finishing.clear();
        continue;
      }
    }
    if (after?.afterGoals && goals.every((g) => unlocked.has(g) || finishing.has(g)) && cashAtLand === 0) cashAtLand = cash;
    cash += earn + background;
    earned += earn + background;
    if (map.contracts && unlocked.has(map.contracts) && ++contractIn >= CONTRACT_SECONDS) {
      contractIn = 0;
      const pay = contractPay(unlocked);
      cash += pay;
      earned += pay;
      contractPaid += pay;
    }
    if (options.jobs && unlocked.has(map.tutorial)) {
      const ctx = { incomePerMinute: (earn + background) * 60, next: after ? { cost: after.cost, owed: Math.max(0, after.cost - cash) } : null };
      if (job) {
        job.left -= 1;
        if (job.left <= 0) {
          cash += job.pay;
          earned += job.pay;
          jobPaid += job.pay;
          jobs++;
          job = null;
          since = 0;
        }
      } else if (++since >= (jobs === 0 ? T.firstSeconds : secondsToNext(ctx) > T.farSeconds ? T.gapFar : T.gapNear) && secondsToNext(ctx) >= T.nearSeconds) {
        const golden = (jobs + 1) % T.goldenEvery === 0;
        job = { left: JOB_SECONDS, pay: basePay(T, ctx) * streakMultiplier(T, jobs) * (golden ? T.goldenPay : 1) };
      }
    }
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
    jobs,
    jobPay: Math.round(jobPaid),
    contractPay: Math.round(contractPaid),
    boughtAt,
    levels,
  };
}

/** Plays the maps in order, each starting with what the last left and the old towns' income behind it. */
export function playJourney(maps: JourneyMap[], options: JourneyOptions = ACTIVE): JourneyLeg[] {
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
/**
 * What each town stores as its steady rate (its staff's takings, measured while the hero plays: what it pays in the
 * background once he's moved on), for every dollar its model gives the same buildings and upgrades. Measured with the
 * playthrough bot on leaving each town: the car wash $1.2K a minute against the model's $2K (no tips counted, and
 * the hero had a share of the customers), the farm $38K against $54K.
 */
export const STORED_RATE = { roadside: 0.6, willowbrook: 0.71, starlight: 1 };

/**
 * How a keen player plays each map, measured with the playthrough bot: the share of what's earned that goes on
 * upgrades (more where the helpers leave the hero free to shop), and what the map takes for every dollar its model
 * gives (the rating held at five stars, every order filled).
 */
export const KEEN = {
  roadside: { upgradeSpend: 0.2, income: 1 },
  willowbrook: { upgradeSpend: 0.5, income: 1 },
  starlight: { upgradeSpend: 0.4, income: 1 },
};

export function gameJourney(roadside: TownDef, willowbrook: TownDef, starlight: ParkTown): JourneyMap[] {
  // The park's crowd is played for a few minutes per stage: worked out once per stage (pads are bought in order).
  const stages = new Map<number, ParkStage>();
  const stage = (u: ReadonlySet<string>) => {
    if (!stages.has(u.size)) stages.set(u.size, parkStage(starlight, u, PARK_PACING));
    return stages.get(u.size)!;
  };
  const wash = (u: ReadonlySet<string>, t: number, levels: Levels) => incomePerSecond(roadside.pads, u, DEFAULT_PACING, t, levels) * KEEN.roadside.income;
  const farm = (u: ReadonlySet<string>, levels: Levels) => farmIncomePerSecond(willowbrook.pads, u, FARM_PACING, levels);
  return [
    // The golden VIPs and the hero's own work are left out of what the car wash pays in the background.
    {
      name: roadside.id,
      town: roadside,
      income: wash,
      steady: (u, levels) => incomePerSecond(roadside.pads, u, { ...DEFAULT_PACING, playerEffort: 0 }, 0, levels) * STORED_RATE.roadside,
      tutorial: 'washer',
      upgradesInTutorial: false,
      upgradeSpend: KEEN.roadside.upgradeSpend,
      contracts: 'board',
    },
    { name: willowbrook.id, town: willowbrook, income: (u, _t, levels) => farm(u, levels) * KEEN.willowbrook.income, steady: (u, levels) => farm(u, levels) * STORED_RATE.willowbrook, tutorial: 'standhand', upgradesInTutorial: true, upgradeSpend: KEEN.willowbrook.upgradeSpend },
    {
      name: starlight.id,
      town: starlight,
      income: (u, _t, levels) => parkIncome(stage(u), levels) * KEEN.starlight.income,
      steady: (u, levels) => parkIncome(stage(u), levels) * STORED_RATE.starlight,
      tutorial: 'seller',
      upgradesInTutorial: true,
      upgradeSpend: KEEN.starlight.upgradeSpend,
    },
  ];
}
