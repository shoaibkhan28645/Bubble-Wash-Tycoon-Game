// Typed access to the balancing data in src/data. Numbers live in the JSON,
// never in code; tests/data.test.ts checks the files fit together.
import carsJson from '../data/cars.json';
import stagesJson from '../data/stages.json';
import stationsJson from '../data/stations.json';
import needsJson from '../data/needs.json';
import ranksJson from '../data/ranks.json';
import tuningJson from '../data/tuning.json';
import charactersJson from '../data/characters.json';
import upgradesJson from '../data/upgrades.json';
import dailyJson from '../data/daily.json';
import adsJson from '../data/ads.json';
import contractsJson from '../data/contracts.json';
import cropsJson from '../data/crops.json';
import goodsJson from '../data/goods.json';
import { ROADSIDE, type TownDef } from './towns';

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
  /** Model name in the Blender car files (art/blender/cars.py). */
  model: string;
  scale: number;
  /** Real paint colours it comes in, one picked for each visit (the golden VIP: gold). */
  paints?: string[];
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
  /** Takes the hero to this town once built (the truck to the next town). */
  travel?: string;
  /** A walk-up counter (a farm stand, a market stall), of this station kind. */
  counter?: string;
  /** A ride (rides.json), with its line, seats and lever. */
  ride?: string;
  /** The park's supply shed: stalls sell from supplies the truck brings. */
  supplies?: boolean;
  /** Litter bins along the park's paths. */
  bins?: boolean;
  /** A field of plots growing this crop (crops.json). */
  field?: string;
  /** Crops grow this much faster, e.g. 0.35 = 35% (the well). */
  growBonus?: number;
  /** More crates each stand holds (the barn). */
  storage?: number;
  /** A pen of animals: hens (eggs, packed into cartons at the egg table) or cows (milk, bottled at the dairy). */
  pen?: 'hens' | 'cows';
  /** A feed store: corn tipped in feeds the hens, who then lay faster. */
  feeder?: boolean;
  /** Minds the money, as the cashier does: cash piles grow past their cap (the farm's stand helper). */
  till?: boolean;
  /** A delivery van (its kind is the pad's id in tuning.json `vans`); the first opens the orders board. */
  van?: boolean;
  /** A delivery driver: the vans take orders by themselves. */
  driver?: boolean;
  /** A farm machine: the farmhand's pickup, the feed truck. */
  machine?: 'pickup' | 'feedTruck';
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

/**
 * The five kinds of station every business is built from (strategy doc,
 * section 6): a service point (a customer waits while a worker does a job),
 * a shop till, a rental slot (used for a while, then reset), a producer
 * (makes supplies) and a mover (carries them). Chapter 1 uses service
 * points and a till; the soap shelf and the runner are its producer and mover.
 */
export type StationType = 'service' | 'till' | 'rental' | 'producer' | 'mover';

/** How a customer gets about: driving a car, or on foot. */
export type Body = 'car' | 'walker';

/** One kind of station, from src/data/stations.json. Its key is the station's `kind`. */
export interface StationDef {
  name: string;
  type: StationType;
  /** Who it serves. */
  customer: Body;
  /**
   * How customers reach and leave it on the lot: a wash lane with a line
   * (bays), a conveyor (the tunnel), the finishing lane, the forecourt, or a
   * shop's queue.
   */
  flow: 'lane' | 'conveyor' | 'finishing' | 'forecourt' | 'till';
  /** The ticket need it ticks off (wash, fuel, snack), or null if it only adds stages. */
  serves: string | null;
  /** Built stages it adds to a customer's bill, by the stage's station (stages.json). */
  stages: string[];
  /** Seconds for one job at full speed; null = worked out from the car's dirt (the wash). */
  seconds: number | null;
  /** Supply it uses up per customer once the shelf exists (soap, towel, wax), or null. */
  supply: string | null;
  /** Which size in the town layout its footprint takes (null: set by its building). */
  size: 'bay' | 'station' | 'garage' | 'tunnel' | 'pump' | null;
  /** How far round its footprint a worker counts as working it. */
  padding: number;
  /** Where a worker stands, from the station's spot (`mirror`: on the lot's outer side), or null for beside its zone. */
  workSpot: { x: number; z: number; mirror?: boolean } | null;
  /** Where its progress ring floats: over an arch, over the car as a gauge, or beside it. */
  ring: 'arch' | 'gauge' | 'beside';
  /** Effects while working and when done: wash (bubbles), fuel (glugs), polish (a big sparkle), none. */
  fx: 'wash' | 'fuel' | 'polish' | 'none';
  /** Customers inside at once (the tunnel). */
  capacity?: number;
  /** Extra waiting spots in front of it. */
  queueSpots?: number;
  /** Share of customers who stop here (the detailing garage). */
  chance?: number;
}

