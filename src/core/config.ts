// Typed access to the balancing data in src/data. Numbers live in the JSON,
// never in code; tests/data.test.ts checks the files fit together.
import carsJson from '../data/cars.json';
import padsJson from '../data/pads.json';
import stagesJson from '../data/stages.json';
import tuningJson from '../data/tuning.json';
import location1Json from '../data/location1.json';
import charactersJson from '../data/characters.json';
import upgradesJson from '../data/upgrades.json';
import dailyJson from '../data/daily.json';
import adsJson from '../data/ads.json';
import contractsJson from '../data/contracts.json';
import goalsJson from '../data/goals.json';

export type Dirt = 'dusty' | 'muddy' | 'swamp';

export interface Point {
  x: number;
  z: number;
}

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CarDef {
  id: string;
  name: string;
  /** Pad that makes this car start arriving; null for special cars (VIP). */
  unlockedBy: string | null;
  dirt: Dirt;
  basePay: number;
  /** Seconds a car waits before leaving (used from Milestone 4). */
  patience: number;
  payMultiplier?: number;
  vip?: boolean;
  /** The Car of the Day (a one-a-day special visitor). */
  special?: boolean;
  /** Car Kit model name (public/models/cars/<model>.glb). */
  model: string;
  scale: number;
  /** Optional colour multiplied over the model (the golden VIP). */
  tint?: string;
  /** Width, height, length in world units, after scaling. */
  size: [number, number, number];
}

export interface PadEffects {
  bay?: string;
  stage?: string;
  register?: boolean;
  staff?: string;
  /** A station this pad adds: dryer, wax and garage (after the bays), or the tunnel. */
  station?: string;
  /** A fuel pump (its own lane on the forecourt by the road). */
  pump?: string;
  /** The Mini-Mart: drivers at the pumps walk over to buy snacks. */
  mart?: boolean;
  vending?: boolean;
  patienceBonus?: number;
  arrivalBonus?: number;
  /** Added to every bill, e.g. 0.2 = +20% (the landmark). */
  payBonus?: number;
  /** The contracts board. */
  contracts?: boolean;
  endOfContent?: boolean;
}

export interface PadDef {
  id: string;
  name: string;
  cost: number;
  targetMinute: number;
  adds: string;
  /** Seconds of construction after it's paid for (real time, also while away); instant if absent. */
  buildSeconds?: number;
  /** Only offered once every town goal is done (the truck to the next town). */
  afterGoals?: boolean;
  effects: PadEffects;
}

export interface StageDef {
  id: string;
  name: string;
  /** Where the stage happens: in the wash bay (and tunnel), or at its own station. */
  station: 'bay' | 'dryer' | 'wax' | 'garage';
  /** Added to the pay multiplier, e.g. 0.5 = +50%. */
  payBonus: number;
  /** Fraction of wash time removed, e.g. 0.3 = 30% faster. */
  timeReduction: number;
}

export interface LocationLayout {
  name: string;
  /** The paved car wash lot. */
  lot: Rect;
  /** Where people can walk: the lot, the road and the forecourt across it. */
  walk: Rect;
  /** Ground inside `walk` the player can't go (the grass beside the lot, when the walk reaches round it). */
  blocked: Rect[];
  /** The town round the lot (art/blender/town.py, or a prop): shops, homes, lamps; some solid, some with a name sign. */
  town: TownPiece[];
  /** Routes people stroll along (either way); they may stop at a point with a `look` (the way they face). */
  walkways: (Point & { look?: number })[][];
  /** Trees along the streets. */
  streetTrees: Point[];
  /** More ground the player may walk and the camera show once a pad is built (the side street, after the dryer). */
  views: (Rect & { after: string })[];
  /** Raised flower beds on the lot (solid), some with trees. */
  planters: (Rect & { trees: number })[];
  cameraBase: Rect;
  roadZ: number;
  spawnX: number;
  /** Cars drive on the near side of the road coming in, the far side going away. */
  roadLane: number;
  /** Lane below the bays that carries washed cars to the finishing lane. */
  collectZ: number;
  /** Finishing lane (dryer, wax) runs down at this x. */
  finishX: number;
  /** Cars leave the lot along this z (from the garage) onto the side street. */
  exitZ: number;
  /** Cars that skip the garage turn out here, just after the waxing station. */
  earlyExitZ: number;
  /** The side street east of the lot (its middle): cars drive up it back to the main road. */
  sideStreetX: number;
  /** And away along the main road, out of sight here. */
  leaveX: number;
  playerStart: Point;
  bay: { width: number; length: number };
  station: { width: number; length: number };
  tunnel: { width: number; length: number };
  garage: { width: number; length: number };
  pump: { width: number; length: number };
  /**
   * Fuel, across the road: cars turn in at entryX (waiting at waitZ for a
   * free pump), drive along their pump's lane, and back out to the road at exitX.
   */
  forecourt: { entryX: number; exitX: number; waitZ: number; leaveX: number };
  /** The Mini-Mart's till (where drivers are served, and the zone where a worker serves them) and where drivers line up. */
  mart: { counter: Point; zone: Rect; queue: Point[] };
  /** Building sites (scaffolding) for pads with a construction timer: centre and size. */
  sites: Record<string, { x: number; z: number; width: number; depth: number }>;
  /** Where a pad's building stands, if not on the pad itself (the pump island between two lanes). */
  buildAt: Record<string, Point>;
  /** Ground a built pad covers beyond its own spot (the forecourt): kept flat and clear, and in view once built. */
  areas: Record<string, Rect>;
  queueGap: number;
  piles: Record<string, Point>;
  pads: Record<string, Point>;
  /** Small pads that open an upgrade pop-up, keyed by panel id. */
  upgradePads: Record<string, Point>;
  /** Where each staff member stands when idle. */
  staffSpots: Record<string, Point>;
}

