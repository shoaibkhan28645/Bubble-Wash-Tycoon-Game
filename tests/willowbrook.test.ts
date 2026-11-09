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

  it('opens with the stand and a ripe vegetable field for free, then costs only go up, ending at the road to the next town', () => {
    expect(pads.slice(0, 2).map((p) => [p.id, p.cost])).toEqual([
      ['stand', 0],
      ['field1', 0],
    ]);
    expect(pads[0]!.effects.counter).toBe('stand');
    expect(pads[1]!.effects.field).toBe('veg');
    for (let i = 3; i < pads.length; i++) expect(pads[i]!.cost).toBeGreaterThan(pads[i - 1]!.cost);
    expect(pads.at(-1)).toMatchObject({ id: 'road', afterGoals: true, effects: { travel: 'market' } });
    expect(pads.filter((p) => p.effects.endOfContent)).toEqual([]);
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
    for (const role of ['standhand', 'farmhand', 'eggcollector', 'milker'] as const) {
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
    names.push('fm_henhouse', 'fm_eggtable', 'fm_hen', 'fm_hen_brown', 'fm_trough', 'fm_feedstore');
    names.push('fm_cowbarn', 'fm_cow', 'fm_cow_brown', 'fm_dairy', 'fm_van', 'fm_tanker', 'fm_orders');
    names.push('fm_pickup', 'fm_feedtruck');
    for (const crop of ['veg', 'corn']) for (const stage of [1, 2, 3]) names.push(`fm_${crop}_${stage}`);
    for (const name of new Set(names)) expect(farmFiles.includes(`"name":"${name}"`), name).toBe(true);
    for (const path of Object.values(WILLOWBROOK.models)) expect(modelFiles).toContain(path);
  });

  it('gives the hen house its run, egg table and trough, and the feed store a place to tip corn, clear of everything else', () => {
    const coop = pads.find((p) => p.effects.pen === 'hens')!;
    const feeder = pads.find((p) => p.effects.feeder)!;
    expect(padIds.indexOf(coop.id)).toBeLessThan(padIds.indexOf('eggcollector'));
    expect(padIds.indexOf('eggcollector')).toBeLessThan(padIds.indexOf(feeder.id));
    const spot = layout.pens[coop.id]!;
    const inside = (r: Rect, outer: Rect) => r.minX >= outer.minX && r.maxX <= outer.maxX && r.minZ >= outer.minZ && r.maxZ <= outer.maxZ;
    expect(spot.trough.x > spot.run.minX && spot.trough.x < spot.run.maxX && spot.trough.z > spot.run.minZ && spot.trough.z < spot.run.maxZ).toBe(true);
    for (const zone of [spot.zone, layout.feeders[feeder.id]!.zone]) expect(inside(zone, layout.walk)).toBe(true);
    const busy = [...Object.values(layout.fields).flatMap((f) => f.plots.map(plotRect)), ...layout.tracks];
    for (const r of busy) expect(overlaps(r, spot.run)).toBe(false);
    for (const at of Object.values(layout.pads)) expect(at.x > spot.run.minX && at.x < spot.run.maxX && at.z > spot.run.minZ && at.z < spot.run.maxZ).toBe(false);
  });

  it("lets cash pile up without limit once the stand helper minds the till, so the farm earns while the hero is away", () => {
    expect(pads.find((p) => p.id === 'standhand')?.effects.till).toBe(true);
  });

  it('gives every pen of animals its run, work spot and trough, apart from each other and the fields', () => {
    const pens = pads.filter((p) => p.effects.pen);
    expect(pens.map((p) => p.effects.pen)).toEqual(['hens', 'cows']);
    const runs = pens.map((p) => layout.pens[p.id]!.run);
    expect(overlaps(runs[0]!, runs[1]!)).toBe(false);
    for (const pen of pens) {
      const spot = layout.pens[pen.id]!;
      expect(spot.animal).toBe(pen.effects.pen);
      expect(spot.zone.minX >= layout.walk.minX && spot.zone.maxZ <= layout.walk.maxZ).toBe(true);
      for (const field of Object.values(layout.fields)) for (const plot of field.plots) expect(overlaps(plotRect(plot), spot.run)).toBe(false);
    }
  });

  it("parks each van at its pad facing its way out, which leaves by the vans' gate; it comes back in through the farm gate", () => {
    const vans = pads.filter((p) => p.effects.van).map((p) => p.id);
    expect(vans).toEqual(['van', 'tanker']);
    const within = (p: { x: number; z: number }, r: Rect, pad = 0) => p.x >= r.minX - pad && p.x <= r.maxX + pad && p.z >= r.minZ - pad && p.z <= r.maxZ + pad;
    /** Where a way crosses the fence along the road. */
    const crossings = (route: { x: number; z: number }[]) => {
      const xs: number[] = [];
      for (let i = 1; i < route.length; i++) {
        const [a, b] = [route[i - 1]!, route[i]!];
        if ((a.z - layout.fenceZ) * (b.z - layout.fenceZ) < 0) xs.push(a.x + ((b.x - a.x) * (layout.fenceZ - a.z)) / (b.z - a.z));
      }
      return xs;
    };
    for (const id of vans) {
      const spot = layout.vans[id]!;
      const [park, ahead] = [spot.route[0]!, spot.route[1]!];
      expect(park).toEqual(layout.pads[id]);
      // Parked facing the way out (east along its track), and the way back ends there, driving the same way.
      expect(ahead.x).toBeGreaterThan(park.x + 5);
      expect(ahead.z).toBe(park.z);
      expect(spot.back.at(-1)).toEqual(park);
      expect(spot.back.at(-2)!.x).toBeLessThan(park.x);
      expect(spot.back.at(-2)!.z).toBe(park.z);
      const inside = (r: Rect) => r.minX >= layout.walk.minX && r.maxX <= layout.walk.maxX && r.minZ >= layout.walk.minZ && r.maxZ <= layout.walk.maxZ;
      expect(inside(spot.bay)).toBe(true);
      // Out through the vans' own gate, off the map to the east; back from the west, in through the farm gate.
      const out = crossings(spot.route);
      expect(out).toHaveLength(1);
      expect(layout.sideGates.some((g) => out[0]! > g.minX + 0.9 && out[0]! < g.maxX - 0.9)).toBe(true);
      const back = crossings(spot.back);
      expect(back).toHaveLength(1);
      expect(back[0]!).toBeGreaterThan(layout.gate.minX + 0.9);
      expect(back[0]!).toBeLessThan(layout.gate.maxX - 0.9);
      expect(spot.route.at(-1)!.x).toBeGreaterThan(layout.lot.maxX + 20);
      expect(spot.back[0]!.x).toBeLessThan(layout.lot.minX - 20);
      // On the farm, both ways keep to the tracks.
      for (const p of [...spot.route, ...spot.back]) if (within(p, layout.lot)) expect(layout.tracks.some((t) => within(p, t, 0.2)), JSON.stringify(p)).toBe(true);
    }
    expect(padIds.indexOf('driver')).toBeGreaterThan(padIds.indexOf('van'));
    expect(pads.find((p) => p.id === 'driver')?.effects.driver).toBe(true);
  });

  it('sends the machines where they belong: the pickup from between the fields to the barn doors, the feed truck through the gate', () => {
    const { machines } = layout;
    expect(pads.some((p) => p.effects.machine === 'pickup')).toBe(true);
    // The combine harvester is gone (the farmhand and the pickup bring in the harvest).
    expect(pads.some((p) => p.id === 'combine')).toBe(false);
    const inside = (p: { x: number; z: number }, r: Rect) => p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;
    // The pickup parks on the track between the two crop fields, off their plots, is loaded just behind it, and runs to the barn doors.
    const pickup = machines.pickupRoute;
    const park = pickup[0]!;
    const track = layout.tracks.find((t) => inside(park, t));
    expect(track).toBeDefined();
    const [field1, field2] = [layout.fields.field1!, layout.fields.field2!];
    expect(Math.max(...field1.plots.map((p) => p.z))).toBeLessThan(park.z);
    expect(Math.min(...field2.plots.map((p) => p.z))).toBeGreaterThan(park.z);
    for (const plot of [...field1.plots, ...field2.plots]) expect(Math.abs(plot.z - park.z)).toBeGreaterThan(PLOT.depth / 2 + 0.5);
    const bay = machines.pickupBay;
    expect(bay.maxX).toBeLessThan(park.x);
    expect(Math.abs((bay.minZ + bay.maxZ) / 2 - park.z)).toBeLessThan(0.3);
    expect(inside(pickup.at(-1)!, machines.barnDoor)).toBe(true);
    for (const p of pickup) expect(inside(p, layout.walk)).toBe(true);
    // The feed truck comes in through the farm gate.
    const truck = machines.feedTruckRoute;
    const gateX = truck.find((p, i) => i > 0 && (truck[i - 1]!.z - layout.fenceZ) * (p.z - layout.fenceZ) < 0);
    expect(gateX).toBeDefined();
  });

  it('counts deliveries for a town goal', () => {
    const goal = goals.goals.find((g) => g.count === 'delivery');
    expect(goal?.goal).toBeGreaterThan(0);
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