/** A rank on the hero's career ladder, from src/data/ranks.json (lowest first). */
export interface RankDef {
  id: string;
  name: string;
  icon: string;
  /** Best net worth that reaches it. */
  netWorth: number;
  /** What it gives, in words for the rank-up card (null: nothing yet). */
  perk: string | null;
  /** What it gives, as numbers added up over every rank reached. */
  perks: { walk?: number; contractSlots?: number };
}

/** Something a customer can come for, from src/data/needs.json. Its key is the need's id. */
export interface NeedDef {
  name: string;
  /** Shown in the customer's ticket bubble. */
  icon: string;
  /** Pays the full base price plus every stage bonus (the wash). */
  stagePay?: boolean;
  /** Otherwise pays this share of the customer's base price. */
  payFactor?: number;
}

/** What every town's map has: the ground the player walks, where pads, piles, sites and staff go, and the camera's area. */
export interface TownLayout {
  name: string;
  /** The paved car wash lot. */
  lot: Rect;
  /** Where people can walk: the lot, the road and the forecourt across it. */
  walk: Rect;
  /** Ground inside `walk` the player can't go (the grass beside the lot, when the walk reaches round it). */
  blocked: Rect[];
  /** The town round the lot (art/blender/town.py, or a prop): shops, homes, lamps; some solid, some with a name sign. */
  town: TownPiece[];
  /**
   * Routes people stroll along, end to end either way, through the town (never the lot, the forecourt or
   * a road); they may stop at a point with a `look` (the way they face). A route ending in a `turn` spot
   * is a dead end: people come from its start, walk to the turn and back.
   */
  walkways: (Point & { look?: number; turn?: boolean })[][];
  /** Trees along the streets. */
  streetTrees: Point[];
  /** More ground the player may walk and the camera show once a pad is built (the side street, after the dryer). */
  views: (Rect & { after: string })[];
  /** Raised flower beds on the lot (solid), some with trees. */
  planters: (Rect & { trees: number })[];
  cameraBase: Rect;
  playerStart: Point;
  /** Building sites (scaffolding) for pads with a construction timer: centre and size. */
  sites: Record<string, { x: number; z: number; width: number; depth: number }>;
  /** Where a pad's building stands, if not on the pad itself (the pump island between two lanes). */
  buildAt: Record<string, Point>;
  /** Ground a built pad covers beyond its own spot (the forecourt): kept flat and clear, and in view once built. */
  areas: Record<string, Rect>;
  piles: Record<string, Point>;
  pads: Record<string, Point>;
  /** Small pads that open an upgrade pop-up, keyed by panel id. */
  upgradePads: Record<string, Point>;
  /** Where each staff member stands when idle. */
  staffSpots: Record<string, Point>;
  /**
   * The manager's round, in order: a spot by each business (`after` it's built) and the point
   * to look at while making a note there.
   */
  managerRound?: (Point & { look: Point; after: string })[];
  /**
   * Benches people out walking may stop at: from a walkway's dead end (`from`, where the hedge has
   * a gap), along `via`, to a bench (one of the town's `prop_bench` pieces) to sit on for a while.
   */
  benchVisits?: { from: Point; via: Point[]; bench: Point }[];
}

