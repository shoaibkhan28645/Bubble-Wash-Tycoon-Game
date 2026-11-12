import { newDaily, newGame, newTownState, type Build, type Contract, type ContractsState, type DailyState, type DeliveriesState, type GameState, type GoalsState, type Order, type TownState } from './gameState';
import { START_TOWN_ID } from './towns';
import { UPGRADES } from './config';
import { upgradeCost } from '../systems/economy';

/** Bump when the save shape changes, and add a migration for the old version. */
export const SAVE_VERSION = 13;

/**
 * Upgrades taken out in v11, with what their first level cost then: the
 * hero's walk speed (times the town's hero price, below), and quality at the
 * fuel pumps, dryer, waxer and detailing garage (a car's quality is its
 * wash's now). What was spent on them is given back, at those prices.
 */
export const REMOVED_UPGRADES: Readonly<Record<string, number>> = {
  'player.walk': 50,
  'pump1.quality': 96,
  'pump2.quality': 128,
  'dryer.quality': 128,
  'wax.quality': 160,
  'garage.quality': 320,
};
/** Each town's land pad, and the town it opens (v12: the land is the only way into a town). */
export const LAND_PADS: Readonly<Record<string, { pad: string; opens: string }>> = {
  roadside: { pad: 'truck', opens: 'willowbrook' },
  willowbrook: { pad: 'road', opens: 'starlight' },
  starlight: { pad: 'highway', opens: 'downtown' },
};
/** The landmarks: from v12 they build in this many seconds. */
const LANDMARKS = ['landmark', 'windmill', 'wheel'];
const LANDMARK_SECONDS = 1200;

/** The hero's upgrades cost this many times as much in each town before v11. */
const OLD_HERO_SCALE: Readonly<Record<string, number>> = { roadside: 1, willowbrook: 40, starlight: 2500 };

type SaveObject = Record<string, unknown>;
export type Migration = (save: SaveObject) => SaveObject;

