// Keeps templates/business in step with the game's data rules.
import { describe, expect, it } from 'vitest';
import { NEEDS, STATIONS, type NeedDef, type PadDef, type StationDef } from '../src/core/config';
import { ROADSIDE } from '../src/core/towns';
import templateStations from '../templates/business/stations.json';
import templateNeeds from '../templates/business/needs.json';
import templatePads from '../templates/business/pads.json';

const stations = templateStations as Record<string, StationDef>;
const needs = templateNeeds as Record<string, NeedDef>;
const pads = templatePads as PadDef[];
const TYPES = ['service', 'till', 'rental', 'producer', 'mover'];
const FIELDS = Object.keys(STATIONS.bay!).filter((key) => key !== 'workSpot');

describe('business template', () => {
  it('describes its stations with every field the game reads', () => {
    for (const [kind, def] of Object.entries(stations)) {
      for (const field of FIELDS) expect(def, `${kind}.${field}`).toHaveProperty(field);
      expect(TYPES).toContain(def.type);
      expect(['car', 'walker']).toContain(def.customer);
      if (def.serves) expect(needs[def.serves] ?? NEEDS[def.serves], kind).toBeDefined();
      if (def.size) expect(ROADSIDE.layout[def.size], kind).toBeDefined();
    }
  });

  it('gives each new need an icon and one way to pay', () => {
    for (const [id, need] of Object.entries(needs)) {
      expect(need.icon, id).toBeTruthy();
      expect(!!need.stagePay !== (need.payFactor !== undefined), id).toBe(true);
    }
  });

  it('lists pads in order, each building a known station', () => {
    for (let i = 1; i < pads.length; i++) {
      expect(pads[i]!.cost).toBeGreaterThan(pads[i - 1]!.cost);
      expect(pads[i]!.targetMinute).toBeGreaterThan(pads[i - 1]!.targetMinute);
    }
    for (const pad of pads) if (pad.effects.station) expect(stations[pad.effects.station] ?? STATIONS[pad.effects.station], pad.id).toBeDefined();
  });
});
