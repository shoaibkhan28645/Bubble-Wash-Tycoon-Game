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
  vending?: boolean;
  patienceBonus?: number;
  arrivalBonus?: number;
  endOfContent?: boolean;
}

export interface PadDef {
  id: string;
  name: string;
  cost: number;
  targetMinute: number;
  adds: string;
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
  lot: Rect;
  cameraBase: Rect;
  roadZ: number;
  spawnX: number;
  /** Lane below the bays that carries washed cars to the finishing lane. */
  collectZ: number;
  /** Finishing lane (dryer, wax) runs down at this x. */
  finishX: number;
  /** Cars leave the lot along this z, out to exitX (from the garage). */
  exitZ: number;
  /** Cars that skip the garage turn out here, just after the waxing station. */
  earlyExitZ: number;
  exitX: number;
  playerStart: Point;
  bay: { width: number; length: number };
  station: { width: number; length: number };
  tunnel: { width: number; length: number };
  garage: { width: number; length: number };
  queueGap: number;
  piles: Record<string, Point>;
  pads: Record<string, Point>;
  /** Small pads that open an upgrade pop-up, keyed by panel id. */
  upgradePads: Record<string, Point>;
  /** Where each staff member stands when idle. */
  staffSpots: Record<string, Point>;
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

export function padById(id: string): PadDef | undefined {
  return PADS.find((pad) => pad.id === id);
}

export function stageById(id: string): StageDef | undefined {
  return STAGES.find((stage) => stage.id === id);
}
