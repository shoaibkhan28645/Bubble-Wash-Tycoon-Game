// The pacing simulator for a theme park (Chapter 3, Starlight Fun Park): a
// bot buys every pad in order as soon as it can afford it, and the report
// gives the minute each was bought next to the minute the design wants
// (pads.json `targetMinute`, from the Starlight strategy's pads table), so
// prices can be tuned in seconds, not play-throughs.
//
// Unlike the first two towns' simulators, the park's income isn't a formula:
// what a ride earns depends on how many visitors want it, how long they
// queue, how fast it fills and goes round, and how many people the park
// holds at once. So each stage of the park (each set of pads built) is
// played by the game's own crowd (systems/park.ts), headless, for a few
// minutes: visitors arrive, buy tickets, line up, ride and shop, and the
// money they pay is measured. Around the crowd sits a simple model of the
// hero and the staff: the hero sells tickets and launches the carousel until
// there's a seller and an operator, serves the other stalls part of the
// time, and carries supplies until the snack runner does; the operator and
// the coaster crew launch their rides; the truck tops up the shed. The hero
// arrives with what the park's land left over, and the other towns keep
// earning in the background all along (about $51k a minute when the park
// opens). What the crowd takes here is scaled to what the game's park takes
// (PARK_EFFICIENCY, measured). Tips for perfect launches, the mascot's
// photos and the storm are left out; upgrades are counted in
// src/sim/journey.ts, whose bot buys them.
import { TUNING, UPGRADES, type PadDef } from '../core/config';
import { newGame } from '../core/gameState';
import type { ParkTown } from '../core/towns';
import { levelFactor, tipFor } from '../systems/economy';
import { ParkCrowd } from '../systems/park';
import { STALL_SUPPLY, type ParkSupply } from '../systems/parkSupplies';

export interface ParkPacingOptions {
  /** Star rating held (sets how often visitors come). */
  stars: number;
  /** What the hero arrives with (left from Willowbrook after buying the park's land). */
  startCash: number;
  /** Cash a minute the other towns earn while the hero is here (the car wash and the farm, both finished). */
  background: number;
  /** Simulated seconds per step of the timeline, and the longest run (minutes). */
  step: number;
  maxMinutes: number;
  /** Each stage of the park: seconds played before measuring (to fill up), seconds measured, and the crowd's step. */
  warmup: number;
  measure: number;
  dt: number;
}

/** The start cash and the background are the whole journey's (src/sim/journey.ts; tests/journey.test.ts keeps them in step). */
export const PARK_PACING: ParkPacingOptions = {
  stars: 4,
  startCash: 224000,
  background: 51300,
  step: 1,
  maxMinutes: 240,
  warmup: 120,
  measure: 300,
  dt: 0.2,
};

const PARK = TUNING.park;
/** How hard the hero works a stall nobody else serves (he has the tickets, the levers and the boxes to see to as well). */
const HERO_STALL = 0.35;
/** Before the snack runner, the hero carries this share of what the truck brings to the stalls. */
const HERO_CARRY = 0.7;
/** Long builds the player waits out away from the game. */
const AWAY_AFTER_SECONDS = 15 * 60;
/** The share of the park's day that's evening (when the fireworks bring a night crowd and night rides pay more). */
const EVENING_SHARE = PARK.evening.evening / (PARK.evening.day + PARK.evening.evening);

export interface ParkPadTiming {
  id: string;
  name: string;
  cost: number;
  targetMinute: number;
  boughtMinute: number | null;
}

/** What one stage of the park did in its measured minutes: cash a second, and what each ride and stall sold a minute. */
export interface ParkStage {
  perSecond: number;
  /** Riders (a ride) or sales (a stall, the booth's tickets) a minute, by pad id. */
  units: Record<string, number>;
  /** Cash a minute, by pad id. */
  cash: Record<string, number>;
  /** Visitors in the park, on average. */
  visitors: number;
  /** Visitors a minute who ran out of patience and went home (each costs the rating). */
  gaveUp: number;
}