/** MIGRATIONS[n] turns a version-n save into a version n+1 save. Never remove one. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  // v2: part-paid unlock pads and uncollected cash piles are saved.
  1: (save) => ({ ...save, padPaid: {}, piles: {} }),
  // v3: star rating, automated income rate (offline earnings) and supplies.
  2: (save) => ({ ...save, stars: 3, autoRate: 0, supplies: {} }),
  // v4: tutorial flags and play time. Existing players are past the tutorial.
  3: (save) => ({ ...save, flags: ['washed', 'collected', 'supplied'], playSeconds: 3600 }),
  // v5: login calendar, daily missions, Car of the Day and the speed boost.
  4: (save) => ({ ...save, daily: newDaily(), boostSeconds: 0 }),
  // v6: construction timers.
  5: (save) => ({ ...save, building: {} }),
  // v7: contracts board, town goals, lifetime counts and franchise stars.
  6: (save) => ({ ...save, contracts: { slots: [], doubledDate: '' }, goals: { done: [], claimed: [] }, counts: {}, franchiseStars: 0 }),
  // v8: the empire. Location 1 becomes the first town by id, and other towns get a place of their own.
  7: ({ location: _location, ...save }) => ({ ...save, currentTown: START_TOWN_ID, towns: {} }),
  // v9: farms. Each town keeps when its crop plots are ripe (none yet: every plot starts ripe).
  8: (save) => ({
    ...save,
    plots: {},
    towns: isObject(save.towns) ? Object.fromEntries(Object.entries(save.towns).map(([id, town]) => [id, isObject(town) ? { ...town, plots: {} } : town])) : save.towns,
  }),
  // v10: delivery orders and vans on the road (none yet).
  9: (save) => ({
    ...save,
    deliveries: noDeliveries(),
    towns: isObject(save.towns) ? Object.fromEntries(Object.entries(save.towns).map(([id, town]) => [id, isObject(town) ? { ...town, deliveries: noDeliveries() } : town])) : save.towns,
  }),
  // v11: upgrades reworked. Those taken out are refunded, in every town.
  10: (save) => {
    let refund = 0;
    const strip = (town: SaveObject, townId: string): SaveObject => {
      if (!isObject(town.levels)) return town;
      const levels = { ...town.levels };
      for (const [key, base] of Object.entries(REMOVED_UPGRADES)) {
        const level = levels[key];
        delete levels[key];
        if (typeof level !== 'number' || !Number.isFinite(level)) continue;
        const scale = key.startsWith('player.') ? (OLD_HERO_SCALE[townId] ?? 1) : 1;
        for (let l = 0; l < Math.min(level, 20); l++) refund += upgradeCost({ name: '', effect: '', base, max: 0 }, scale, l, UPGRADES.growth);
      }
      return { ...town, levels };
    };
    const current = typeof save.currentTown === 'string' ? save.currentTown : START_TOWN_ID;
    const here = strip(save, current);
    const towns = isObject(save.towns)
      ? Object.fromEntries(Object.entries(save.towns).map(([id, town]) => [id, isObject(town) ? strip(town, id) : town]))
      : save.towns;
    const cash = typeof save.cash === 'number' && Number.isFinite(save.cash) ? save.cash : 0;
    return { ...here, towns, cash: cash + refund };
  },
  // v12: a goal's franchise star comes when it's reached (not claimed); a town opens only by buying its land; the
  // landmarks build in 20 minutes.
  11: (save) => {
    const current = typeof save.currentTown === 'string' ? save.currentTown : START_TOWN_ID;
    const towns: Record<string, unknown> = isObject(save.towns) ? { ...save.towns } : {};
    const all: [string, SaveObject][] = [[current, save], ...Object.entries(towns).flatMap(([id, t]): [string, SaveObject][] => (isObject(t) ? [[id, t]] : []))];
    // Every goal reached so far has its star (one each, in every town).
    let stars = 0;
    for (const [, town] of all) stars += isObject(town.goals) && Array.isArray(town.goals.done) ? town.goals.done.length : 0;
    // A town reached some other way (the map used to open towns by stars): its land counts as bought.
    const owned = new Set(all.map(([id]) => id));
    const fix = (id: string, town: SaveObject): SaveObject => {
      let out = town;
      const land = LAND_PADS[id];
      const unlocked = Array.isArray(town.unlocked) ? (town.unlocked as unknown[]) : null;
      if (land && unlocked && owned.has(land.opens) && !unlocked.includes(land.pad)) out = { ...out, unlocked: [...unlocked, land.pad] };
      // A landmark going up: done within 20 minutes.
      if (isObject(out.building)) {
        const building: Record<string, unknown> = { ...out.building };
        for (const lm of LANDMARKS) {
          const b = building[lm];
          if (isObject(b) && typeof b.endsAt === 'number') building[lm] = { ...b, endsAt: Math.min(b.endsAt, Date.now() + LANDMARK_SECONDS * 1000) };
        }
        out = { ...out, building };
      }
      return out;
    };
    for (const [id, t] of Object.entries(towns)) if (isObject(t)) towns[id] = fix(id, t);
    const here = fix(current, save);
    // The park's upkeep goal counts rides serviced as well as fixed.
    const counts = isObject(save.counts) ? { ...save.counts } : {};
    const n = (k: string) => (typeof counts[k] === 'number' ? (counts[k] as number) : 0);
    if (!counts.upkeep) counts.upkeep = n('fixes') + n('services');
    return { ...here, towns, counts, franchiseStars: Math.max(stars, 0) };
  },
  // v13: the cow barn starts with one cow and holds three (two "more cows" levels, not three): a third level is refunded.
  12: (save) => {
    let refund = 0;
    const herd = (town: SaveObject): SaveObject => {
      if (!isObject(town.levels)) return town;
      const level = town.levels['cowbarn.herd'];
      if (typeof level !== 'number' || level <= HERD_MAX) return town;
      for (let l = HERD_MAX; l < Math.min(level, 10); l++) refund += upgradeCost(UPGRADES.kinds.herd!, UPGRADES.costScale.cowbarn ?? 1, l, UPGRADES.growth);
      return { ...town, levels: { ...town.levels, 'cowbarn.herd': HERD_MAX } };
    };
    const towns = isObject(save.towns) ? Object.fromEntries(Object.entries(save.towns).map(([id, t]) => [id, isObject(t) ? herd(t) : t])) : save.towns;
    const here = herd(save);
    const cash = typeof save.cash === 'number' && Number.isFinite(save.cash) ? save.cash : 0;
    return { ...here, towns, cash: cash + refund };
  },
};

/** The cow barn's "more cows" levels (v13): one cow, then two more. */
const HERD_MAX = 2;

function noDeliveries(): DeliveriesState {
  return { orders: [], trips: {}, nextId: 1, refillAt: 0, buyerDay: '', fairDay: '' };
}

/**
 * new: nothing saved. corrupt: unreadable JSON, start fresh.
 * failed: readable but couldn't be upgraded (a bug); play without saving so it isn't lost.
 */
export type LoadStatus = 'new' | 'loaded' | 'corrupt' | 'failed';

/** Turns the string from loadData into a GameState. Never throws. */
export function parseSave(text: string): { state: GameState; status: LoadStatus } {
  if (!text) return { state: newGame(), status: 'new' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { state: newGame(), status: 'corrupt' };
  }
  if (!isObject(raw)) return { state: newGame(), status: 'corrupt' };
  try {
    return { state: migrate(raw), status: 'loaded' };
  } catch {
    return { state: newGame(), status: 'failed' };
  }
}

