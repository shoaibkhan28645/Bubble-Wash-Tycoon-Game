// Typed access to the balancing data in src/data. Numbers live in the JSON,
// never in code; tests/data.test.ts checks the files fit together.
import carsJson from '../data/cars.json';
import padsJson from '../data/pads.json';
import stagesJson from '../data/stages.json';
import tuningJson from '../data/tuning.json';
import location1Json from '../data/location1.json';

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
  /** Width, height, length in world units. */
  size: [number, number, number];
  color: string;
}

export interface PadEffects {
  bay?: string;
  stage?: string;
  register?: boolean;
  staff?: string;
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
  exitX: number;
  exitZ: number;
  playerStart: Point;
  bay: { width: number; length: number };
  queueGap: number;
  piles: Record<string, Point>;
  pads: Record<string, Point>;
}

export type Tuning = typeof tuningJson;

export const CARS = carsJson as CarDef[];
/** In unlock order. */
export const PADS = padsJson as PadDef[];
export const STAGES = stagesJson as StageDef[];
export const TUNING: Tuning = tuningJson;
export const LOCATION1 = location1Json as LocationLayout;

export function padById(id: string): PadDef | undefined {
  return PADS.find((pad) => pad.id === id);
}

export function stageById(id: string): StageDef | undefined {
  return STAGES.find((stage) => stage.id === id);
}
