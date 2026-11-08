// Willowbrook's buildings, props, crops, animals and vehicles, modelled in
// Blender (art/blender/farm.py), in several files (each under 512 KiB).
import { Box3, BoxGeometry, Group, Mesh, Vector3, type Object3D } from 'three';
import { PLOT, type Point } from '../../core/config';
import type { Crops, Plot } from '../../systems/crops';
import { asset, hasModel } from '../assets';
import { swayMaterial } from '../wind';
import { blobShadow } from './actors';
import { mergeParts, skinnedToyMaterial, toyMaterial, type Part } from './build';
import { rigidSkin } from './rigid';
import { plate } from './kit';

const FILES = [
  'building:farm',
  'building:farm-village',
  'building:farm-props',
  'building:farm-poultry',
  'building:farm-dairy',
  'building:farm-vehicles',
  'building:farm-machines',
  'building:farm-valley',
];

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

/**
 * A copy of an animal or a machine: its moving parts drawn as one (rigid.ts),
 * with a soft blob shadow under it, like the people and cars. The sun's
 * shadows are drawn once, for what stays put: a moving thing's would be left
 * behind where it stood.
 */
export function farmMover(name: string, shadow: 'round' | 'box' = 'round'): Object3D {
  const model = farmModel(name);
  const size = new Box3().setFromObject(model).getSize(new Vector3());
  rigidSkin(model, toyMaterial, name, skinnedToyMaterial);
  model.traverse((node) => {
    node.castShadow = false;
    node.receiveShadow = true;
  });
  model.add(
    shadow === 'box'
      ? blobShadow(size.x + size.y * 0.35, size.z + size.y * 0.2, size.y, 'box')
      : blobShadow(size.x * 1.2, size.z * 1.15, size.y),
  );
  return model;
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
  bakery: 'fm_bakery',
  market: 'fm_market',
};

/** Sign boards painted in the game (art/blender/farm.py leaves them blank): words, colour, middle and size. */
const SIGNS: Record<string, { text: string; color: string; y: number; z: number; width: number; height: number }> = {
  stand: { text: 'FRESH PRODUCE', color: '#3f7a5a', y: 2.75, z: 0.0, width: 2.05, height: 0.4 },
  gate: { text: 'WILLOWBROOK FARM', color: '#3f7a5a', y: 2.9, z: 0.12, width: 4.9, height: 0.62 },
  cowbarn: { text: 'WILLOWBROOK DAIRY', color: '#3f7a5a', y: 3.55, z: 2.33, width: 3.2, height: 0.5 },
  bakery: { text: 'FARM BAKERY', color: '#3f7a5a', y: 2.75, z: 1.74, width: 3.4, height: 0.45 },
  market: { text: "FARMERS' MARKET", color: '#d8432f', y: 3.45, z: -1.85, width: 3.2, height: 0.5 },
};


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
  // The bakery's walls, and the bread table in front.
  bakery: [
    [2.6, 2.1, 0, -0.4],
    [1.15, 0.45, -0.9, 2.7],
  ],
  // The market's counters, and the shelves behind them (whoever serves stands between).
  market: [
    [3.6, 0.35, 0, 0.3],
    [3.6, 0.25, 0, -1.35],
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

/** Crop stage models by crop (art/blender/farm.py): sprouts, growing, ripe ('' for nothing). */
const STAGES: Record<string, string[]> = {
  veg: ['fm_veg_1', 'fm_veg_2', 'fm_veg_3'],
  corn: ['fm_corn_1', 'fm_corn_2', 'fm_corn_3'],
  apple: ['', 'fm_apple_blossom', 'fm_apple_fruit'],
};
/** Crops that grow on something that stays, picked or not (the apple trees): the stages come and go on it. */
const STANDING: Record<string, string> = { apple: 'fm_apple_tree' };
/** Crops grown in grass, not ploughed beds (trees). */
const NO_BED = new Set(['apple']);
/** Grown this far, a plot shows its middle stage. */
const MIDDLE = 0.4;

interface PlotView {
  plot: Plot;
  stages: Object3D[];
  shown: number;
  bob: number;
  /** A new stage pops up: 1 when it appears, down to 0. */
  pop: number;
}

/** How much plants sway in the breeze (render/wind.ts): trees stand tall, so less. */
const SWAY: Record<string, number> = { veg: 0.05, corn: 0.05, apple: 0.012 };
/** Seconds a new stage takes to pop up. */
const POP_SECONDS = 0.45;

/**
 * The fields as drawn: each plot's bed and its plants at the stage they've
 * grown to (an apple tree stands for good; its blossom and apples come and
 * go). Plants sway in the breeze and pop up into each new stage; ripe ones
 * swell gently; what's being harvested shrinks into its crate.
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
    const beds = plots.filter((p) => !NO_BED.has(p.crop));
    if (beds.length > 0) {
      const soil = new Mesh(mergeParts(beds.flatMap((p) => bed(p.at))), toyMaterial);
      soil.receiveShadow = true;
      soil.name = `soil:${padId}`;
      this.group.add(soil);
    }
    plots.forEach((plot, i) => {
      const sway = swayMaterial(SWAY[plot.crop] ?? 0.03);
      const place = (model: Object3D): Object3D => {
        model.position.set(plot.at.x, 0.1, plot.at.z);
        model.traverse((node) => {
          node.receiveShadow = true;
          if (node instanceof Mesh) node.material = sway;
        });
        this.group.add(model);
        return model;
      };
      const standing = STANDING[plot.crop];
      if (standing) place(farmModel(standing));
      const stages = STAGES[plot.crop]!.map((name) => {
        const model = place(name ? farmModel(name) : new Group());
        model.visible = false;
        return model;
      });
      this.views.push({ plot, stages, shown: -1, bob: i * 1.3, pop: 0 });
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
        if (view.shown !== -1) view.pop = 1;
        view.shown = stage;
      }
      const model = view.stages[stage]!;
      const picked = harvesting.get(view.plot) ?? 0;
      // Popping up into a new stage: from half size, a little past full, and settling.
      view.pop = Math.max(0, view.pop - dt / POP_SECONDS);
      const k = 1 - view.pop;
      const pop = view.pop > 0 ? 0.5 + 0.5 * k + 0.22 * Math.sin(k * Math.PI) : 1;
      if (picked > 0) {
        model.scale.set(1, Math.max(0.2, 1 - picked * 0.8), 1);
      } else if (stage === 2) {
        // Ripe: a gentle swell, so the eye finds what's ready.
        const sway = Math.sin(this.time * 2.2 + view.bob) * 0.04;
        model.scale.set((1 + sway) * pop, (1 - sway) * pop, (1 + sway) * pop);
      } else {
        // Growing: the plants swell as they near the next stage.
        const into = stage === 0 ? growth / MIDDLE : (growth - MIDDLE) / (1 - MIDDLE);
        model.scale.set(pop, (0.7 + 0.3 * into) * pop, pop);
      }
    }
  }
}