/** Plays the park with `built` for a few minutes and measures what it earns. */
export function parkStage(town: ParkTown, built: ReadonlySet<string>, opts: ParkPacingOptions = PARK_PACING): ParkStage {
  const { layout } = town;
  const pads = town.pads.filter((p) => built.has(p.id));
  const effects = pads.map((p) => p.effects);
  const sum = (pick: (e: PadDef['effects']) => number | undefined) => effects.reduce((s, e) => s + (pick(e) ?? 0), 0);
  const has = (id: string) => built.has(id);
  const staff = new Set(effects.map((e) => e.staff).filter(Boolean));
  const fireworks = effects.some((e) => e.fireworks);
  const state = newGame();
  state.stars = opts.stars;
  let seed = 20251110;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const payBonus = 1 + sum((e) => e.payBonus);
  const night = fireworks ? 1 + PARK.fireworks.nightPay * EVENING_SHARE : 1;
  const units: Record<string, number> = {};
  const cash: Record<string, number> = {};
  let measuring = false;
  let gaveUp = 0;
  const earn = (id: string, n: number, amount: number) => {
    if (!measuring) return;
    units[id] = (units[id] ?? 0) + n;
    cash[id] = (cash[id] ?? 0) + amount;
  };
  const crowd = new ParkCrowd(
    layout,
    state,
    () => sum((e) => e.arrivalBonus) + (fireworks ? PARK.fireworks.crowd * EVENING_SHARE : 0),
    () => sum((e) => e.patienceBonus),
    null,
    (_from, to) => [to],
    {
      onServed: (visitor, counter) => {
        const ticket = counter === crowd.booth;
        const base = ticket ? visitor.basePay : ((PARK.stalls as Record<string, number>)[counter.kind] ?? 0);
        const pay = Math.round(base * payBonus);
        if (!ticket) take(counter.kind);
        const paid = pay + tipFor(pay, visitor.patience / visitor.patienceMax, TUNING.customers);
        visitor.spent += paid;
        earn(counter.id, 1, paid);
      },
      // A perfect day: a tip on the way out (the Visitor of the Day's bonus isn't modelled).
      onPerfectDay: (visitor) => earn('perfectDay', 1, Math.round(visitor.spent * PARK.perfectDay.tip)),
      onGaveUp: () => {
        if (measuring) gaveUp++;
      },
      onLaunch: (ride, launch) => {
        const seat = ride.def.price * payBonus * night;
        const full = launch.full ? 1 + PARK.rides.fullBonus : 1;
        for (const rider of ride.seats) if (rider) rider.spent += Math.round(seat * full);
        earn(ride.id, launch.riders, Math.round(launch.riders * seat * full));
      },
    },
    random,
  );
  crowd.open = true;
  crowd.canBreak = () => false;
  for (const pad of pads) {
    if (pad.effects.counter) crowd.addCounter(pad.id, pad.effects.counter, null);
    if (pad.effects.ride) crowd.addRide(pad.id, pad.effects.ride);
  }
  // A rival takes some of the visitors for a while (the town's story).
  for (const beat of town.story.beats) {
    const rival = beat.effect?.rival;
    if (rival && beat.when.built && has(beat.when.built) && !has(rival.until)) crowd.rateFactor = rival.arrivalFactor;
  }
  // Supplies, once the shed is open: what the truck brings (carried over by the hero, later the snack runner) is all
  // the stalls can sell. Each item's boxes: at the stalls and in the shed, topped up at the truck's rate.
  const shed = has('shed') || effects.some((e) => e.supplies);
  const rules = PARK.supplies;
  const carry = staff.has('snackrunner') ? 1 : HERO_CARRY;
  const boxes = new Map<ParkSupply, number>();
  const holds = (item: ParkSupply) => rules.shed + rules.stall * pads.filter((p) => p.effects.counter && STALL_SUPPLY[p.effects.counter] === item).length;
  for (const item of ['sugar', 'buns', 'prizes'] as const) boxes.set(item, holds(item));
  const take = (kind: string) => {
    const item = STALL_SUPPLY[kind];
    if (shed && item) boxes.set(item, Math.max(0, boxes.get(item)! - 1));
  };
  crowd.stocked = (counter) => {
    const item = STALL_SUPPLY[counter.kind];
    return !shed || !item || boxes.get(item)! >= 1;
  };
  // Who serves each counter, and who's at each ride's lever.
  const servedBy = (kind: string): number => {
    if (kind === 'booth') return 1;
    if ((kind === 'cart' || kind === 'giftshop') && staff.has('seller')) return 1;
    if ((kind === 'ringtoss' || kind === 'burger') && staff.has('vendor')) return 1;
    return HERO_STALL;
  };
  const leverFor = (ride: { id: string; def: { zone: string } }) => {
    // One operator a zone: the ride operator in Kiddie Corner and the Midway, the dock hand at Lakeside, the crew in the Thrill Zone.
    if (ride.def.zone === 'thrill') return staff.has('crew');
    if (ride.def.zone === 'lakeside') return staff.has('boats');
    // The hero launches the carousel himself until there's an operator.
    return staff.has('operator') || ride.id === 'carousel';
  };
  let busTimer = PARK.bus.seconds / 3;
  let busRiders = 0;
  const total = opts.warmup + opts.measure;
  let crowded = 0;
  for (let t = 0; t < total; t += opts.dt) {
    measuring = t >= opts.warmup;
    if (shed) {
      for (const item of ['sugar', 'buns', 'prizes'] as const) {
        boxes.set(item, Math.min(holds(item), boxes.get(item)! + ((rules.truckLoad / rules.truckSeconds) * carry * opts.dt)));
      }
    }
    if (has('busstop')) {
      busTimer -= opts.dt;
      if (busTimer <= 0) {
        busTimer = PARK.bus.seconds;
        const [low, high] = PARK.bus.riders as [number, number];
        crowd.spawnGroup(layout.busStop.stop, busRiders++ % 2 === 0 ? low + 1 : high - 1);
      }
    }
    crowd.update(opts.dt, (counter) => ({ rate: servedBy(counter.kind), byPlayer: false }), (ride) => ({ hero: false, staff: leverFor(ride) }));
    if (measuring) crowded += crowd.visitors.length * opts.dt;
  }
  const minutes = opts.measure / 60;
  for (const id of Object.keys(units)) {
    units[id] = Math.round((units[id]! / minutes) * 10) / 10;
    cash[id] = Math.round(cash[id]! / minutes);
  }
  const perMinute = Object.values(cash).reduce((s, c) => s + c, 0);
  return { perSecond: perMinute / 60, units, cash, visitors: Math.round(crowded / opts.measure), gaveUp: Math.round((gaveUp / minutes) * 10) / 10 };
}