/** Upgrades any old save to the current version, then repairs bad fields one by one. */
export function migrate(
  raw: SaveObject,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
  target = SAVE_VERSION,
): GameState {
  let save = raw;
  let version = Number.isInteger(save.version) ? (save.version as number) : 1;
  while (version < target) {
    const step = migrations[version];
    if (!step) throw new Error(`No save migration from version ${version}`);
    save = step(save);
    version++;
  }
  // A newer version than we know (shouldn't happen): keep every field we understand.
  return sanitize(save);
}

export function serialize(state: GameState): string {
  const { cash, gems, currentTown, flags, savedAt } = state;
  const towns: Record<string, TownState> = {};
  for (const [id, town] of Object.entries(state.towns)) towns[id] = townFields(town);
  return JSON.stringify({
    version: SAVE_VERSION,
    savedAt,
    cash,
    gems,
    currentTown,
    ...townFields(state),
    towns,
    flags,
    playSeconds: Math.floor(state.playSeconds),
    daily: state.daily,
    boostSeconds: Math.ceil(state.boostSeconds),
    contracts: state.contracts,
    counts: state.counts,
    franchiseStars: state.franchiseStars,
  });
}

/** One town's progress as saved, with its rating and income rate rounded. */
function townFields(town: TownState): TownState {
  const { unlocked, levels, staff, padPaid, building, piles, supplies, plots, deliveries, goals } = town;
  return {
    unlocked,
    levels,
    staff,
    padPaid,
    building,
    piles,
    stars: Math.round(town.stars * 100) / 100,
    autoRate: Math.round(town.autoRate * 100) / 100,
    supplies,
    plots,
    deliveries,
    goals,
  };
}

function sanitize(save: SaveObject): GameState {
  const fresh = newGame();
  const towns: Record<string, TownState> = {};
  const currentTown = typeof save.currentTown === 'string' && save.currentTown ? save.currentTown : fresh.currentTown;
  if (isObject(save.towns)) {
    for (const [id, town] of Object.entries(save.towns)) if (id !== currentTown && isObject(town)) towns[id] = townState(town);
  }
  return {
    cash: nonNegative(save.cash, fresh.cash),
    gems: Math.floor(nonNegative(save.gems, fresh.gems)),
    currentTown,
    towns,
    ...townState(save),
    flags: stringList(save.flags),
    playSeconds: nonNegative(save.playSeconds, fresh.playSeconds),
    daily: dailyState(save.daily),
    boostSeconds: nonNegative(save.boostSeconds, fresh.boostSeconds),
    contracts: contractsState(save.contracts),
    counts: levelMap(save.counts),
    franchiseStars: Math.floor(nonNegative(save.franchiseStars, fresh.franchiseStars)),
    savedAt: nonNegative(save.savedAt, fresh.savedAt),
  };
}

/** One town's progress, each field repaired on its own (the town being played, or one in `towns`). */
function townState(save: SaveObject): TownState {
  const fresh = newTownState();
  return {
    unlocked: stringList(save.unlocked),
    levels: levelMap(save.levels),
    staff: stringList(save.staff),
    padPaid: amountMap(save.padPaid),
    building: buildMap(save.building),
    piles: amountMap(save.piles),
    stars: Math.min(5, Math.max(1, nonNegative(save.stars, fresh.stars))),
    autoRate: nonNegative(save.autoRate, fresh.autoRate),
    supplies: levelMap(save.supplies),
    plots: timeMap(save.plots),
    deliveries: deliveriesState(save.deliveries),
    goals: goalsState(save.goals),
  };
}

