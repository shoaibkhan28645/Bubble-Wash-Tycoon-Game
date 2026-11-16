// Skyport's flights and passengers: a plane lands and parks at its gate, is filled and cleared, takes off
// and is gone; no two planes are ever on the runway, or in the same place, at once; a full, on-time flight
// pays best; and the airfield's own spots are somewhere the hero can stand.
import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/core/config';
import { SKYPORT } from '../src/core/skyport';
import { Airfield, flightPay, ringAt, type Flight } from '../src/systems/airport';
import { Passengers, type CounterId, type Passenger } from '../src/systems/passengers';
import { hallWalls, roomWalls, wingWalls } from '../src/render/models/airport';

const layout = SKYPORT.layout;
const rules = TUNING.airport;
const DT = 1 / 30;

/** A seeded random, so a long run is the same every time. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function run(airfield: Airfield, seconds: number, each?: (t: number) => void): void {
  for (let t = 0; t < seconds; t += DT) {
    airfield.update(DT);
    each?.(t);
  }
}

describe('flights', () => {
  it('lands, taxis in and parks nose-in at its gate', () => {
    const seen: string[] = [];
    const airfield = new Airfield(layout, rules, 6, { onTouchdown: () => seen.push('touchdown'), onParked: () => seen.push('parked') }, seeded(1));
    airfield.openGate('gate1');
    const flight = airfield.send('gate1', 0)!;
    run(airfield, 60);
    expect(seen).toEqual(['touchdown', 'parked']);
    expect(flight.phase).toBe('parked');
    const spot = layout.gates.gate1!;
    expect(flight.x).toBeCloseTo(spot.x, 1);
    expect(flight.z).toBeCloseTo(flight.standZ, 1);
    expect(flight.y).toBe(0);
    // Nose to the hall (south).
    expect(Math.cos(flight.heading)).toBeGreaterThan(0.99);
    expect(airfield.parkedAt('gate1')).toBe(flight);
  });

  it('counts its clock down only once parked, and is late when it runs out', () => {
    const airfield = new Airfield(layout, rules, 6, {}, seeded(1));
    airfield.openGate('gate1');
    const flight = airfield.send('gate1', 0)!;
    const start = flight.clock;
    run(airfield, 5);
    expect(flight.clock).toBe(start);
    run(airfield, 55);
    expect(flight.phase).toBe('parked');
    expect(flight.clock).toBeLessThan(start);
    expect(flight.late).toBe(false);
    run(airfield, start + 5);
    expect(flight.late).toBe(true);
  });

  it('is ready once everyone booked is aboard, and its tanks and hold are full', () => {
    const airfield = new Airfield(layout, rules, 6, {}, seeded(1));
    airfield.openGate('gate1');
    const flight = airfield.send('gate1', 0)!;
    run(airfield, 40);
    expect(flight.ready).toBe(false);
    flight.boarding = true;
    flight.boarded = flight.seats;
    expect(flight.full).toBe(true);
    expect(flight.ready).toBe(true);
    flight.needsFuel = true;
    expect(flight.ready).toBe(false);
    flight.fuel = 1;
    flight.needsCases = 6;
    expect(flight.ready).toBe(false);
    flight.cases = 6;
    expect(flight.ready).toBe(true);
  });

  it('cleared, pushes back, takes off and is gone; the next one comes to the same gate', () => {
    const seen: string[] = [];
    const airfield = new Airfield(layout, rules, 6, { onPushback: () => seen.push('pushback'), onAirborne: () => seen.push('airborne'), onGone: () => seen.push('gone') }, seeded(2));
    airfield.openGate('gate1');
    const first = airfield.send('gate1', 0)!;
    run(airfield, 40);
    first.boarded = first.seats;
    first.cleared = true;
    run(airfield, 120);
    expect(seen).toEqual(['pushback', 'airborne', 'gone']);
    expect(airfield.flights).not.toContain(first);
    const next = airfield.at('gate1');
    expect(next).not.toBeNull();
    expect(next).not.toBe(first);
  });

  it('never has two planes on the runway, or two in the same place, over a long busy day', () => {
    const airfield = new Airfield(layout, rules, 6, {}, seeded(7));
    airfield.openGate('gate1');
    airfield.openGate('gate2', 3);
    const random = seeded(11);
    const waits = new Map<Flight, number>();
    let departures = 0;
    let worst = Infinity;
    const onRunway = (f: Flight): boolean => f.y < 6 && Math.abs(f.z - layout.runway.z) < layout.runway.half && f.phase !== 'hold';
    run(airfield, 1800, () => {
      for (const flight of airfield.flights) {
        if (flight.phase !== 'parked' || flight.cleared) continue;
        // Turned round in a random while, then cleared.
        if (!waits.has(flight)) waits.set(flight, flight.parkedFor + 4 + random() * 40);
        if (flight.parkedFor >= waits.get(flight)!) {
          flight.cleared = true;
          departures += 1;
        }
      }
      const using = airfield.flights.filter(onRunway);
      expect(using.length).toBeLessThanOrEqual(1);
      for (let i = 0; i < airfield.flights.length; i++) {
        for (let j = i + 1; j < airfield.flights.length; j++) {
          const a = airfield.flights[i]!;
          const b = airfield.flights[j]!;
          if (a.y > 6 || b.y > 6) continue;
          worst = Math.min(worst, Math.hypot(a.x - b.x, a.z - b.z));
        }
      }
    });
    expect(departures).toBeGreaterThan(30);
    // A plane's 10.6 m across: nose to tail on the taxiway is the closest they come.
    expect(worst).toBeGreaterThan(8);
    expect(airfield.flights.length).toBeLessThanOrEqual(4);
  });
});

describe('what a flight pays', () => {
  const flight = { boarded: 12, full: true, late: false, marshalled: false };
  it('pays for every seat, more for a full plane, an on-time one, and a streak', () => {
    const half = flightPay({ ...flight, boarded: 6, full: false, late: true }, 100, 0, rules);
    expect(half).toEqual({ pay: 600, onTime: false });
    const full = flightPay({ ...flight, late: true }, 100, 0, rules);
    expect(full.pay).toBe(Math.round(1200 * (1 + rules.flight.fullBonus)));
    const onTime = flightPay(flight, 100, 0, rules);
    expect(onTime.onTime).toBe(true);
    expect(onTime.pay).toBe(Math.round(1200 * (1 + rules.flight.fullBonus + rules.flight.onTimeBonus)));
    const streak = flightPay(flight, 100, 4, rules);
    expect(streak.pay).toBeGreaterThan(onTime.pay);
    // The streak's bonus stops growing.
    expect(flightPay(flight, 100, 500, rules).pay).toBe(flightPay(flight, 100, rules.flight.streakMax, rules).pay);
  });

  it('the ring closes onto the pad once a period, and is on target only at the end of each closing', () => {
    const { period, outer, inner } = rules.ring;
    expect(ringAt(0, rules.ring).radius).toBeCloseTo(outer, 1);
    expect(ringAt(period * 0.5, rules.ring).onTarget).toBe(false);
    const late = ringAt(period * 0.98, rules.ring);
    expect(late.onTarget).toBe(true);
    expect(late.radius).toBeLessThan(inner + 0.3);
    let onTarget = 0;
    for (let t = 0; t < period; t += period / 200) if (ringAt(t, rules.ring).onTarget) onTarget += 1;
    // A fair window: a good fifth of the time, not most of it.
    expect(onTarget / 200).toBeGreaterThan(0.15);
    expect(onTarget / 200).toBeLessThan(0.45);
  });
});

describe('passengers', () => {
  function world() {
    const airfield = new Airfield(layout, rules, 6, {}, seeded(3));
    airfield.openGate('gate1');
    const flight = airfield.send('gate1', 0)!;
    const events = { checkedIn: 0, gaveUp: 0, boarded: 0 };
    const passengers = new Passengers(layout, rules, airfield, () => ['gate1'], () => null, {
      onCheckedIn: () => (events.checkedIn += 1),
      onGaveUp: () => (events.gaveUp += 1),
      onBoarded: () => (events.boarded += 1),
    });
    const step = (seconds: number, rate: number): void => {
      for (let t = 0; t < seconds; t += DT) {
        airfield.update(DT);
        passengers.update(DT, { rate, byPlayer: true });
      }
    };
    return { airfield, flight, passengers, events, step };
  }

  it('are checked in one by one, wait by the gate, and board once it is opened', () => {
    const { flight, passengers, events, step } = world();
    for (let i = 0; i < 8; i++) expect(passengers.spawn(layout.desk.window, 0, true)).toBe(true);
    step(40, 1);
    expect(events.checkedIn).toBe(8);
    expect(passengers.line.length).toBe(0);
    expect(flight.phase).toBe('parked');
    expect(flight.waiting).toBe(8);
    expect(flight.boarded).toBe(0);
    flight.boarding = true;
    step(40, 1);
    expect(events.boarded).toBe(8);
    expect(flight.boarded).toBe(8);
    expect(passengers.all.length).toBe(0);
    // Everyone booked is aboard: it can go (not full, though).
    expect(flight.ready).toBe(true);
    expect(flight.full).toBe(false);
  });

  it('never sells more seats than the plane has', () => {
    const { flight, passengers, events, step } = world();
    for (let round = 0; round < 3; round++) {
      while (passengers.spawn(layout.desk.window, 0, true));
      step(30, 2);
    }
    expect(events.checkedIn).toBe(flight.seats);
    expect(passengers.roomAnywhere).toBe(false);
    expect(passengers.line.length).toBeGreaterThan(0);
    // Sold out isn't the desk's fault: nobody walks off.
    step(200, 1);
    expect(events.gaveUp).toBe(0);
  });

  it('give up and leave if nobody is behind the desk', () => {
    const { passengers, events, step } = world();
    for (let i = 0; i < 3; i++) passengers.spawn(layout.desk.window, 0, true);
    step(rules.passengers.patience + 20, 0);
    expect(events.gaveUp).toBe(3);
    expect(passengers.line.length).toBe(0);
  });
});

describe('the terminal (its wing, shops and security)', () => {
  /** One gate open with its first plane coming in, the shops as asked, everyone fancying a shop. */
  function terminal(gate: string, shops: { cafe?: boolean; dutyfree?: boolean }) {
    const airfield = new Airfield(layout, rules, 6, {}, seeded(5));
    airfield.openGate(gate);
    const flight = airfield.send(gate, 0)!;
    const stops = new Map<Passenger, CounterId[]>();
    const events = { gaveUp: 0, boarded: 0 };
    const passengers = new Passengers(layout, rules, airfield, () => [gate], () => null, {
      onCheckedIn: () => {},
      onServed: (p, id) => stops.set(p, [...(stops.get(p) ?? []), id]),
      onGaveUp: () => (events.gaveUp += 1),
      onBoarded: () => (events.boarded += 1),
    });
    passengers.open.cafe = !!shops.cafe;
    passengers.open.dutyfree = !!shops.dutyfree;
    passengers.screened = (g) => !!layout.gates[g]?.bridge;
    passengers.random = () => 0;
    let highest = 0;
    const step = (seconds: number, shopRate: number): void => {
      for (let t = 0; t < seconds; t += DT) {
        airfield.update(DT);
        passengers.update(DT, { rate: 1, byPlayer: false }, 1, () => ({ rate: shopRate, byPlayer: false }));
        for (const p of passengers.all) highest = Math.max(highest, p.y);
      }
    };
    return { airfield, flight, passengers, stops, events, step, highest: () => highest };
  }

  it("sends the wing's gate a jet, its passengers by way of the café, security and duty-free, and boards them over the bridge", () => {
    const { flight, passengers, stops, events, step, highest } = terminal('gate3', { cafe: true, dutyfree: true });
    expect(flight.kind).toBe('jet');
    expect(flight.seats).toBe(rules.planes.jet.seats);
    expect(passengers.seatsAt('gate3')).toBe(rules.planes.jet.seats);
    for (let i = 0; i < 4; i++) expect(passengers.spawn(layout.desk.window, 0, true)).toBe(true);
    step(120, 1);
    expect(stops.size).toBe(4);
    for (const route of stops.values()) expect(route).toEqual(['cafe', 'security', 'dutyfree']);
    expect(passengers.all.every((p) => p.state === 'lounge')).toBe(true);
    expect(flight.phase).toBe('parked');
    flight.boarding = true;
    step(60, 1);
    expect(events.boarded).toBe(4);
    expect(flight.boarded).toBe(4);
    // Up the bridge to the jet's sill, not stairs to a prop's.
    expect(highest()).toBeCloseTo(rules.planes.jet.sill, 1);
  });

  it("keeps the other gates' passengers out of security and duty-free", () => {
    const { stops, passengers, step } = terminal('gate1', { cafe: true, dutyfree: true });
    for (let i = 0; i < 3; i++) passengers.spawn(layout.desk.window, 0, true);
    step(90, 1);
    for (const route of stops.values()) expect(route).toEqual(['cafe']);
    expect(passengers.all.every((p) => p.state === 'lounge')).toBe(true);
  });

  it("gives up on a shop nobody's serving, but not on the flight; security needs nobody", () => {
    const { flight, stops, passengers, events, step } = terminal('gate3', { cafe: true, dutyfree: true });
    for (let i = 0; i < 3; i++) passengers.spawn(layout.desk.window, 0, true);
    step(150, 0);
    for (const route of stops.values()) expect(route).toEqual(['security']);
    expect(stops.size).toBe(3);
    expect(events.gaveUp).toBe(0);
    expect(passengers.all.every((p) => p.state === 'lounge')).toBe(true);
    flight.boarding = true;
    step(60, 0);
    expect(events.boarded).toBe(3);
  });

  it('pays a jet more with its meals aboard', () => {
    const jet = { boarded: 24, full: true, late: false, marshalled: false };
    const hungry = flightPay({ ...jet, meals: 2, needsMeals: 4 }, 100, 0, rules).pay;
    const fed = flightPay({ ...jet, meals: 4, needsMeals: 4 }, 100, 0, rules).pay;
    expect(fed).toBeGreaterThan(hungry);
    expect(fed - hungry).toBe(Math.round(24 * 100 * rules.meals.bonus));
  });
});

