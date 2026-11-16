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
  // Made in Blender (art/blender/skyport_*.py), each file under 512 KiB; the taxis are the town's cabs.
  models: {
    'building:skyport-plane': 'models/buildings/skyport-plane.glb',
    'building:skyport-apron': 'models/buildings/skyport-apron.glb',
    'building:skyport-vehicles': 'models/buildings/skyport-vehicles.glb',
    'building:skyport-hall': 'models/buildings/skyport-hall.glb',
    'building:skyport-field': 'models/buildings/skyport-field.glb',
    'building:skyport-terminal': 'models/buildings/skyport-terminal.glb',
    'building:skyport-name': 'models/buildings/skyport-name.glb',
    'cars:special-taxi': 'models/cars/special-taxi.glb',
  },
};
