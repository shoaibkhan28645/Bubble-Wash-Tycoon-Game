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
    'building:park-carousel': 'models/buildings/park-carousel.glb',
    'building:town-shops': 'models/buildings/town-shops.glb',
    'building:town-homes': 'models/buildings/town-homes.glb',
  },
};
