import { newDaily, newGame, newTownState, type Build, type Contract, type ContractsState, type DailyState, type DeliveriesState, type GameState, type GoalsState, type Order, type TownState } from './gameState';
import { START_TOWN_ID } from './towns';

/** Bump when the save shape changes, and add a migration for the old version. */
export const SAVE_VERSION = 10;

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
};

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
