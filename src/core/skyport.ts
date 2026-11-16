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
  // Made in Blender (art/blender/skyport_*.py), each file under 512 KiB; the taxis are the town's cabs. (The
  // terminal's wing, shops and kitchen and the jet come with the rest: a save can be there already.)
  models: {
    'building:skyport-plane': 'models/buildings/skyport-plane.glb',
    'building:skyport-jet': 'models/buildings/skyport-jet.glb',
    'building:skyport-wing': 'models/buildings/skyport-wing.glb',
    'building:skyport-shops': 'models/buildings/skyport-shops.glb',
    'building:skyport-kitchen': 'models/buildings/skyport-kitchen.glb',
    'building:skyport-wide': 'models/buildings/skyport-wide.glb',
    'building:skyport-private': 'models/buildings/skyport-private.glb',
    'building:skyport-tower': 'models/buildings/skyport-tower.glb',
    'building:skyport-pier': 'models/buildings/skyport-pier.glb',
    'building:skyport-vip': 'models/buildings/skyport-vip.glb',
    'building:skyport-mogul': 'models/buildings/skyport-mogul.glb',
    'building:skyport-shuttle': 'models/buildings/skyport-shuttle.glb',
    'building:skyport-apron': 'models/buildings/skyport-apron.glb',
    'building:skyport-vehicles': 'models/buildings/skyport-vehicles.glb',
    'building:skyport-hall': 'models/buildings/skyport-hall.glb',
    'building:skyport-field': 'models/buildings/skyport-field.glb',
    'building:skyport-terminal': 'models/buildings/skyport-terminal.glb',
    'building:skyport-name': 'models/buildings/skyport-name.glb',
    'cars:special-taxi': 'models/cars/special-taxi.glb',
  },
};
