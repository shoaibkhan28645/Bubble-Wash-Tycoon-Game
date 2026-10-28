// Daily systems (GDD "Daily engagement"): a 7-day login calendar, three
// missions a day and the Car of the Day. Everything resets at local midnight;
// missing days never takes anything away. Pure functions over GameState.
import { DAILY, type DayCarDef, type MissionDef } from '../core/config';
import type { GameState } from '../core/gameState';

/** Things that count towards missions. */
export type MissionKind = 'wash' | 'handWash' | 'earn' | 'tips' | 'upgrade' | 'vip' | 'monster' | 'detail' | 'snack';

/** The player's local date as YYYY-MM-DD (the Tech Guide: today's local date in the save). */
export function localDate(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Small stable hash, so a date always picks the same missions and car. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h;
}

function seeded(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Two significant figures, so goals read nicely ($3,400, not $3,417). */
function roundNice(n: number): number {
  if (n < 10) return Math.max(1, Math.round(n));
  const step = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / step) * step;
}

export function missionDef(id: string): MissionDef | undefined {
  return DAILY.missions.find((m) => m.id === id);
}

/** Today's missions: picked from the date, from those this lot can do, sized to its progress. */
export function pickMissions(date: string, unlocked: readonly string[]): { missions: string[]; goals: number[] } {
  const pool = DAILY.missions.filter((m) => !m.requires || unlocked.includes(m.requires));
  const rand = seeded(hash(date));
  const shuffled = pool
    .map((m) => ({ m, key: rand() }))
    .sort((a, b) => a.key - b.key)
    .map(({ m }) => m)
    .slice(0, DAILY.missionsPerDay);
  const built = Math.max(0, unlocked.length - 1);
  return { missions: shuffled.map((m) => m.id), goals: shuffled.map((m) => roundNice(m.goal * m.growth ** built)) };
}

/** On a new local day, deal fresh missions. Returns true if the day changed. */
export function rollDay(state: GameState, today: string): boolean {
  if (state.daily.date === today) return false;
  const { missions, goals } = pickMissions(today, state.unlocked);
  Object.assign(state.daily, {
    date: today,
    missions,
    goals,
    progress: missions.map(() => 0),
    claimed: missions.map(() => false),
  });
  return true;
}

/** Counts something towards today's missions. Returns the ids of missions this just completed. */
export function addProgress(state: GameState, kind: MissionKind, amount = 1): string[] {
  const done: string[] = [];
  const d = state.daily;
  d.missions.forEach((id, i) => {
    if (id !== kind || d.claimed[i]) return;
    const goal = d.goals[i] ?? 0;
    const before = d.progress[i] ?? 0;
    d.progress[i] = Math.min(goal, before + amount);
    if (before < goal && d.progress[i] >= goal) done.push(id);
  });
  return done;
}

export function missionReady(state: GameState, i: number): boolean {
  const d = state.daily;
  return !d.claimed[i] && (d.progress[i] ?? 0) >= (d.goals[i] ?? Infinity);
}

/** Takes a finished mission's gems. Returns the gems given (0 if not ready). */
export function claimMission(state: GameState, i: number): number {
  if (!missionReady(state, i)) return 0;
  const gems = missionDef(state.daily.missions[i]!)?.gems ?? 0;
  state.daily.claimed[i] = true;
  state.gems += gems;
  return gems;
}

/** Calendar: one claim per local day. */
export function calendarReady(state: GameState, today: string): boolean {
  return state.daily.loginDate !== today;
}

/** Claims today's calendar reward and moves to the next day (day 7 wraps to day 1). Returns the gems given. */
export function claimCalendar(state: GameState, today: string): number {
  if (!calendarReady(state, today)) return 0;
  const reward = DAILY.calendar[state.daily.loginDay % DAILY.calendar.length]!;
  state.gems += reward.gems;
  state.daily.loginDay = (state.daily.loginDay + 1) % DAILY.calendar.length;
  state.daily.loginDate = today;
  return reward.gems;
}

/** Anything waiting to be claimed (for the red dots on the buttons). */
export function claimable(state: GameState, today: string): { calendar: boolean; missions: number } {
  return {
    calendar: calendarReady(state, today),
    missions: state.daily.missions.filter((_, i) => missionReady(state, i)).length,
  };
}

/** Today's special visitor. */
export function carOfDay(today: string): DayCarDef {
  const cars = DAILY.carOfDay.cars;
  return cars[hash(`car:${today}`) % cars.length]!;
}
