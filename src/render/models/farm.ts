// Willowbrook's buildings, props and crops, modelled in Blender
// (art/blender/farm.py) in two files: the buildings, and the props and crops.
import { BoxGeometry, Group, Mesh, type Object3D } from 'three';
import { PLOT, type Point } from '../../core/config';
import type { Crops, Plot } from '../../systems/crops';
import { asset, hasModel } from '../assets';
import { mergeParts, toyMaterial, type Part } from './build';
import { plate } from './kit';

const FILES = ['building:farm', 'building:farm-props', 'building:farm-poultry', 'building:farm-dairy', 'building:farm-machines'];

/** The named model's node in whichever farm file has it (not a copy). */
export function farmPiece(name: string): Object3D {
  for (const file of FILES) {
    const found = hasModel(file) ? asset(file).scene.getObjectByName(name) : undefined;
    if (found) return found;
  }
  throw new Error(`No farm model called ${name}`);
}

/** A copy of a model, standing on its own base at the origin (quantizing moved the mesh's own node). */
export function farmModel(name: string): Object3D {
  const copy = farmPiece(name).clone(true);
  copy.position.set(0, 0, 0);
  copy.traverse((node) => {
    if (node instanceof Mesh) node.material = toyMaterial;
  });
  return copy;
}

/** Which model each of the farm's pads shows once built (fields and staff have their own). */
const PAD_MODELS: Record<string, string> = {
  stand: 'fm_stand',
  well: 'fm_well',
  barn: 'fm_barn',
  gate: 'fm_gate',
  henhouse: 'fm_henhouse',
  feedstore: 'fm_feedstore',
  cowbarn: 'fm_cowbarn',
  tractor: 'fm_shed',
};

/** Sign boards painted in the game (art/blender/farm.py leaves them blank): words, colour, middle and size. */
const SIGNS: Record<string, { text: string; color: string; y: number; z: number; width: number; height: number }> = {
  stand: { text: 'FRESH PRODUCE', color: '#3f7a5a', y: 2.75, z: 0.0, width: 2.05, height: 0.4 },
  gate: { text: 'WILLOWBROOK FARM', color: '#3f7a5a', y: 2.9, z: 0.12, width: 4.9, height: 0.62 },
  cowbarn: { text: 'WILLOWBROOK DAIRY', color: '#3f7a5a', y: 3.55, z: 2.33, width: 3.2, height: 0.5 },
};

/** Pads whose building is turned (radians about the vertical): the machinery shed opens west, onto the yard. */
export const FARM_TURNS: Record<string, number> = { tractor: -Math.PI / 2 };

export function farmPadModel(id: string): Object3D | null {
  const name = PAD_MODELS[id];
  if (!name) return null;
  const model = farmModel(name);
  const painted = SIGNS[id];
  if (painted) {
    const sign = plate(painted.text, painted.width, painted.height, painted.color, false);
    sign.position.set(0, painted.y, painted.z);
    model.add(sign);
  }
  return model;
}

/**
 * What the player can't walk through, per pad, as boxes of half width, half
 * depth and an offset from the pad: the stand's counter, back shelf and
 * chalkboard (its sides are open, for whoever works it), the well, the
 * barn, the gate's posts.
 */
export const FARM_SOLIDS: Record<string, [number, number, number?, number?][]> = {
  stand: [
    [1.6, 0.3, 0, 0.6],
    [1.5, 0.25, 0, -0.85],
    [0.35, 0.2, -2.2, 0.9],
  ],
  well: [[0.95, 0.95]],
  barn: [[4.2, 3.4]],
  gate: [
    [0.25, 0.25, -2.4, 0],
    [0.25, 0.25, 2.4, 0],
  ],
  // The coop and its nest boxes along the front (its run is solid too: see the farm game).
  henhouse: [
    [2.15, 1.55],
    [1.75, 0.4, 0.1, 1.75],
  ],
  // The cow barn's walls (its stalls open to the front, but nobody walks in).
  cowbarn: [[3.5, 2.4]],
  // The machinery shed's back wall and sides (it's turned to open west, onto the yard; the tractor parks inside).
  tractor: [
    [0.2, 3.5, 2.95, 0],
    [3.1, 0.2, 0, -3.35],
    [3.1, 0.2, 0, 3.35],
  ],
  // The shed, the silo behind it and the hopper in front.
  feedstore: [
    [1.4, 1.1, 0, -0.2],
    [0.85, 0.85, 1.9, -1.6],
    [0.75, 0.3, 0, 1.15],
  ],
};

