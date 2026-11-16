// Skyport Part D: the stands east of the tower (Mogul Air's second plane, the freighters', the hangars'),
// reached from runway 1's east link; the second runway that departures take off from once it's built (round
// the first one's west end); Goldsby Air closing; Mogul Air's two planes, their wear and their servicing.
import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/core/config';
import { SKYPORT } from '../src/core/skyport';
import { Airfield, type Flight } from '../src/systems/airport';
import { Airline } from '../src/systems/airline';
import { Tower } from '../src/systems/tower';

const layout = SKYPORT.layout;
const rules = TUNING.airport;
const DT = 1 / 30;

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const run = (airfield: Airfield, seconds: number, each?: () => void): void => {
  for (let t = 0; t < seconds; t += DT) {
    airfield.update(DT);
    each?.();
  }
};

describe('the cargo and hangar stands', () => {
  it('brings a freighter to the cargo stand by the east link, and the hangars their planes when called', () => {
    const airfield = new Airfield(layout, rules, 6, {}, seeded(3));
    airfield.openGate('cargo');
    run(airfield, DT * 2);
    const freighter = airfield.at('cargo')!;
    expect(freighter.kind).toBe('freighter');
    expect(freighter.exitX).toBe(layout.links.east);
    let furthest = -Infinity;
    run(airfield, 70, () => (furthest = Math.max(furthest, freighter.x)));
    expect(freighter.phase).toBe('parked');
    expect(furthest).toBeGreaterThan(layout.links.east! - 1);
    expect(freighter.x).toBeCloseTo(layout.stands.cargo!.x, 1);
    // A Mogul Air plane home to the hangar, a jet in for a wash.
    for (const stand of ['hangar', 'jetwash', 'mogul2']) airfield.openGate(stand, 0, true);
    expect(airfield.send('hangar')?.kind).toBe('prop');
    expect(airfield.send('jetwash')?.kind).toBe('jet');
    expect(airfield.send('mogul2')?.kind).toBe('prop');
  });
});

describe('the second runway', () => {
  it('takes departures round the first runway’s end to take off from the second', () => {
    const airfield = new Airfield(layout, rules, 6, {}, seeded(8));
    airfield.runway2 = true;
    airfield.openGate('gate1');
    run(airfield, 40);
    const flight = airfield.parkedAt('gate1')!;
    flight.boarding = true;
    flight.cleared = true;
    let west = Infinity;
    let rolledAt: number | null = null;
    run(airfield, 60, () => {
      west = Math.min(west, flight.x);
      if (flight.phase === 'takeoff' && rolledAt === null) rolledAt = flight.z;
    });
    expect(west).toBeLessThan(layout.links.around! + 1);
    expect(rolledAt).toBeCloseTo(layout.runway2!.z, 1);
    // (And its taxi round the end never crosses the first runway's paving.)
    expect(layout.links.around!).toBeLessThan(layout.runway.minX - 20);
  });

  /** A busy day with every gate and stand open: how many leave, the longest a cleared plane waits, how close planes come. */
  function day(second: boolean, seconds = 1500) {
    const airfield = new Airfield(layout, rules, 6, {}, seeded(9));
    airfield.runway2 = second;
    const gates = ['gate1', 'gate2', 'gate3', 'gate4', 'cargo'];
    for (const gate of gates) airfield.openGate(gate);
    const stands = ['mogul', 'vip', 'mogul2', 'hangar', 'jetwash'];
    for (const stand of stands) airfield.openGate(stand, 0, true);
    const random = seeded(10);
    const turnaround = new Map<Flight, number>();
    const clearedAt = new Map<Flight, number>();
    const away = new Map<string, number>();
    let closest = Infinity;
    let longest = 0;
    let standLongest = 0;
    let departed = 0;
    let gateDeparted = 0;
    let landing = 0;
    let lining = 0;
    for (let t = 0; t < seconds; t += DT) {
      airfield.update(DT);
      for (const f of airfield.flights) {
        if (f.phase === 'parked' && !f.cleared) {
          if (!turnaround.has(f)) turnaround.set(f, Math.min(f.clockMax, 120) * (0.6 + random() * 0.3));
          if (f.parkedFor >= turnaround.get(f)!) {
            f.boarding = true;
            f.cleared = true;
            clearedAt.set(f, t);
          }
        }
        if (f.phase === 'pushback' && clearedAt.has(f)) {
          // (The gates' planes, whose passengers are waiting, and the stands', which give way to them.)
          if (gates.includes(f.gate) && f.gate !== 'cargo') {
            longest = Math.max(longest, t - clearedAt.get(f)!);
            gateDeparted += 1;
          } else standLongest = Math.max(standLongest, t - clearedAt.get(f)!);
          clearedAt.delete(f);
          departed += 1;
        }
      }
      for (const stand of stands) {
        if (airfield.at(stand) || airfield.calling(stand)) continue;
        const left = (away.get(stand) ?? 50 + stands.indexOf(stand) * 25) - DT;
        away.set(stand, left);
        if (left <= 0) {
          airfield.call(stand);
          away.delete(stand);
        }
      }
      landing = Math.max(landing, airfield.flights.filter((f) => f.phase === 'rollout').length);
      lining = Math.max(lining, airfield.flights.filter((f) => f.phase === 'lineup').length);
      const ground = airfield.flights.filter((f) => f.y < 6);
      for (let i = 0; i < ground.length; i++) {
        for (let j = i + 1; j < ground.length; j++) closest = Math.min(closest, Math.hypot(ground[i]!.x - ground[j]!.x, ground[i]!.z - ground[j]!.z));
      }
      if (!second) {
        // (With one runway, never a landing and a take-off on it at once.)
        const onIt = airfield.flights.filter((f) => f.phase === 'rollout' || f.phase === 'lineup' || f.phase === 'takeoff').length;
        expect(onIt).toBeLessThanOrEqual(1);
      }
    }
    return { departed, gateDeparted, longest, standLongest, closest, landing, lining };
  }

  it('keeps every stand busy with nobody in the same place, and lifts how many planes the airport (and the gates most) turns round', () => {
    const one = day(false);
    const two = day(true);
    for (const d of [one, two]) {
      expect(d.landing).toBeLessThanOrEqual(1);
      expect(d.lining).toBeLessThanOrEqual(1);
      expect(d.closest).toBeGreaterThan(10);
    }
    // More planes turned round, the gates' most of all; nobody kept waiting long to go (the stands' planes give
    // way to the gates', but they're not kept waiting for ever).
    expect(two.departed).toBeGreaterThan(one.departed * 1.1);
    expect(two.gateDeparted).toBeGreaterThan(one.gateDeparted * 1.15);
    for (const d of [one, two]) {
      expect(d.longest).toBeLessThan(75);
      expect(d.standLongest).toBeLessThan(75);
    }
  });
});

