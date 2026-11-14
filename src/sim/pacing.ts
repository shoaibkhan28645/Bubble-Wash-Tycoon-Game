// Pacing simulator: a quick model of a town's economy, played by a bot that
// buys every pad in order as soon as it can afford it. It reports the minute
// each pad is bought next to the minute the design wants (pads.json
// `targetMinute`), so a change to prices or pay can be checked in seconds
// instead of a full play-through. Run it with `npm run pacing`.
//
// It is a model, not the game: no cars are driven and nobody walks. Cars
// arrive at the game's rate, want what the game's tickets want, and are
// served as fast as the built stations and the people working them allow.
// Money from contracts, goals and rewarded ads is left out. Upgrades are
// counted when they're bought (src/sim/journey.ts has the bot that buys them).
// What staff earn was checked against the game itself, stage by stage.
import { CARS, STATIONS, TUNING, UPGRADES, stationDef, type CarDef, type PadDef, type StageDef } from '../core/config';
import type { TownDef } from '../core/towns';
import { builtStages, levelFactor, spawnSeconds, ticketPay, washSeconds } from '../systems/economy';
import type { Need, TicketKind } from '../systems/tickets';

export interface PacingOptions {
  /** Share of a working hour the player spends serving customers (the rest is walking, carrying, collecting). */
  playerEffort: number;
  /** Star rating the town holds (sets how often customers come). */
  stars: number;
  /** Share of customers served with patience to spare, who tip. */
  tipShare: number;
  /** Simulated seconds per step. */
  step: number;
  /** Stop after this many minutes even if pads are left. */
  maxMinutes: number;
}

export const DEFAULT_PACING: PacingOptions = { playerEffort: 0.5, stars: 3.5, tipShare: 0.5, step: 1, maxMinutes: 360 };

export interface PadTiming {
  id: string;
  name: string;
  cost: number;
  /** When the design wants it bought. */
  targetMinute: number;
  /** When the bot bought it (null: never, within maxMinutes). */
  boughtMinute: number | null;
}

/** Plays the town's pads in order and returns when each was bought, plus the income per minute at the end. */
export function simulatePacing(
  town: TownDef,
  options: Partial<PacingOptions> = {},
): { pads: PadTiming[]; finalIncomePerMinute: number; awayMinutes: number } {
  const opts = { ...DEFAULT_PACING, ...options };
  const unlocked = new Set<string>();
  const finishing = new Map<string, number>();
  const bought = new Map<string, number>();
  let cash = 0;
  let income = 0;
  /** Real time spent away while a long build finished (not counted as play). */
  let awaySeconds = 0;
  for (let t = 0; t <= opts.maxMinutes * 60; t += opts.step) {
    for (const [id, at] of finishing) {
      if (at > t) continue;
      unlocked.add(id);
      finishing.delete(id);
    }
    // The bot buys the next pad the moment it can (like pads.ts, the next one not built or being built).
    for (;;) {
      const next = town.pads.find((p) => !unlocked.has(p.id) && !finishing.has(p.id) && !bought.has(p.id));
      if (!next || cash < next.cost || (next.afterGoals && !goalsDone(town, unlocked, finishing))) break;
      cash -= next.cost;
      bought.set(next.id, t);
      if (next.buildSeconds) finishing.set(next.id, t + next.buildSeconds);
      else unlocked.add(next.id);
    }
    if (bought.size === town.pads.length) break;
    income = incomePerSecond(town.pads, unlocked, opts, t);
    // Waiting on a long build (the landmark's hours) with only the land for the next town left: a player closes the
    // game and comes back when it's done. That time isn't play; the town earns offline meanwhile, and that's most of
    // what buys the land.
    const next = town.pads.find((p) => !unlocked.has(p.id) && !finishing.has(p.id) && !bought.has(p.id));
    if (next?.afterGoals && finishing.size > 0) {
      const wait = Math.max(...finishing.values()) - t;
      if (wait > AWAY_AFTER_SECONDS) {
        const rules = TUNING.offline;
        const rate = unlocked.has('manager') ? rules.managerRate : rules.rate;
        cash += income * rate * Math.min(wait, (rules.capMinutes[0] ?? 0) * 60);
        awaySeconds += wait;
        for (const [id] of finishing) unlocked.add(id);
        finishing.clear();
        continue;
      }
    }
    cash += income * opts.step;
  }
  const pads = town.pads.map((p) => ({
    id: p.id,
    name: p.name,
    cost: p.cost,
    targetMinute: p.targetMinute,
    boughtMinute: bought.has(p.id) ? Math.round((bought.get(p.id)! / 60) * 10) / 10 : null,
  }));
  return { pads, finalIncomePerMinute: Math.round(income * 60), awayMinutes: Math.round(awaySeconds / 60) };
}