/** The park upgrades this model counts: the rides' ticket prices and the stalls' quality. */
export function parkUpgradeCounts(key: string): boolean {
  const kind = key.split('.')[1];
  return kind === 'price' || kind === 'quality';
}

/**
 * What a stage of the park earns a second with the upgrade levels bought: each
 * ride's ticket price and each stall's quality on what it took (at most twice
 * as much). The speed upgrades aren't counted: the crowd, not the rides, is
 * what holds most stages back.
 */
export function parkIncome(stage: ParkStage, levels: Readonly<Record<string, number>> = {}): number {
  let perMinute = 0;
  for (const [id, cash] of Object.entries(stage.cash)) {
    const price = levelFactor(UPGRADES.kinds.price, levels[`${id}.price`] ?? 0) * levelFactor(UPGRADES.kinds.quality, levels[`${id}.quality`] ?? 0);
    perMinute += cash * price;
  }
  return (perMinute / 60) * PARK_EFFICIENCY;
}

/**
 * What the park takes in the game for every dollar its crowd takes here, once its staff run it (measured hands off:
 * 0.36 to 0.72 from the haunted house on, 0.5 for the finished park). Here visitors walk straight to what they want,
 * rides never break down and litter costs nothing; in the game they keep to the paths, and both happen.
 */
export const PARK_EFFICIENCY = 0.5;

/** Plays the park's pads in order and returns when each was bought, plus the park's own income a minute at the end. */
export function simulateParkPacing(
  town: ParkTown,
  options: Partial<ParkPacingOptions> = {},
): { pads: ParkPadTiming[]; finalIncomePerMinute: number; awayMinutes: number; stages: { built: string; stage: ParkStage }[] } {
  const opts = { ...PARK_PACING, ...options };
  const unlocked = new Set<string>();
  const finishing = new Map<string, number>();
  const bought = new Map<string, number>();
  const stages: { built: string; stage: ParkStage }[] = [];
  let cash = opts.startCash;
  let income = 0;
  let incomeFor = -1;
  let awaySeconds = 0;
  const background = opts.background / 60;
  // The ticket booth and the carousel come with the park.
  for (const pad of town.pads) if (pad.cost === 0) unlocked.add(pad.id);
  for (let t = 0; t <= opts.maxMinutes * 60; t += opts.step) {
    for (const [id, at] of finishing) {
      if (at > t) continue;
      unlocked.add(id);
      finishing.delete(id);
    }
    for (;;) {
      const next = town.pads.find((p) => !unlocked.has(p.id) && !finishing.has(p.id) && !bought.has(p.id));
      if (!next || cash < next.cost) break;
      cash -= next.cost;
      bought.set(next.id, t);
      if (next.buildSeconds) finishing.set(next.id, t + next.buildSeconds);
      else unlocked.add(next.id);
    }
    if (bought.size + town.pads.filter((p) => p.cost === 0).length >= town.pads.length) break;
    // Income only changes when something new opens.
    if (unlocked.size !== incomeFor) {
      const stage = parkStage(town, unlocked, opts);
      stages.push({ built: [...unlocked].at(-1)!, stage });
      income = stage.perSecond * PARK_EFFICIENCY;
      incomeFor = unlocked.size;
    }
    // Waiting on a long build (the landmark's hours): the player comes back when it's done. The park earned offline
    // meanwhile (at the manager's full rate, once there is one), and so did the other towns.
    if (finishing.size > 0) {
      const wait = Math.max(...finishing.values()) - t;
      if (wait > AWAY_AFTER_SECONDS) {
        const rules = TUNING.offline;
        const rate = unlocked.has('manager') ? rules.managerRate : rules.rate;
        const capped = Math.min(wait, (rules.capHours[0] ?? 0) * 3600);
        cash += (income * rate + background) * capped;
        awaySeconds += wait;
        for (const [id] of finishing) unlocked.add(id);
        finishing.clear();
        continue;
      }
    }
    cash += (income + background) * opts.step;
  }
  const pads = town.pads.map((p) => ({
    id: p.id,
    name: p.name,
    cost: p.cost,
    targetMinute: p.targetMinute,
    boughtMinute: p.cost === 0 ? 0 : bought.has(p.id) ? Math.round((bought.get(p.id)! / 60) * 10) / 10 : null,
  }));
  return { pads, finalIncomePerMinute: Math.round(income * 60), awayMinutes: Math.round(awaySeconds / 60), stages };
}