/** A walk-up counter (a farm stand, a market stall): where customers are served, where they line up, and where its worker stands. */
export interface CounterSpot {
  /** The serving window: customers stand here to be served, facing it. */
  window: Point;
  /** Where a worker counts as serving (behind the counter). */
  zone: Rect;
  /** Waiting spots, front first (the first is at the window). */
  queue: Point[];
  /** Which way customers face at the window, in radians (0 = +z). */
  facing: number;
  /**
   * The way in, from the walkway to beside the back of the line: its last
   * point is where customers step into line (at the back, so first come is
   * first served).
   */
  enter: Point[];
  /**
   * The way out, from the window (its first point) to off the map. It isn't
   * the way in: customers leave forwards, never back through the line.
   */
  exit: Point[];
  /** How a customer leaving the line early (tired of waiting) steps out of it first, towards the way out. */
  aside: Point;
}

/** What a town with walk-up counters adds to its map: where people come from and walk along. */
export interface WalkUpLayout {
  /** Where visitors come onto the map (each counter's way out says where they leave it). */
  entrances: Point[];
  /** The z of the path visitors walk along from the entrances to a counter's way in. */
  walkwayZ: number;
  /** Each walk-up counter, by its pad id. */
  counters: Record<string, CounterSpot>;
}

/** Something a farm makes and sells by the crate or carton: a crop (crops.json) or another good (goods.json). */
export interface GoodDef {
  name: string;
  icon: string;
  /** What one crate or carton of it sells for at the stand. */
  price: number;
}

/** A crop, from src/data/crops.json. Its key is the crop's id. */
export interface CropDef extends GoodDef {
  /** Seconds from harvest (it's replanted at once) until it's ripe again. */
  growSeconds: number;
}

/** An animal pen's place on the map: the fenced run (or pasture) its animals roam, the work spot's table, where to stand to pack, the trough. */
export interface PenSpot {
  /** Which animals live here. */
  animal: 'hens' | 'cows';
  run: Rect;
  /** The egg table or the dairy. */
  table: Point;
  /** Stand here to pack eggs into cartons, or to bottle milk. */
  zone: Rect;
  trough: Point;
}

/** A field on the farm: its plots' middles. Every plot is the same size (PLOT). */
export interface FieldSpot {
  plots: Point[];
}

/** A farm village's map (Chapter 2): the shared map, the walk-up stand, its fields and the village round it. */
export interface FarmLayout extends TownLayout, WalkUpLayout {
  /** The village road, along x (its middle). */
  roadZ: number;
  /** The farm's fence along the road, with a gap for the gate between these x. */
  fenceZ: number;
  gate: { minX: number; maxX: number };
  /** The rest of the fence round the farm: from the road's fence down to here at either side. */
  fenceSides: { minX: number; maxX: number; maxZ: number };
  /** Dirt tracks across the farm. */
  tracks: Rect[];
  /** Each field by its pad id. */
  fields: Record<string, FieldSpot>;
  /** Each animal pen (the hen house, the cow barn) by its pad id. */
  pens: Record<string, PenSpot>;
  /** Each feed store by its pad id: where corn is tipped in. */
  feeders: Record<string, { zone: Rect }>;
  /**
   * Each van by its pad id: its way out (from where it parks, facing it, off the map), its way back (from
   * off the map to where it parks: a different way, round the farm, so it's always parked facing out),
   * and the bay where it's loaded.
   */
  vans: Record<string, { route: Point[]; back: Point[]; bay: Rect }>;
  /** The orders board, and where to stand to read it. */
  board: Point;
  boardSpot: Rect;
  /** More gaps in the fence along the road (the market's ways in and out, the vans' way out). */
  sideGates: { minX: number; maxX: number }[];
  /** The bakery's bread table, and where to stand to pick up the baking. */
  bakery: { table: Point; zone: Rect };
  /** The old windmill on its hill (restored as the landmark). */
  windmill: Point;
  /** The machines: the barn doors where crates are unloaded, and the routes the machines drive. */
  machines: {
    barnDoor: Rect;
    /** The pickup's run from where it parks, between the fields, to the barn doors. */
    pickupRoute: Point[];
    /** Behind the parked pickup's tailgate, where it's loaded. */
    pickupBay: Rect;
    /** Where the feed truck stops, out to the edge of the map. */
    feedTruckRoute: Point[];
  };
  /** The duck pond (an ellipse in this rect). */
  pond: Rect;
  /** Low hills of the countryside beyond the farm. */
  hills: { x: number; z: number; radius: number; height: number }[];
}