function goalsState(value: unknown): GoalsState {
  return {
    done: stringList(isObject(value) ? value.done : []),
    claimed: stringList(isObject(value) ? value.claimed : []),
  };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's missions are kept only if all their lists line up; otherwise they're picked again. */
function dailyState(value: unknown): DailyState {
  const fresh = newDaily();
  if (!isObject(value)) return fresh;
  const date = (v: unknown) => (typeof v === 'string' && DATE.test(v) ? v : '');
  const missions = Array.isArray(value.missions) ? value.missions.filter((m): m is string => typeof m === 'string') : [];
  const numbers = (v: unknown) => (Array.isArray(v) ? v.map((n) => nonNegative(n, 0)) : []);
  const goals = numbers(value.goals);
  const progress = numbers(value.progress);
  const claimed = Array.isArray(value.claimed) ? value.claimed.map((c) => c === true) : [];
  const n = missions.length;
  const consistent = goals.length === n && progress.length === n && claimed.length === n;
  return {
    date: consistent ? date(value.date) : '',
    missions: consistent ? missions : [],
    goals: consistent ? goals : [],
    progress: consistent ? progress : [],
    claimed: consistent ? claimed : [],
    loginDay: Math.min(6, Math.floor(nonNegative(value.loginDay, 0))),
    loginDate: date(value.loginDate),
    carOfDayDate: date(value.carOfDayDate),
  };
}

/** Board slots with readable numbers; anything odd becomes an empty slot that fills straight away. */
function contractsState(value: unknown): ContractsState {
  if (!isObject(value)) return { slots: [], doubledDate: '' };
  const slots = Array.isArray(value.slots) ? value.slots : [];
  const slot = (v: unknown): Contract => {
    if (!isObject(v) || typeof v.kind !== 'string') return { kind: '', goal: 0, progress: 0, endsAt: 0, cash: 0, gems: 0 };
    return {
      kind: v.kind,
      goal: nonNegative(v.goal, 0),
      progress: nonNegative(v.progress, 0),
      endsAt: nonNegative(v.endsAt, 0),
      cash: nonNegative(v.cash, 0),
      gems: Math.floor(nonNegative(v.gems, 0)),
    };
  };
  return {
    slots: slots.map(slot),
    doubledDate: typeof value.doubledDate === 'string' && DATE.test(value.doubledDate) ? value.doubledDate : '',
  };
}

function isObject(value: unknown): value is SaveObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonNegative(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string'))];
}

function levelMap(value: unknown): Record<string, number> {
  const levels: Record<string, number> = {};
  if (!isObject(value)) return levels;
  for (const [id, level] of Object.entries(value)) {
    if (typeof level === 'number' && Number.isInteger(level) && level >= 0) levels[id] = level;
  }
  return levels;
}

function buildMap(value: unknown): Record<string, Build> {
  const builds: Record<string, Build> = {};
  if (!isObject(value)) return builds;
  for (const [id, build] of Object.entries(value)) {
    if (isObject(build) && typeof build.endsAt === 'number' && Number.isFinite(build.endsAt)) builds[id] = { endsAt: build.endsAt, halved: build.halved === true };
  }
  return builds;
}

/** The board's orders (any broken one dropped) and the vans on the road (any broken trip dropped). */
function deliveriesState(value: unknown): DeliveriesState {
  const fresh = noDeliveries();
  if (!isObject(value)) return fresh;
  const orders: Order[] = [];
  for (const o of Array.isArray(value.orders) ? value.orders : []) {
    if (!isObject(o) || typeof o.good !== 'string' || typeof o.buyer !== 'string' || !Number.isInteger(o.id)) continue;
    const qty = Math.max(1, Math.floor(nonNegative(o.qty, 1)));
    orders.push({
      id: o.id as number,
      good: o.good,
      qty,
      pay: nonNegative(o.pay, 0),
      buyer: o.buyer,
      endsAt: nonNegative(o.endsAt, 0),
      van: typeof o.van === 'string' ? o.van : null,
      loaded: Math.min(qty, Math.floor(nonNegative(o.loaded, 0))),
      ...(o.special === 'buyer' || o.special === 'fair' ? { special: o.special } : {}),
      ...(typeof o.gems === 'number' && o.gems > 0 ? { gems: Math.floor(o.gems) } : {}),
    });
  }
  const trips: DeliveriesState['trips'] = {};
  if (isObject(value.trips)) {
    for (const [van, t] of Object.entries(value.trips)) {
      if (isObject(t) && Number.isInteger(t.order) && typeof t.leftAt === 'number' && typeof t.backAt === 'number') trips[van] = { order: t.order as number, leftAt: t.leftAt, backAt: t.backAt };
    }
  }
  const nextId = Math.max(Math.floor(nonNegative(value.nextId, 1)), ...orders.map((o) => o.id + 1), 1);
  const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
  return { orders, trips, nextId, refillAt: nonNegative(value.refillAt, 0), buyerDay: day(value.buyerDay), fairDay: day(value.fairDay) };
}

/** Wall-clock times by id (whole ms, from 0). */
function timeMap(value: unknown): Record<string, number> {
  const times: Record<string, number> = {};
  if (!isObject(value)) return times;
  for (const [id, time] of Object.entries(value)) {
    if (typeof time === 'number' && Number.isFinite(time) && time >= 0) times[id] = Math.round(time);
  }
  return times;
}

function amountMap(value: unknown): Record<string, number> {
  const amounts: Record<string, number> = {};
  if (!isObject(value)) return amounts;
  for (const [id, amount] of Object.entries(value)) {
    if (typeof amount === 'number' && Number.isFinite(amount) && amount > 0) amounts[id] = amount;
  }
  return amounts;
}
