// Town 2, Willowbrook: its own chunk, downloaded when the hero travels there.
import layout from '../data/towns/willowbrook/layout.json';
import pads from '../data/towns/willowbrook/pads.json';
import goals from '../data/towns/willowbrook/goals.json';
import story from '../data/towns/willowbrook/story.json';
import type { FarmLayout, GoalsData, PadDef } from './config';
import type { StoryData } from '../systems/story';
import type { FarmTown } from './towns';

export const WILLOWBROOK: FarmTown = {
  id: 'willowbrook',
  kind: 'farm',
  layout: layout as FarmLayout,
  pads: pads as PadDef[],
  goals: goals as GoalsData,
  story: story as StoryData,
  models: {
    'building:farm': 'models/buildings/farm.glb',
    'building:farm-props': 'models/buildings/farm-props.glb',
    'building:farm-poultry': 'models/buildings/farm-poultry.glb',
    'building:farm-dairy': 'models/buildings/farm-dairy.glb',
    'building:farm-machines': 'models/buildings/farm-machines.glb',
    'building:town-shops': 'models/buildings/town-shops.glb',
    'building:town-homes': 'models/buildings/town-homes.glb',
  },
};
