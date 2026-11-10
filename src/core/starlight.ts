// Town 3, Starlight Fun Park: its own chunk, downloaded when the hero travels there.
import layout from '../data/towns/starlight/layout.json';
import pads from '../data/towns/starlight/pads.json';
import goals from '../data/towns/starlight/goals.json';
import story from '../data/towns/starlight/story.json';
import type { GoalsData, PadDef, ParkLayout } from './config';
import type { StoryData } from '../systems/story';
import type { ParkTown } from './towns';

export const STARLIGHT: ParkTown = {
  id: 'starlight',
  kind: 'park',
  layout: layout as ParkLayout,
  pads: pads as PadDef[],
  goals: goals as GoalsData,
  story: story as StoryData,
  models: {
    'building:park': 'models/buildings/park.glb',
    'building:park-midway': 'models/buildings/park-midway.glb',
    'building:park-carousel': 'models/buildings/park-carousel.glb',
    'building:park-teacups': 'models/buildings/park-teacups.glb',
    'building:park-bumper': 'models/buildings/park-bumper.glb',
    'building:park-lakeside': 'models/buildings/park-lakeside.glb',
    'building:park-swings': 'models/buildings/park-swings.glb',
    'building:park-boats': 'models/buildings/park-boats.glb',
    'building:park-haunted': 'models/buildings/park-haunted.glb',
    'building:town-shops': 'models/buildings/town-shops.glb',
    'building:town-homes': 'models/buildings/town-homes.glb',
  },
};
