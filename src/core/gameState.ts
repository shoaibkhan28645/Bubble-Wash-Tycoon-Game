/** Login calendar, daily missions and the Car of the Day; missions reset each local day. */
export interface DailyState {
  /** Local date (YYYY-MM-DD) the missions below are for; '' before the first day. */
  date: string;
  /** Today's mission ids, their goals, progress and whether the reward was taken. */
  missions: string[];
  goals: number[];
  progress: number[];
  claimed: boolean[];
  /** Calendar days claimed in the current 7-day round (0–6): the next claim is day loginDay + 1. */
  loginDay: number;
  /** Local date of the last calendar claim. Missed days just pause the calendar. */
  loginDate: string;
  /** Local date the Car of the Day last came. */
  carOfDayDate: string;
}

/** A pad under construction: when it's done (wall-clock ms), and whether the ad already halved it. */
export interface Build {
  endsAt: number;
  halved: boolean;
}

/** A contract on the board; `kind` is '' while the slot waits for a new one (until `endsAt`). */
export interface Contract {
  kind: string;
  goal: number;
  progress: number;
  /** Wall-clock ms: when the contract runs out, or when an empty slot gets a new one. */
  endsAt: number;
  cash: number;
  gems: number;
}

export interface ContractsState {
  slots: Contract[];
  /** Local date the once-a-day ad last doubled a contract's reward. */
  doubledDate: string;
}

/** The town's goals: reached (they stay reached) and claimed. */
export interface GoalsState {
  done: string[];
  claimed: string[];
}

export function newDaily(): DailyState {
  return { date: '', missions: [], goals: [], progress: [], claimed: [], loginDay: 0, loginDate: '', carOfDayDate: '' };
}

/**
 * The single source of truth for progress. Only ids, levels and counts live
 * here; positions and other moment-to-moment state belong to the systems.
 */
export interface GameState {
  cash: number;
  gems: number;
  /** Current location number, starting at 1. */
  location: number;
  /** Ids of built unlock pads, in build order. */
  unlocked: string[];
  /** Upgrade levels by id, e.g. "bay1.speed": 3. */
  levels: Record<string, number>;
  /** Ids of hired staff. */
  staff: string[];
  /** Cash already paid into unlock pads that aren't finished yet, by pad id. */
  padPaid: Record<string, number>;
  /** Paid-for pads still being built, by pad id. */
  building: Record<string, Build>;
  /** Uncollected cash in each pile, by pile id. */
  piles: Record<string, number>;
  /** Star rating, 1–5 (sets how often cars arrive). */
  stars: number;
  /** Automated income per minute, measured in play; drives offline earnings. */
  autoRate: number;
  /** Supply counts: "shelf.soap", "bay1.soap", "dryer.towel"… */
  supplies: Record<string, number>;
  /** One-off milestones for the tutorial hand: "washed", "collected", "supplied", "ended"… */
  flags: string[];
  /** Total seconds played (game clock), for the first-10-minutes timeline. */
  playSeconds: number;
  daily: DailyState;
  /** Seconds of 2× wash speed left (a rewarded ad boost). */
  boostSeconds: number;
  contracts: ContractsState;
  goals: GoalsState;
  /** Lifetime counts the goals look at: "combo", "contract". */
  counts: Record<string, number>;
  /** Earned by town goals; they'll open travel and the franchise perks. */
  franchiseStars: number;
  /** Wall-clock ms of the last save (0 = never saved). Used for offline earnings. */
  savedAt: number;
}

export function newGame(): GameState {
  return {
    cash: 0,
    gems: 0,
    location: 1,
    unlocked: [],
    levels: {},
    staff: [],
    padPaid: {},
    building: {},
    piles: {},
    stars: 3,
    autoRate: 0,
    supplies: {},
    flags: [],
    playSeconds: 0,
    daily: newDaily(),
    boostSeconds: 0,
    contracts: { slots: [], doubledDate: '' },
    goals: { done: [], claimed: [] },
    counts: {},
    franchiseStars: 0,
    savedAt: 0,
  };
}