describe('the airfield layout', () => {
  // The hall and its wing as they stand once the wing's built (the hall's east end opened into it); Gate 4's
  // pier and the VIP lounge (Part C).
  const walls = [
    ...hallWalls(layout, true),
    ...wingWalls(layout),
    ...roomWalls(layout.pier, [{ side: 'north', x: layout.gates.gate4!.door.x, half: 0.75 }]),
    ...roomWalls(layout.vip.lounge, [
      { side: 'north', x: layout.vip.door.x, half: 0.95 },
      { side: 'south', x: layout.vip.door.x, half: 0.95 },
    ]),
  ];
  const inside = (p: { x: number; z: number }, margin = 0.45): boolean => walls.some((w) => p.x > w.minX - margin && p.x < w.maxX + margin && p.z > w.minZ - margin && p.z < w.maxZ + margin);
  it('keeps every spot the hero stands on clear of the hall walls and inside the walkable ground', () => {
    const spots: [string, { x: number; z: number }][] = [
      ['start', layout.playerStart],
      ...Object.entries(layout.pads).map(([id, p]): [string, { x: number; z: number }] => [`pad ${id}`, p]),
      ...Object.entries(layout.upgradePads).map(([id, p]): [string, { x: number; z: number }] => [`upgrade ${id}`, p]),
      ...Object.entries(layout.piles).map(([id, p]): [string, { x: number; z: number }] => [`pile ${id}`, p]),
      ...Object.entries(layout.gates).flatMap(([id, g]): [string, { x: number; z: number }][] => [
        [`${id} marshal`, g.marshal],
        [`${id} fuel`, g.fuelSpot],
        [`${id} hold`, g.hold],
        ...(g.galley ? [[`${id} galley`, g.galley] as [string, { x: number; z: number }]] : []),
      ]),
      ...Object.entries(layout.staffSpots).map(([id, p]): [string, { x: number; z: number }] => [`staff ${id}`, p]),
      ['security exit', layout.security.exit],
      ...Object.entries(layout.stands).map(([id, s]): [string, { x: number; z: number }] => [`stand ${id} marshal`, s.marshal]),
      ['mogul board', layout.mogul.board],
      ['vip carpet', layout.vip.carpet],
      ['vip bar side', { x: layout.vip.bar.x + 1.05, z: layout.vip.bar.z }],
      ['vip seat side', { x: layout.vip.seat.x - 1.6, z: layout.vip.seat.z }],
      ['tower door', layout.tower.door],
      ['shuttle stop front', { x: layout.shuttle.stop.x, z: layout.shuttle.stop.z + 1.6 }],
      ['kitchen pick', layout.kitchen.pick],
      ...(['cafe', 'dutyfree'] as const).flatMap((id): [string, { x: number; z: number }][] => layout[id].queue.map((q, i) => [`${id} queue ${i}`, q])),
    ];
    for (const [name, p] of spots) {
      expect(inside(p), name).toBe(false);
      expect(p.x > layout.walk.minX && p.x < layout.walk.maxX && p.z > layout.walk.minZ && p.z < layout.walk.maxZ, name).toBe(true);
    }
  });

  it('has a door in the hall (or wing) wall at every gate and at the entrance', () => {
    for (const gate of Object.values(layout.gates)) expect(inside(gate.door, 0.4)).toBe(false);
    // The wing's gate opens out of the wing.
    const g3 = layout.gates.gate3!;
    expect(g3.door.x > layout.wing.minX && g3.door.x < layout.wing.maxX && Math.abs(g3.door.z - layout.wing.minZ) < 0.5).toBe(true);
    expect(inside(layout.entrance, 0.4)).toBe(false);
  });

  it('parks each plane clear of the hall, its stairs, and its neighbour', () => {
    const gates = Object.values(layout.gates);
    for (const gate of gates) {
      expect(gate.noseZ).toBeLessThan(layout.hall.minZ - 2);
      // The stairs stand beside the fuselage, not under it.
      expect(Math.abs(gate.planeDoor.x - gate.x)).toBeGreaterThan(0.95);
    }
    expect(Math.abs(gates[0]!.x - gates[1]!.x)).toBeGreaterThan(11.5);
  });
});
