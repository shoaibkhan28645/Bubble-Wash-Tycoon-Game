// Skyport Part E: the Sky Queen on her own stand east of the jet wash (her own link off the runway, rolled out
// parked where she was built, off on her tours by the second runway, nobody near anybody), and Mogul Air flying
// somewhere new by itself when it's left alone (so the town's goals for destinations and souvenirs can be met).
import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/core/config';
import { SKYPORT } from '../src/core/skyport';
import { Airfield, exitFor, type Flight } from '../src/systems/airport';
import { Airline } from '../src/systems/airline';
import { PLANES } from '../src/render/models/airport';

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

describe('the Sky Queen’s stand', () => {
  const stand = layout.stands.skyqueen!;
  const queen = PLANES.queen.size;

  it('is hers alone, east of the cargo stand, with a link off the runway of its own', () => {
    expect(exitFor(layout, stand.x)).toBe(layout.links.queen);
    // (Gate 4 and the freighters east of the terminal still leave by the east link; Mogul Air's, the VIP's, the
    // hangar's and the jet wash's stands, west of it, by the far link and the usual one.)
    for (const id of ['gate4', 'cargo']) expect(exitFor(layout, (layout.gates[id] ?? layout.stands[id])!.x)).toBe(layout.links.east);
    for (const id of ['mogul', 'vip', 'mogul2', 'hangar', 'jetwash']) expect(exitFor(layout, layout.stands[id]!.x)).toBeLessThan(layout.links.east!);
    // Her wingtips clear of the cargo shed and of the lot's edge; her link east of her wingtip; her tail well clear
    // of the taxiway (a wide-body passing on it reaches 10 metres to either side).
    expect(stand.x - queen.span / 2).toBeGreaterThan(layout.cargo!.shed.maxX + 3);
    expect(stand.x + queen.span / 2).toBeLessThan(layout.lot.maxX - 2);
    expect(layout.links.queen!).toBeGreaterThan(stand.x + queen.span / 2 + 3);
    expect(stand.noseZ - queen.length - (layout.taxiway.z + PLANES.wide.size.span / 2)).toBeGreaterThan(4);
    expect(layout.runway.maxX).toBeGreaterThan(layout.links.queen! + 10);
    // Taxiing past everything on the taxiway, her wingtips stay clear of the hangar's and the jet wash's
    // fronts and of the control tower.
    const tip = layout.taxiway.z + queen.span / 2;
    expect(tip).toBeLessThan(layout.hangar!.hall.minZ - 0.4);
    expect(tip).toBeLessThan(layout.jetwash!.hall.minZ - 0.4);
    expect(tip).toBeLessThan(layout.tower.at.z - 2.6);
  });

  it('rolls her out parked, sends her off round to the second runway, and brings her home by her own link', () => {
    const airfield = new Airfield(layout, rules, 6, {}, seeded(2));
    airfield.runway2 = true;
    airfield.openGate('skyqueen', 0, true);
    const her = airfield.park('skyqueen')!;
    expect(her.phase).toBe('parked');
    expect(her.kind).toBe('queen');
    expect(her.x).toBe(stand.x);
    expect(her.z).toBeCloseTo(stand.noseZ - queen.length / 2);
    expect(airfield.park('skyqueen')).toBeNull();
    her.cleared = true;
    let rolledAt: number | null = null;
    run(airfield, 120, () => {
      if (her.phase === 'takeoff' && rolledAt === null) rolledAt = her.z;
    });
    expect(rolledAt).toBeCloseTo(layout.runway2!.z, 1);
    expect(airfield.flights).not.toContain(her);
    // Home: down on the first runway, off by her link, onto her stand.
    airfield.call('skyqueen');
    // (A stand waits its gap after its last plane's gone, as a gate does.)
    run(airfield, rules.flight.gapSeconds + 0.5);
    const back = airfield.at('skyqueen')!;
    expect(back.exitX).toBe(layout.links.queen);
    let furthest = -Infinity;
    run(airfield, 80, () => (furthest = Math.max(furthest, back.x)));
    expect(back.phase).toBe('parked');
    expect(furthest).toBeGreaterThan(layout.links.queen! - 1);
  });

  it('keeps her clear of everyone on a busy day', () => {
    const airfield = new Airfield(layout, rules, 6, {}, seeded(11));
    airfield.runway2 = true;
    for (const gate of ['gate1', 'gate2', 'gate3', 'gate4', 'cargo']) airfield.openGate(gate);
    const stands = ['mogul', 'vip', 'mogul2', 'hangar', 'jetwash', 'skyqueen'];
    for (const s of stands) airfield.openGate(s, 0, true);
    airfield.park('skyqueen');
    const random = seeded(12);
    const turnaround = new Map<Flight, number>();
    const away = new Map<string, number>();
    let closest = Infinity;
    let queenTrips = 0;
    for (let t = 0; t < 900; t += DT) {
      airfield.update(DT);
      for (const f of airfield.flights) {
        if (f.phase === 'parked' && !f.cleared) {
          if (!turnaround.has(f)) turnaround.set(f, Math.min(f.clockMax, 90) * (0.5 + random() * 0.3));
          if (f.parkedFor >= turnaround.get(f)!) {
            f.boarding = true;
            f.cleared = true;
            if (f.gate === 'skyqueen') queenTrips += 1;
          }
        }
      }
      for (const s of stands) {
        if (airfield.at(s) || airfield.calling(s) || airfield.flights.some((f) => f.gate === s)) continue;
        const left = (away.get(s) ?? 40) - DT;
        away.set(s, left);
        if (left <= 0) {
          airfield.call(s);
          away.delete(s);
        }
      }
      const ground = airfield.flights.filter((f) => f.y < 6);
      for (let i = 0; i < ground.length; i++) {
        for (let j = i + 1; j < ground.length; j++) closest = Math.min(closest, Math.hypot(ground[i]!.x - ground[j]!.x, ground[i]!.z - ground[j]!.z));
      }
    }
    expect(queenTrips).toBeGreaterThanOrEqual(3);
    expect(closest).toBeGreaterThan(10);
  });
});

describe('Mogul Air left alone', () => {
  it('flies somewhere new, then somewhere it’s still to bring a souvenir home from, then the best-paying', () => {
    const store: Record<string, number> = {};
    const airline = new Airline(rules.airline, store, () => 0.99, rules.hangar);
    const cities = rules.airline.cities;
    const seen = new Set<string>();
    // (Each trip home opens its city; with souvenirs never coming, every open tier's cities get flown.)
    for (let trip = 0; trip < 12; trip++) {
      const city = airline.next(0);
      seen.add(city.id);
      airline.choose(city.id, 0);
      airline.homecoming(1, 0);
    }
    expect(airline.openedCount).toBeGreaterThanOrEqual(6);
    expect(seen.size).toBeGreaterThanOrEqual(6);
    // Every souvenir home, every tier open: the best-paying city for its time.
    for (const c of cities) {
      store[`air.open.${c.id}`] = 1;
      store[`air.souv.${c.id}`] = 1;
    }
    const best = [...cities].sort((a, b) => b.takings / b.seconds - a.takings / a.seconds)[0]!;
    expect(airline.next(0).id).toBe(best.id);
  });

  it('sends the second plane somewhere other than the first while there is somewhere else', () => {
    const store: Record<string, number> = {};
    const airline = new Airline(rules.airline, store, () => 0.99, rules.hangar);
    const first = airline.next(0);
    airline.choose(first.id, 0);
    expect(airline.next(1).id).not.toBe(first.id);
  });
});
