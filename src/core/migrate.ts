import { newGame, type GameState } from './gameState';

/** Bump when the save shape changes, and add a migration for the old version. */
export const SAVE_VERSION = 1;

type SaveObject = Record<string, unknown>;
export type Migration = (save: SaveObject) => SaveObject;

/** MIGRATIONS[n] turns a version-n save into a version n+1 save. Never remove one. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

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
  const { cash, gems, location, unlocked, levels, staff, savedAt } = state;
  return JSON.stringify({ version: SAVE_VERSION, savedAt, cash, gems, location, unlocked, levels, staff });
}

function sanitize(save: SaveObject): GameState {
  const fresh = newGame();
  return {
    cash: nonNegative(save.cash, fresh.cash),
    gems: Math.floor(nonNegative(save.gems, fresh.gems)),
    location: Math.max(1, Math.floor(nonNegative(save.location, fresh.location))),
    unlocked: stringList(save.unlocked),
    levels: levelMap(save.levels),
    staff: stringList(save.staff),
    savedAt: nonNegative(save.savedAt, fresh.savedAt),
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
