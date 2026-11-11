// The whole journey, map after map: the car wash town from $0, its land for
// the farm, Willowbrook, its land for the park, Starlight Fun Park. Each map
// is played by the same buy-the-next-pad bot as its own pacing model, with
// what really comes with it: the money left after buying the land, and the
// towns already built earning in the background all the while (at their
// managers' full rate). The landmark's long build is waited out away from
// the game, earning offline (up to the first cap) in every town.
//
// It answers what each map's own model can't: how long each map really
// takes, how much money arrives with you, how much of it the land takes,
// and how the map's own income compares with what the old towns pay in.
// Like the per-map models, it leaves out upgrades, contracts, ads and tips.
import { TUNING, type PadDef } from '../core/config';
import type { TownDef } from '../core/towns';
import { FARM_PACING, farmIncomePerSecond } from './farmPacing';
import { DEFAULT_PACING, incomePerSecond } from './pacing';
import { PARK_PACING, parkStage } from './parkPacing';
import type { ParkTown } from '../core/towns';

/** One map on the way: its pads and goals, and what it earns a second with what's built. */
export interface JourneyMap {
  name: string;
  town: TownDef;
  income: (unlocked: ReadonlySet<string>, playSeconds: number) => number;
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
  /** The map's own income a minute at the end. */
  endIncome: number;
  /** Cash in hand when the land could first be bought (the landmark built), the land's price, and what's left after it. */
  cashAtLand: number;
  land: number;
  left: number;
  /** Minute each pad was bought. */
  boughtAt: Record<string, number>;
}

const AWAY_AFTER_SECONDS = 15 * 60;

/** Plays one map: from `startCash`, with the old towns paying `background` a second. */
export function playLeg(map: JourneyMap, startCash: number, background: number): JourneyLeg {
  const { pads } = map.town;
  const goals = map.town.goals.goals.flatMap((g) => (g.built ? [g.built] : []));
  const unlocked = new Set<string>();
  const finishing = new Map<string, number>();
  const bought = new Map<string, number>();
  const next = (): PadDef | undefined => pads.find((p) => !unlocked.has(p.id) && !finishing.has(p.id) && !bought.has(p.id));
  let cash = startCash;
  let away = 0;
  let cashAtLand = 0;
  let boughtOnArrival = 0;
  let ownAtFirst = -1;
  let ownAtMiddle = -1;
  let income = 0;
  let incomeFor = '';
  const own = (t: number) => {
    const key = `${unlocked.size}`;
    if (key !== incomeFor || map.town.kind === 'carWash') {
      income = map.income(unlocked, t);
      incomeFor = key;
    }
    return income;
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
      if (ownAtFirst < 0 && pad.cost > 0) ownAtFirst = (own(t) * 60) / Math.max(1, background * 60);
    }
    if (bought.size === pads.length) break;
    const earn = own(t);
    if (ownAtMiddle < 0 && bought.size >= pads.length / 2) ownAtMiddle = earn / Math.max(1e-9, background);
    // Waiting on the landmark's long build, the land next: away from the game, earning offline everywhere.
    const after = next();
    if (finishing.size > 0 && after?.afterGoals) {
      const wait = Math.max(...finishing.values()) - t;
      if (wait > AWAY_AFTER_SECONDS) {
        const rules = TUNING.offline;
        const rate = unlocked.has('manager') ? rules.managerRate : rules.rate;
        cash += (earn * rate + background) * Math.min(wait, (rules.capHours[0] ?? 0) * 3600);
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
    endIncome: Math.round(own(t) * 60),
    cashAtLand: Math.round(cashAtLand),
    land,
    left: Math.round(cash),
    boughtAt,
  };
}

/** Plays the maps in order, each starting with what the last left and the old towns' income behind it. */
export function playJourney(maps: JourneyMap[]): JourneyLeg[] {
  const legs: JourneyLeg[] = [];
  let cash = 0;
  let background = 0;
  for (const map of maps) {
    const leg = playLeg(map, cash, background);
    legs.push(leg);
    cash = leg.left;
    // Every town built so far has its manager by the end: it earns at the full rate while the hero is away.
    background += leg.endIncome / 60;
  }
  return legs;
}

/** The three maps as the game has them: the car wash town, Willowbrook, Starlight Fun Park. */
export function gameJourney(roadside: TownDef, willowbrook: TownDef, starlight: ParkTown): JourneyMap[] {
  const parkIncome = new Map<number, number>();
  return [
    { name: roadside.id, town: roadside, income: (u, t) => incomePerSecond(roadside.pads, u, DEFAULT_PACING, t) },
    { name: willowbrook.id, town: willowbrook, income: (u) => farmIncomePerSecond(willowbrook.pads, u, FARM_PACING) },
    {
      name: starlight.id,
      town: starlight,
      income: (u) => {
        // The park's crowd is played for a few minutes per stage: worked out once per stage (pads are bought in order).
        if (!parkIncome.has(u.size)) parkIncome.set(u.size, parkStage(starlight, u, PARK_PACING).perSecond);
        return parkIncome.get(u.size)!;
      },
    },
  ];
}