/**
 * A ride's place in the park (Chapter 3): visitors line up for it, step on
 * when there's a seat, and step off by its way out after the ride.
 */
export interface RideSpot {
  /** The ride's middle: its model stands here. */
  at: Point;
  /**
   * Waiting spots, front first (the first is at the ride's steps). The line
   * may snake between queue ropes: people move up it spot by spot.
   */
  queue: Point[];
  /** Where visitors step into the line, beside its back. */
  enter: Point;
  /** The way off, from the steps to the path (riders walk from their seat to its first point). */
  exit: Point[];
  /** Where the hero (or the ride operator) stands to pull the lever. */
  lever: Point;
  /** The queue ropes, each from one post to the other (two points). */
  ropes: Point[][];
}

/** A theme park's map (Chapter 3): the shared map, the ticket booth and stalls, the rides and the paths between them. */
export interface ParkLayout extends TownLayout, WalkUpLayout {
  /** The middle of the road along the top. */
  roadZ: number;
  /** The hedge round the park: along the road (open at the gate), down the sides and along the back. */
  hedgeZ: number;
  gate: { minX: number; maxX: number };
  hedgeSides: { minX: number; maxX: number; maxZ: number };
  /** Paved paths, and the entrance plaza (pastel squares). */
  paths: Rect[];
  plaza: Rect;
  /** Each ride by its pad id. */
  rides: Record<string, RideSpot>;
  /** Benches visitors may rest on, by pad id: the seats, and the way the sitters face. */
  benches: Record<string, { seats: Point[]; facing: number }>;
  /** Visitors who are done walk here, then off the map by `out` (through the gate, along the pavement). */
  leave: Point;
  out: Point[];
  /** The supply shed: the door where boxes are picked up, and the delivery truck's way in (to where it stops) and out. */
  shed: { door: Rect; truckIn: Point[]; truckOut: Point[] };
  /** The gap in the hedge where the truck drives in, and the service yard's concrete. */
  serviceGate: { minX: number; maxX: number };
  yard: Rect[];
  /** Where the litter bins stand (once there's a janitor). */
  bins: Point[];
  /** Decoration: lamps along the paths, trees, round flower beds (solid). */
  lamps: Point[];
  trees: (Point & { size?: number })[];
  flowerBeds: Point[];
}