const SOIL = '#7a5236';
const FURROW = '#664229';
const EDGE = '#5aa548';

/** A plot's ploughed bed: dark soil, a raised furrow under each row of plants, a grass edge. */
function bed(at: Point): Part[] {
  const parts: Part[] = [
    { geometry: new BoxGeometry(PLOT.width + 0.3, 0.05, PLOT.depth + 0.3), color: EDGE, x: at.x, y: 0.0, z: at.z },
    { geometry: new BoxGeometry(PLOT.width, 0.08, PLOT.depth), color: SOIL, x: at.x, y: 0.03, z: at.z },
  ];
  // The plants stand in three rows, 0.9 apart (art/blender/farm.py).
  for (const dz of [-0.9, 0, 0.9]) parts.push({ geometry: new BoxGeometry(PLOT.width - 0.2, 0.08, 0.42), color: FURROW, x: at.x, y: 0.09, z: at.z + dz });
  return parts;
}

/** Crop stage models by crop (art/blender/farm.py): sprouts, growing, ripe. */
const STAGES: Record<string, string[]> = {
  veg: ['fm_veg_1', 'fm_veg_2', 'fm_veg_3'],
  corn: ['fm_corn_1', 'fm_corn_2', 'fm_corn_3'],
};
/** Grown this far, a plot shows its middle stage. */
const MIDDLE = 0.4;

interface PlotView {
  plot: Plot;
  stages: Object3D[];
  shown: number;
  bob: number;
}

/**
 * The fields as drawn: each plot's bed and its plants at the stage they've
 * grown to. Ripe plants sway gently; a plot being harvested shrinks into
 * its crate.
 */
export class CropPlots {
  readonly group = new Group();
  private readonly views: PlotView[] = [];
  private time = 0;

  constructor(private readonly crops: Crops) {
    this.group.name = 'crops';
  }

  /** Draws a newly planted field (its plots are already in `crops`). */
  addField(padId: string): void {
    const plots = this.crops.plots.filter((p) => p.field === padId && !this.views.some((v) => v.plot === p));
    if (plots.length === 0) return;
    const soil = new Mesh(mergeParts(plots.flatMap((p) => bed(p.at))), toyMaterial);
    soil.receiveShadow = true;
    soil.name = `soil:${padId}`;
    this.group.add(soil);
    plots.forEach((plot, i) => {
      const stages = STAGES[plot.crop]!.map((name) => {
        const model = farmModel(name);
        model.position.set(plot.at.x, 0.1, plot.at.z);
        model.visible = false;
        model.traverse((node) => (node.receiveShadow = true));
        this.group.add(model);
        return model;
      });
      this.views.push({ plot, stages, shown: -1, bob: i * 1.3 });
    });
  }

  /** Shows each plot's stage for `now` (wall-clock ms). */
  update(dt: number, now: number): void {
    this.time += dt;
    const harvesting = new Map<Plot, number>();
    for (const { plot, progress } of this.crops.harvesting.values()) harvesting.set(plot, Math.max(harvesting.get(plot) ?? 0, progress));
    for (const view of this.views) {
      const growth = this.crops.growth(view.plot, now);
      const stage = growth >= 1 ? 2 : growth >= MIDDLE ? 1 : 0;
      if (stage !== view.shown) {
        view.stages.forEach((s, i) => (s.visible = i === stage));
        view.shown = stage;
      }
      const model = view.stages[stage]!;
      const picked = harvesting.get(view.plot) ?? 0;
      if (picked > 0) {
        model.scale.set(1, Math.max(0.2, 1 - picked * 0.8), 1);
      } else if (stage === 2) {
        // Ripe: a gentle sway, so the eye finds what's ready.
        const sway = Math.sin(this.time * 2.2 + view.bob) * 0.04;
        model.scale.set(1 + sway, 1 - sway, 1 + sway);
      } else {
        // Growing: the plants swell as they near the next stage.
        const into = stage === 0 ? growth / MIDDLE : (growth - MIDDLE) / (1 - MIDDLE);
        model.scale.set(1, 0.7 + 0.3 * into, 1);
      }
    }
  }
}
