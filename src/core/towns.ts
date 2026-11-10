// The towns of the empire. Each town's data lives in src/data/towns/<id>/:
// layout.json (the map), pads.json (what can be built, in order) and
// goals.json (the town goals). The first town ships in the main bundle;
// every later town is a dynamic import(), so Vite gives it its own chunk
// and it only downloads when the player travels there.
import roadsideLayout from '../data/towns/roadside/layout.json';
import roadsidePads from '../data/towns/roadside/pads.json';
import roadsideGoals from '../data/towns/roadside/goals.json';
import roadsideStory from '../data/towns/roadside/story.json';
import type { FarmLayout, GoalsData, LocationLayout, PadDef, ParkLayout } from './config';
import type { StoryData } from '../systems/story';

/** What every town has, whatever its kind. */
interface TownBase {
  /** Stable id: the data folder's name, and the key a save will use for this town. */
  id: string;
  /** Everything that can be built here, in unlock order. */
  pads: PadDef[];
  goals: GoalsData;
  /** The town's story: its paper, mentor, rival and beats. */
  story: StoryData;
  /** The town's own building models (id → path under public/), loaded on arrival and dropped on leaving. */
  models: Record<string, string>;
}

/** A car wash town (Chapter 1): cars drive in off the road to the bays, the pumps and the Mini-Mart. */
export interface RoadsideTown extends TownBase {
  kind: 'carWash';
  layout: LocationLayout;
}

/** A farm village (Chapter 2): crops in the fields, sold to villagers on foot at the farm stand. */
export interface FarmTown extends TownBase {
  kind: 'farm';
  layout: FarmLayout;
}

/** A theme park (Chapter 3): visitors buy tickets, then ride the rides and visit the stalls on their wish lists. */
export interface ParkTown extends TownBase {
  kind: 'park';
  layout: ParkLayout;
}

/** Every kind of town the game can build. */
export type TownDef = RoadsideTown | FarmTown | ParkTown;

/** Town 1, Dusty Roadside Lot: the car wash, fuel pumps and Mini-Mart. */
export const ROADSIDE: RoadsideTown = {
  id: 'roadside',
  kind: 'carWash',
  layout: roadsideLayout as LocationLayout,
  pads: roadsidePads as PadDef[],
  goals: roadsideGoals as GoalsData,
  story: roadsideStory as StoryData,
  models: {
    // Buildings modelled in Blender (art/blender).
    'building:tunnel': 'models/buildings/tunnel.glb',
    'building:wash-bay': 'models/buildings/wash-bay.glb',
    'building:fuel-canopy': 'models/buildings/fuel-canopy.glb',
    'building:fuel-pump': 'models/buildings/fuel-pump.glb',
    'building:dryer': 'models/buildings/dryer.glb',
    'building:wax': 'models/buildings/wax.glb',
    'building:detailing': 'models/buildings/detailing.glb',
    'building:mini-mart': 'models/buildings/mini-mart.glb',
    'building:props': 'models/buildings/props.glb',
    'building:landmark': 'models/buildings/landmark.glb',
    'building:town-shops': 'models/buildings/town-shops.glb',
    'building:town-homes': 'models/buildings/town-homes.glb',
  },
};

/** The town a new game starts in. */
export const START_TOWN_ID = ROADSIDE.id;

/** How to fetch each town, in journey order. */
const LOADERS: Record<string, () => Promise<TownDef>> = {
  roadside: () => Promise.resolve(ROADSIDE),
  willowbrook: () => import('./willowbrook').then((m) => m.WILLOWBROOK),
  starlight: () => import('./starlight').then((m) => m.STARLIGHT),
};

/** Town ids in the order the hero reaches them. */
export function townIds(): string[] {
  return Object.keys(LOADERS);
}

/** Adds a town at run time (the `?debug` panel's test town, to try travelling). */
export function registerTown(id: string, load: () => Promise<TownDef>): void {
  LOADERS[id] = load;
}

const loaded = new Map<string, TownDef>([[ROADSIDE.id, ROADSIDE]]);

/** Fetches a town's data (downloading its chunk the first time). Rejects for an unknown id. */
export async function loadTown(id: string): Promise<TownDef> {
  const load = LOADERS[id];
  if (!load) throw new Error(`Unknown town: ${id}`);
  const def = await load();
  loaded.set(id, def);
  return def;
}

/** A town's data if it has been loaded (the first town always is). */
export function loadedTown(id: string): TownDef | undefined {
  return loaded.get(id);
}