/** One piece of the town: a model by name, where it stands and which way it faces. */
export interface TownPiece {
  model: string;
  x: number;
  z: number;
  /** Turn about the vertical, in radians (models face +z). */
  rot?: number;
  /** A shop's name, painted on its sign board, and the board's colour. */
  sign?: string;
  signColor?: string;
  /** Half width and depth the player can't walk through (things on the lot). */
  solid?: [number, number];
}

export type Tuning = typeof tuningJson;

export interface UpgradeKind {
  name: string;
  /** What one level does, shown in the upgrade pop-up. */
  effect: string;
  base: number;
  max: number;
  /** Multiplied in once per level (speed 0.9, quality 1.15). */
  factor?: number;
  /** Added once per level (walk +0.1, carry +1). */
  step?: number;
  /** Queue: one more spot every N levels. */
  every?: number;
}

export interface UpgradesData {
  growth: number;
  kinds: Record<string, UpgradeKind>;
  /** Cost multiplier by upgrade target (station, staff or player). */
  costScale: Record<string, number>;
  /** Which "target.kind" upgrades each upgrade pad offers. */
  panels: Record<string, string[]>;
}

/** A daily mission template; the goal grows with the number of pads built. */
export interface MissionDef {
  id: string;
  goal: number;
  growth: number;
  gems: number;
  /** Only offered once this pad is built. */
  requires?: string;
}

/** A Car of the Day: a one-a-day special visitor. */
export interface DayCarDef {
  id: string;
  name: string;
  model: string;
  tint?: string;
  scale: number;
  size: [number, number, number];
}

export interface DailyData {
  /** Rewards for days 1–7 of the login calendar. */
  calendar: { gems: number; chest?: boolean }[];
  missionsPerDay: number;
  missions: MissionDef[];
  carOfDay: { afterSeconds: number; payMultiplier: number; patience: number; cars: DayCarDef[] };
}

/** A fleet contract template: `goal` of one task before the time runs out, for cash (per unit, grown with the lot) or gems. */
export interface ContractDef {
  id: string;
  client: string;
  icon: string;
  /** What counts: wash, wash:<car id>, fuel, snack, combo, wax, detail. */
  task: string;
  goal: number;
  minutes: number;
  cash?: number;
  gems?: number;
  /** Only offered once this pad is built. */
  requires?: string;
}

export interface ContractsData {
  slots: number;
  /** An empty slot gets a new contract this long after the last one was claimed or ran out. */
  refillMinutes: number;
  /** Cash rewards grow by this much per pad built. */
  cashGrowth: number;
  kinds: ContractDef[];
}

/** A town goal: a pad built, a lifetime count reached, or a star rating. */
export interface GoalDef {
  id: string;
  built?: string;
  count?: string;
  goal?: number;
  stars?: number;
  gems: number;
}

export interface GoalsData {
  /** Franchise stars each goal earns when claimed. */
  franchiseStars: number;
  goals: GoalDef[];
}

export const CARS = carsJson as CarDef[];
/** In unlock order. */
export const PADS = padsJson as PadDef[];
export const STAGES = stagesJson as StageDef[];
export const TUNING: Tuning = tuningJson;
export const LOCATION1 = location1Json as LocationLayout;
/** Which Kenney Mini Character plays each role. */
export const CHARACTERS = charactersJson;
export const UPGRADES = upgradesJson as UpgradesData;
export const DAILY = dailyJson as DailyData;
/** Rewarded ad rewards (and their gem prices) and interstitial limits. */
export const ADS = adsJson;
export const CONTRACTS = contractsJson as ContractsData;
export const GOALS = goalsJson as GoalsData;

/** Half the gap in the lot's side hedge where each driveway goes out (art: render/terrain.ts). */
const DRIVEWAY_GAP = 1.75;
/** Half the width of a street tree's trunk. */
const TRUNK = 0.35;

/**
 * Ground nobody walks through, whatever is built: off the lot, the flower
 * beds, town pieces set on the lot, the hedge along the side street (open
 * at the driveways) and the street trees.
 */
export function fixedSolids(layout: LocationLayout): Rect[] {
  const town = layout.town.flatMap((p) => (p.solid ? [{ minX: p.x - p.solid[0], maxX: p.x + p.solid[0], minZ: p.z - p.solid[1], maxZ: p.z + p.solid[1] }] : []));
  const hedge: Rect[] = [];
  const { lot } = layout;
  let from = lot.minZ + 1.6;
  for (const z of [...[layout.earlyExitZ, layout.exitZ].sort((a, b) => a - b), lot.maxZ + DRIVEWAY_GAP + 1]) {
    if (z - DRIVEWAY_GAP > from) hedge.push({ minX: lot.maxX + 0.1, maxX: lot.maxX + 0.8, minZ: from, maxZ: z - DRIVEWAY_GAP });
    from = z + DRIVEWAY_GAP;
  }
  const trees = layout.streetTrees.map((t) => ({ minX: t.x - TRUNK, maxX: t.x + TRUNK, minZ: t.z - TRUNK, maxZ: t.z + TRUNK }));
  return [...layout.blocked, ...layout.planters, ...town, ...hedge, ...trees];
}

export function padById(id: string): PadDef | undefined {
  return PADS.find((pad) => pad.id === id);
}

export function stageById(id: string): StageDef | undefined {
  return STAGES.find((stage) => stage.id === id);
}