/** What staff earn in the game for every dollar this model gives them (measured; see incomePerSecond). */
export const STAFF_EFFICIENCY = 0.75;

/** A build that would keep the player waiting longer than this is waited out away from the game. */
const AWAY_AFTER_SECONDS = 30 * 60;

/** The bot counts the town's goals done once every pad they name is paid for (counts and stars come with play). */
function goalsDone(town: TownDef, unlocked: Set<string>, finishing: ReadonlyMap<string, number>): boolean {
  return town.goals.goals.every((goal) => !goal.built || unlocked.has(goal.built) || finishing.has(goal.built));
}

/** Upgrade levels bought, by key ("bay1.quality"). */
export type Levels = Readonly<Record<string, number>>;

/**
 * Cash per second the town makes with what's built (and the upgrade levels
 * bought): customers served times what each pays.
 */
export function incomePerSecond(pads: readonly PadDef[], unlocked: ReadonlySet<string>, opts: PacingOptions, playSeconds = 0, levels: Levels = {}): number {
  const built = (id: string) => unlocked.has(id);
  const level = (key: string) => levels[key] ?? 0;
  /** A speed upgrade's time multiplier (½ at the top level), and a pay upgrade's multiplier (×2 at the top). */
  const time = (key: string) => levelFactor(UPGRADES.kinds.speed, level(key));
  const pay = (key: string) => levelFactor(UPGRADES.kinds.quality, level(key));
  /** Staff work faster with their speed upgrade. */
  const quick = (role: string) => 1 / levelFactor(UPGRADES.kinds.staffSpeed, level(`${role}.staffSpeed`));
  const list = [...unlocked];
  const sum = (pick: (p: PadDef) => number | undefined) => pads.filter((p) => built(p.id)).reduce((s, p) => s + (pick(p) ?? 0), 0);
  const staff = new Set(pads.filter((p) => built(p.id) && p.effects.staff).map((p) => p.effects.staff!));
  const stations = (kind: string) => pads.filter((p) => built(p.id) && (p.effects.bay ? 'bay' : p.effects.pump ? 'pump' : p.effects.station) === kind).length;

  // Who comes: every car the town has opened, equally often (the golden VIP is added below).
  const cars = CARS.filter((c) => c.unlockedBy && built(c.unlockedBy));
  if (cars.length === 0) return 0;
  const arrivals = 1 / spawnSeconds(TUNING.cars.spawnSeconds, opts.stars, TUNING.stars.arrivalPerStar, sum((p) => p.effects.arrivalBonus));

  // What they want: the ticket kinds the town can serve, by weight.
  const pumps = stations('pump');
  const selling = built('mart');
  const canServe = (need: Need) => need === 'wash' || (need === 'fuel' && pumps > 0) || (need === 'snack' && selling);
  const kinds = (TUNING.tickets.kinds as TicketKind[]).filter((k) => k.needs.every(canServe));
  const totalWeight = kinds.reduce((s, k) => s + k.weight, 0);
  const share = (need: Need) => kinds.filter((k) => k.needs.includes(need)).reduce((s, k) => s + k.weight, 0) / totalWeight;

  // Who works: staff on their stations part of each shift; the player shares out what's left.
  const shift = TUNING.staff.workSeconds / (TUNING.staff.workSeconds + TUNING.staff.breakSeconds);
  const staffRate = TUNING.staff.workRate * shift;
  const rate = (role: string) => staffRate * quick(role);
  // One washer works one bay: the hero washes at the other (as a player does all game).
  const bays = stations('bay');
  const washers = staff.has('washer') ? 1 : 0;
  const unstaffed = [
    bays > washers,
    pumps > 0 && !staff.has('attendant'),
    selling && !staff.has('clerk'),
    (built('dryer') || built('wax')) && !staff.has('dryer'),
  ].filter(Boolean).length;
  const player = unstaffed > 0 ? opts.playerEffort / unstaffed : 0;

  // How fast customers are served, per need, in customers per second.
  const bayStages = builtStages(list, 'bay');
  const bayIds = pads.filter((p) => built(p.id) && p.effects.bay).map((p) => p.id);
  const pumpIds = pads.filter((p) => built(p.id) && p.effects.pump).map((p) => p.id);
  const bayTime = mean(bayIds, (id) => time(`${id}.speed`));
  const dirtSeconds = mean(cars.filter((c) => c.dirt !== 'swamp'), (c) => washSeconds(c.dirt, bayStages, TUNING.wash)) * (bayIds.length ? bayTime : 1);
  // The hero scrubs faster with the scrub upgrade (a washer's speed is their own).
  const scrub = 1 / levelFactor(UPGRADES.kinds.scrub, level('player.scrub'));
  const bayWorkers = Math.min(bays, washers * rate('washer') + (bays > washers ? player * scrub : 0));
  const tunnel = built('tunnel') ? (stationDef('tunnel').capacity ?? 1) / ((stationDef('tunnel').seconds ?? 1) * time('tunnel.speed')) : 0;
  const bayWash = dirtSeconds > 0 ? bayWorkers / dirtSeconds : 0;
  const capacity: Record<Need, number> = {
    wash: bayWash + tunnel,
    fuel: Math.min(pumps, staff.has('attendant') ? rate('attendant') : player) / ((STATIONS.pump?.seconds ?? 1) * (pumpIds.length ? mean(pumpIds, (id) => time(`${id}.speed`)) : 1)),
    snack: (staff.has('clerk') ? rate('clerk') : player) / ((STATIONS.counter?.seconds ?? 1) * time('mart.speed')),
  };
  // A car's quality is its wash's: the bays' or the tunnel's, by how many cars each washes.
  const washQuality =
    bayWash + tunnel > 0 ? (bayWash * mean(bayIds.length ? bayIds : ['bay1'], (id) => pay(`${id}.quality`)) + tunnel * pay('tunnel.quality')) / (bayWash + tunnel) : 1;
  const served = (need: Need) => {
    const demand = arrivals * share(need);
    return demand > 0 ? Math.min(1, (capacity[need] ?? 0) / demand) : 0;
  };

  // What each customer pays: every stage built along the wash, a combo for several needs, tips and the landmark.
  const stages: StageDef[] = [...bayStages, ...builtStages(list, 'dryer'), ...builtStages(list, 'wax')];
  const detail = builtStages(list, 'garage');
  const payer: Pick<CarDef, 'basePay'> = { basePay: mean(cars, (c) => c.basePay) };
  const bonus = (1 + sum((p) => p.effects.payBonus)) * (1 + TUNING.customers.tipBonus * opts.tipShare);
  let perSecond = 0;
  for (const kind of kinds) {
    const servedShare = Math.min(...kind.needs.map(served));
    const garage = kind.needs.includes('wash') ? (stationDef('garage').chance ?? 0) : 0;
    const quality = kind.needs.includes('wash') ? washQuality : 1;
    const bill = (1 - garage) * ticketPay(payer, stages, kind.needs, quality) + garage * ticketPay(payer, [...stages, ...detail], kind.needs, quality);
    perSecond += arrivals * (kind.weight / totalWeight) * servedShare * bill * bonus;
  }
  // The golden VIP (from the first VIP time on) and the vending machine.
  if (playSeconds >= TUNING.vip.firstSeconds) {
    const best = Math.max(...cars.map((c) => c.basePay));
    const vipEvery = (TUNING.vip.minSeconds + TUNING.vip.maxSeconds) / 2;
    perSecond += (ticketPay({ basePay: best, payMultiplier: vipMultiplier() }, stages, ['wash'], washQuality) * bonus) / vipEvery;
  }
  // A can for the drivers who get out while the car ahead is washed (about one in five washes).
  if (built('vending')) perSecond += arrivals * share('wash') * TUNING.vending.pay * 0.2;
  // Measured in the game itself (hands off, ten minutes a stage, from the cashier on, with and without upgrades):
  // staff take about three quarters of what this model gives them (cars lost to a full line, walking, the odd
  // jam at the exit). The hero's own work is set by playerEffort.
  const front = [true, pumps > 0, selling];
  const staffed = [staff.has('washer') || built('tunnel'), staff.has('attendant'), staff.has('clerk')].filter((s, i) => s && front[i]).length;
  const staffedShare = staffed / front.filter(Boolean).length;
  return perSecond * (1 - (1 - STAFF_EFFICIENCY) * staffedShare);
}

function vipMultiplier(): number {
  return CARS.find((c) => c.vip)?.payMultiplier ?? 1;
}

function mean<T>(items: readonly T[], value: (item: T) => number): number {
  return items.length === 0 ? 0 : items.reduce((s, item) => s + value(item), 0) / items.length;
}
