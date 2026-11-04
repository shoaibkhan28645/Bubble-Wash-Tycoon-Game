// The towns of the empire. Each town's data lives in src/data/towns/<id>/:
// layout.json (the map), pads.json (what can be built, in order) and
// goals.json (the town goals). The first town ships in the main bundle;
// every later town is a dynamic import(), so Vite gives it its own chunk
// and it only downloads when the player travels there.
import roadsideLayout from '../data/towns/roadside/layout.json';
import roadsidePads from '../data/towns/roadside/pads.json';
import roadsideGoals from '../data/towns/roadside/goals.json';
import type { GoalsData, LocationLayout, PadDef } from './config';

export interface TownDef {
  /** Stable id: the data folder's name, and the key a save will use for this town. */
  id: string;
  /** The town's map: lot, roads, buildings, where every pad and station stands. */
  layout: LocationLayout;
  /** Everything that can be built here, in unlock order. */
  pads: PadDef[];
  goals: GoalsData;
  /** The town's own building models (id → path under public/), loaded on arrival and dropped on leaving. */
  models: Record<string, string>;
}

/** Town 1, Dusty Roadside Lot: the car wash, fuel pumps and Mini-Mart. */
export const ROADSIDE: TownDef = {
  id: 'roadside',
  layout: roadsideLayout as LocationLayout,
  pads: roadsidePads as PadDef[],
  goals: roadsideGoals as GoalsData,
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

/**
 * How to fetch each town, in journey order. A later town is added as
 * `beach: () => import('../data/towns/beach').then((m) => m.BEACH)`.
 */
const LOADERS: Record<string, () => Promise<TownDef>> = {
  roadside: () => Promise.resolve(ROADSIDE),
};

/** Town ids in the order the hero reaches them. */
export function townIds(): string[] {
  return Object.keys(LOADERS);
}

/** Adds a town at run time (the `?debug` panel's test town, to try travelling). */
export function registerTown(id: string, load: () => Promise<TownDef>): void {
  LOADERS[id] = load;
}

/** Fetches a town's data (downloading its chunk the first time). Rejects for an unknown id. */
export function loadTown(id: string): Promise<TownDef> {
  const load = LOADERS[id];
  return load ? load() : Promise.reject(new Error(`Unknown town: ${id}`));
}
