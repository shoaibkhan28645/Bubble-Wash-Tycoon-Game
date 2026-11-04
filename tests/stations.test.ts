import { describe, expect, it } from 'vitest';
import { CARS, NEEDS, STAGES, STATIONS, TUNING, stationDef, type StageDef } from '../src/core/config';
import { ROADSIDE } from '../src/core/towns';
import type { Customer, CustomerState } from '../src/systems/customers';
import { ticketPay } from '../src/systems/economy';
import { Station, workSpot } from '../src/systems/stations';
import { needIcon, type Need } from '../src/systems/tickets';

const TYPES = ['service', 'till', 'rental', 'producer', 'mover'];

describe('stations.json', () => {
  it('gives every station kind one of the five station types and a known customer', () => {
    for (const [kind, def] of Object.entries(STATIONS)) {
      expect(TYPES, kind).toContain(def.type);
      expect(['car', 'walker'], kind).toContain(def.customer);
    }
    expect(stationDef('bay').type).toBe('service');
    expect(stationDef('counter').type).toBe('till');
  });

  it('only serves needs that exist, and only adds stages that exist', () => {
    const stageStations = new Set(STAGES.map((s) => s.station));
    for (const [kind, def] of Object.entries(STATIONS)) {
      if (def.serves) expect(NEEDS[def.serves], kind).toBeDefined();
      for (const at of def.stages) expect(stageStations.has(at as StageDef['station']), `${kind}: ${at}`).toBe(true);
    }
  });

  it('sizes every station from the town layout', () => {
    for (const [kind, def] of Object.entries(STATIONS)) if (def.size) expect(ROADSIDE.layout[def.size], kind).toBeDefined();
  });

  it('has a kind for every station a pad builds', () => {
    for (const pad of ROADSIDE.pads) {
      const kind = pad.effects.bay ? 'bay' : pad.effects.pump ? 'pump' : pad.effects.station;
      if (kind) expect(STATIONS[kind], pad.id).toBeDefined();
    }
  });

  it('refuses an unknown kind', () => {
    expect(() => stationDef('rocket')).toThrow('Unknown station kind: rocket');
  });

  it("puts a washer on the lot's outer side of a bay, whichever side it's on", () => {
    expect(workSpot(stationDef('bay'), { x: -3, z: 0 })).toEqual({ x: -4.2, z: 0.6 });
    expect(workSpot(stationDef('bay'), { x: 3, z: 0 })).toEqual({ x: 4.2, z: 0.6 });
    expect(workSpot(stationDef('pump'), { x: 0, z: 0 })).toBeNull();
  });
});

describe('needs.json', () => {
  it('covers every need on a ticket, each with an icon and one way to pay', () => {
    for (const kind of TUNING.tickets.kinds) for (const need of kind.needs) expect(NEEDS[need], need).toBeDefined();
    for (const [id, need] of Object.entries(NEEDS)) {
      expect(needIcon(id)).toBe(need.icon);
      expect(!!need.stagePay !== (need.payFactor !== undefined), id).toBe(true);
    }
    expect(needIcon('rocket')).toBe('❔');
  });

  it('adds up a bill from the needs served', () => {
    const sedan = CARS.find((c) => c.id === 'sedan')!;
    const foam = STAGES.find((s) => s.id === 'foam')!;
    const base = sedan.basePay;
    expect(ticketPay(sedan, [], ['wash'])).toBe(base);
    expect(ticketPay(sedan, [foam], ['wash'])).toBe(Math.round(base * (1 + foam.payBonus)));
    expect(ticketPay(sedan, [], ['fuel'])).toBe(Math.round(base * NEEDS.fuel!.payFactor!));
    // Three needs in one visit earn the combo bonus.
    const three = base * (1 + NEEDS.fuel!.payFactor! + NEEDS.snack!.payFactor!) * TUNING.tickets.combo[3]!;
    expect(ticketPay(sedan, [], ['fuel', 'snack', 'wash'])).toBe(Math.round(three));
  });
});

/** A customer on foot, as later towns will have: stations serve it just like a car. */
class Shopper implements Customer {
  readonly body = 'walker' as const;
  state: CustomerState = 'entering';
  position = { x: 0, z: 0 };
  needs: Need[] = ['snack'];
  served: Need[] = [];
  progress = 0;
  patience = 30;
  patienceMax = 30;
  stages: StageDef[] = [];
  quality = 1;
  manual = false;
  supplied = false;
  wants(need: Need): boolean {
    return this.needs.includes(need) && !this.served.includes(need);
  }
}

describe('customers', () => {
  it('lets a station serve a customer on foot', () => {
    const till = new Station<Shopper>('till', 'counter', { x: 0, z: 0 }, { width: 2, length: 1 }, 0, null);
    expect(till.type).toBe('till');
    expect(till.idle).toBe(true);
    const shopper = new Shopper();
    till.customer = shopper;
    expect(till.idle).toBe(false);
    expect(till.needsWork).toBe(false);
    shopper.state = 'waiting';
    expect(till.needsWork).toBe(true);
    expect(shopper.wants(till.def.serves!)).toBe(true);
  });
});
