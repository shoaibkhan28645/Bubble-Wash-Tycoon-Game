// Town 4, Skyport International: its own chunk, downloaded when the hero travels there.
import layout from '../data/towns/skyport/layout.json';
import pads from '../data/towns/skyport/pads.json';
import goals from '../data/towns/skyport/goals.json';
import story from '../data/towns/skyport/story.json';
import type { AirportLayout, GoalsData, PadDef } from './config';
import type { StoryData } from '../systems/story';
import type { AirportTown } from './towns';

export const SKYPORT: AirportTown = {
  id: 'skyport',
  kind: 'airport',
  layout: layout as AirportLayout,
  pads: pads as PadDef[],
  goals: goals as GoalsData,
  story: story as StoryData,
  // Everything here is built in code (render/models/airport.ts): no model files to fetch.
  models: {},
};