describe('who lands first', () => {
  it('sends a gate’s plane before a stand’s when both are ready (a freighter, or Mogul Air called home)', () => {
    const airfield = new Airfield(layout, rules, 6, {}, seeded(5));
    airfield.openGate('cargo');
    airfield.openGate('mogul', 0, true);
    airfield.call('mogul');
    airfield.openGate('gate2');
    run(airfield, DT * 2);
    expect(airfield.flights.map((f) => f.gate)).toEqual(['gate2']);
    // (The stands' turn comes once no gate's waiting.)
    run(airfield, 40);
    expect(airfield.flights.length).toBe(3);
  });

  it('with the second runway taking the departures, starts the next down the approach while the one before rolls out', () => {
    for (const second of [false, true]) {
      const airfield = new Airfield(layout, rules, 6, {}, seeded(6));
      airfield.runway2 = second;
      for (const gate of ['gate1', 'gate2', 'gate3']) airfield.openGate(gate);
      let overlap = false;
      run(airfield, 40, () => {
        if (airfield.flights.some((f) => f.phase === 'approach') && airfield.flights.some((f) => f.phase === 'rollout')) overlap = true;
        // (Still never two rolling out at once.)
        expect(airfield.flights.filter((f) => f.phase === 'rollout').length).toBeLessThanOrEqual(1);
      });
      expect(overlap).toBe(second);
    }
  });
});

describe('Goldsby Air closing', () => {
  it('takes its hops out of the tower’s queue and never deals another', () => {
    const tower = new Tower(rules.tower, 6, seeded(4));
    for (let i = 0; i < 6 && !tower.cards.some((c) => c.kind === 'hopper'); i++) tower.take(false);
    tower.closeHops();
    expect(tower.cards.length).toBe(rules.tower.queue);
    for (let i = 0; i < 60; i++) {
      expect(tower.cards.every((c) => c.kind !== 'hopper')).toBe(true);
      expect(new Set(tower.cards.map((c) => c.kind)).size).toBeGreaterThan(0);
      tower.take(i % 2 === 0);
    }
  });
});

describe('Mogul Air’s fleet', () => {
  it('flies two planes on routes of their own', () => {
    const store: Record<string, number> = {};
    const airline = new Airline(rules.airline, store, () => 0.99, rules.hangar);
    airline.choose('sunnycove', 0);
    airline.choose('maplefalls', 1);
    airline.depart(1, 0);
    airline.depart(2, 1);
    expect(airline.routeOf(0)?.id).toBe('sunnycove');
    expect(airline.routeOf(1)?.id).toBe('maplefalls');
    expect(airline.awayOf(1)).toBe(airline.awayOf(0) / 2);
    let t = 0;
    while (!airline.update(1, 1)) t += 1;
    expect(airline.awayOf(0)).toBeGreaterThan(0);
    expect(airline.homecoming(1, 1)?.city.id).toBe('maplefalls');
    // The first plane's numbers are where a Part C save keeps them.
    expect(store['air.route']).toBe(1);
    expect(store['air.route.2']).toBe(2);
  });

  it('wears with each trip once there is a hangar, brings home less worn, and more after a service', () => {
    const store: Record<string, number> = {};
    const airline = new Airline(rules.airline, store, () => 0.99, rules.hangar);
    const city = airline.choose('sunnycove')!;
    // No hangar yet: no wear.
    airline.homecoming();
    expect(airline.wearOf(0)).toBe(0);
    airline.wears = true;
    let trips = 0;
    while (!airline.worn(0)) {
      expect(airline.homecoming()!.takings).toBe(city.takings);
      trips += 1;
    }
    expect(trips).toBe(Math.ceil(rules.hangar.serviceAt / rules.hangar.wear[0]! - 1e-9));
    expect(airline.homecoming()!.takings).toBe(Math.round(city.takings * (1 - rules.hangar.wornPenalty)));
    airline.service(0);
    expect(airline.worn(0)).toBe(false);
    for (let i = 0; i < rules.hangar.freshTrips; i++) expect(airline.homecoming()!.takings).toBe(Math.round(city.takings * (1 + rules.hangar.freshBonus)));
    // (Those trips wore it again.)
    expect(airline.wearOf(0)).toBeCloseTo(rules.hangar.wear[0]! * rules.hangar.freshTrips);
  });
});
