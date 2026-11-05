// Town 2, Beach Boardwalk: its own chunk, downloaded when the hero travels there.
import layout from '../data/towns/beach/layout.json';
import pads from '../data/towns/beach/pads.json';
import goals from '../data/towns/beach/goals.json';
import story from '../data/towns/beach/story.json';
import type { BoardwalkLayout, GoalsData, PadDef } from './config';
import type { StoryData } from '../systems/story';
import type { BoardwalkTown } from './towns';

export const BEACH: BoardwalkTown = {
  id: 'beach',
  kind: 'boardwalk',
  layout: layout as BoardwalkLayout,
  pads: pads as PadDef[],
  goals: goals as GoalsData,
  story: story as StoryData,
  models: {
    'building:boardwalk': 'models/buildings/boardwalk.glb',
    'building:town-shops': 'models/buildings/town-shops.glb',
  },
};