/** The car wash town's map (Chapter 1): the shared map plus its roads, lanes, stations and forecourt. */
export interface LocationLayout extends TownLayout {
  roadZ: number;
  spawnX: number;
  /** Cars drive on the near side of the road coming in, the far side going away: each lane's middle is this far from the road's. */
  roadLane: number;
  /** The same for Bubble Lane (cars drive up its right-hand side). */
  sideLane: number;
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
  queueGap: number;
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
  paints?: string[];
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
export const STAGES = stagesJson as StageDef[];
/** Every kind of station, by kind. */
export const STATIONS = stationsJson as Record<string, StationDef>;
/** Everything a customer can come for, by id, in the order a bill adds them up. */
export const NEEDS = needsJson as Record<string, NeedDef>;
/** The hero's ranks, lowest first. */
export const RANKS = ranksJson as RankDef[];
export const TUNING: Tuning = tuningJson;
/** Who plays each role, which people file holds whom, and how fast each gait walks (art/blender/people.py). */
export const CHARACTERS = charactersJson;
export const UPGRADES = upgradesJson as UpgradesData;
export const DAILY = dailyJson as DailyData;
/** Rewarded ad rewards (and their gem prices) and interstitial limits. */
export const ADS = adsJson;
export const CONTRACTS = contractsJson as ContractsData;
/** Every crop a farm can grow, by id. */
export const CROPS = cropsJson as Record<string, CropDef>;
/** Everything a farm sells: its crops, then eggs. */
export const GOODS: Record<string, GoodDef> = { ...CROPS, ...(goodsJson as Record<string, GoodDef>) };
/** One crop plot's size on the ground (art/blender/farm.py plants it). */
export const PLOT = { width: 2.6, depth: 2.8 };

let current: TownDef = ROADSIDE;

/** The town being played: its layout, its pads (in unlock order) and its goals. */
export function town(): TownDef {
  return current;
}

/** Makes this the town being played. Call before the game is built for it. */
export function setTown(def: TownDef): void {
  current = def;
}

/** Half the gap in the lot's side hedge where each driveway goes out (art: render/terrain.ts). */
const DRIVEWAY_GAP = 1.75;
/** The side hedge starts this far in from the lot's front, leaving the pavement by the crossing open. */
export const SIDE_HEDGE_START = 5;

/** Half the width of Main Street, kerb to kerb, in metres (room for a monster truck in each lane). */
export const STREET_HALF = 2.35;
/** Half the width of Bubble Lane, the side street the cars leave by. */
export const SIDE_STREET_HALF = 2.35;

/** Which lane of the road a point is in: Main Street's far (westbound) or near (eastbound) side, Bubble Lane, or none (off the road). */
export function roadLaneAt(layout: LocationLayout, p: Point): 'west' | 'east' | 'side' | null {
  if (Math.abs(p.z - layout.roadZ) < STREET_HALF) return p.z < layout.roadZ ? 'west' : 'east';
  return p.z > layout.roadZ && Math.abs(p.x - layout.sideStreetX) < SIDE_STREET_HALF ? 'side' : null;
}

/** Half the width of a street tree's trunk. */
const TRUNK = 0.35;

/**
 * Ground nobody walks through, whatever is built: off the lot, the flower
 * beds, town pieces set on the lot, the street trees, and in the car wash
 * town the hedge along the side street (open at the driveways).
 */
export function fixedSolids(layout: TownLayout): Rect[] {
  const town = layout.town.flatMap((p) => (p.solid ? [{ minX: p.x - p.solid[0], maxX: p.x + p.solid[0], minZ: p.z - p.solid[1], maxZ: p.z + p.solid[1] }] : []));
  const trees = layout.streetTrees.map((t) => ({ minX: t.x - TRUNK, maxX: t.x + TRUNK, minZ: t.z - TRUNK, maxZ: t.z + TRUNK }));
  return [...layout.blocked, ...layout.planters, ...town, ...('exitZ' in layout ? hedge(layout as LocationLayout) : []), ...trees];
}

/** The car wash town's hedge along the side street, open where cars drive out. */
function hedge(layout: LocationLayout): Rect[] {
  const rects: Rect[] = [];
  const { lot } = layout;
  let from = lot.minZ + SIDE_HEDGE_START;
  for (const z of [...[layout.earlyExitZ, layout.exitZ].sort((a, b) => a - b), lot.maxZ + DRIVEWAY_GAP + 1]) {
    if (z - DRIVEWAY_GAP > from) rects.push({ minX: lot.maxX + 0.1, maxX: lot.maxX + 0.8, minZ: from, maxZ: z - DRIVEWAY_GAP });
    from = z + DRIVEWAY_GAP;
  }
  return rects;
}

/** A pad of the town being played. */
export function padById(id: string): PadDef | undefined {
  return current.pads.find((pad) => pad.id === id);
}

/** A station kind's definition; throws for a kind stations.json doesn't have. */
export function stationDef(kind: string): StationDef {
  const def = STATIONS[kind];
  if (!def) throw new Error(`Unknown station kind: ${kind}`);
  return def;
}

export function stageById(id: string): StageDef | undefined {
  return STAGES.find((stage) => stage.id === id);
}
