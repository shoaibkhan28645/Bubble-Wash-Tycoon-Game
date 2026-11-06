// Willowbrook (Chapter 2): its data must fit together, and fit the farm's systems.
import { describe, expect, it } from 'vitest';
import { CHARACTERS, CROPS, PLOT, UPGRADES, stationDef, type Rect } from '../src/core/config';
import { WILLOWBROOK } from '../src/core/willowbrook';
import { townIds } from '../src/core/towns';
import { t, type StringKey } from '../src/ui/strings';

const { layout, pads, goals, story } = WILLOWBROOK;
const padIds = pads.map((p) => p.id);
const modelFiles = Object.keys(import.meta.glob('../public/models/**/*.glb')).map((f) => f.replace('../public/', ''));
/** The farm's Blender files as text (their JSON part names every model). */
const farmFiles = Object.values(import.meta.glob<string>('../public/models/buildings/farm*.glb', { query: '?raw', import: 'default', eager: true })).join('');
const overlaps = (a: Rect, b: Rect) => a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
const plotRect = (p: { x: number; z: number }): Rect => ({ minX: p.x - PLOT.width / 2, maxX: p.x + PLOT.width / 2, minZ: p.z - PLOT.depth / 2, maxZ: p.z + PLOT.depth / 2 });

describe('Willowbrook', () => {
  it('comes after the roadside lot, which sends its truck there', () => {
    expect(townIds().slice(0, 2)).toEqual(['roadside', 'willowbrook']);
    expect(WILLOWBROOK.kind).toBe('farm');
  });

  it('opens with the stand and a ripe vegetable field for free, then costs only go up, ending at the gate sign', () => {
    expect(pads.slice(0, 2).map((p) => [p.id, p.cost])).toEqual([
      ['stand', 0],
      ['field1', 0],
    ]);
    expect(pads[0]!.effects.counter).toBe('stand');
    expect(pads[1]!.effects.field).toBe('veg');
    for (let i = 3; i < pads.length; i++) expect(pads[i]!.cost).toBeGreaterThan(pads[i - 1]!.cost);
    expect(pads.at(-1)!.effects.endOfContent).toBe(true);
    expect(new Set(padIds).size).toBe(padIds.length);
  });

  it('places every pad, and every field has plots of a crop that exists', () => {
    for (const id of padIds) expect(layout.pads[id], id).toBeDefined();
    for (const pad of pads) {
      if (!pad.effects.field) continue;
      expect(CROPS[pad.effects.field], pad.id).toBeDefined();
      expect(layout.fields[pad.id]?.plots.length, pad.id).toBe(6);
    }
  });

  it('keeps plots apart, off the tracks, and clear of the stand and its line', () => {
    const plots = Object.values(layout.fields).flatMap((f) => f.plots.map(plotRect));
    for (let i = 0; i < plots.length; i++) for (let j = i + 1; j < plots.length; j++) expect(overlaps(plots[i]!, plots[j]!)).toBe(false);
    const stand = layout.counters.stand!;
    const line: Rect = { minX: stand.zone.minX - 0.5, maxX: stand.zone.maxX + 0.5, minZ: stand.zone.minZ, maxZ: stand.queue.at(-1)!.z };
    for (const plot of plots) {
      for (const track of layout.tracks) expect(overlaps(plot, track)).toBe(false);
      expect(overlaps(plot, line)).toBe(false);
    }
  });

  it("gives the stand a line as long as it takes, starting at its window, and a cash pile", () => {
    const stand = layout.counters.stand!;
    expect(stand.queue[0]).toEqual(stand.window);
    expect(stand.queue.length).toBeGreaterThanOrEqual(stationDef('stand').queueSpots ?? 1);
    expect(layout.piles.stand).toBeDefined();
  });

  it('hires the stand helper and the farmhand, with somewhere to stand and a character each', () => {
    for (const role of ['standhand', 'farmhand'] as const) {
      expect(pads.find((p) => p.id === role)?.effects.staff).toBe(role);
      expect(layout.staffSpots[role]).toBeDefined();
      expect(modelFiles).toContain(`models/people/character-${CHARACTERS.staff[role]}.glb`);
    }
    for (const person of CHARACTERS.villagers) expect(modelFiles).toContain(`models/people/character-${person}.glb`);
  });

  it("puts the walk's edges on the staff grid's half-metre cells, and keeps pads apart", () => {
    for (const edge of [layout.walk.minX, layout.walk.minZ]) expect(Number.isInteger(edge * 2)).toBe(true);
    const spots = Object.values(layout.pads);
    for (let i = 0; i < spots.length; i++)
      for (let j = i + 1; j < spots.length; j++) expect(Math.max(Math.abs(spots[i]!.x - spots[j]!.x), Math.abs(spots[i]!.z - spots[j]!.z))).toBeGreaterThan(2.5);
  });

  it('has every farm model it places, plus the crop stages', () => {
    const names = [...layout.town.map((p) => p.model).filter((m) => m.startsWith('fm_')), 'fm_stand', 'fm_well', 'fm_barn', 'fm_gate', 'fm_duck'];
    for (const crop of ['veg', 'corn']) for (const stage of [1, 2, 3]) names.push(`fm_${crop}_${stage}`);
    for (const name of new Set(names)) expect(farmFiles.includes(`"name":"${name}"`), name).toBe(true);
    for (const path of Object.values(WILLOWBROOK.models)) expect(modelFiles).toContain(path);
  });

  it('offers upgrades for things that exist', () => {
    for (const id of Object.keys(layout.upgradePads)) {
      expect(padIds).toContain(id);
      for (const key of UPGRADES.panels[id] ?? []) {
        const [target, kind] = key.split('.') as [string, string];
        expect(UPGRADES.kinds[kind], key).toBeDefined();
        expect(target === 'player' || padIds.includes(target), key).toBe(true);
      }
    }
  });

  it('has goals with text on real pads, and a story told about real pads', () => {
    for (const goal of goals.goals) {
      expect(t(`goal_${goal.id}` as StringKey)).not.toContain('goal_');
      if (goal.built) expect(padIds).toContain(goal.built);
    }
    for (const beat of story.beats) if (beat.when.built) expect(padIds).toContain(beat.when.built);
  });
});
