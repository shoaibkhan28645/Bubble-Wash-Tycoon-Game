// Skyport Part C: the tower's cards and fog, Mogul Air's routes and souvenirs, a celebrity's wishes, and the
// airfield's new stands (Mogul Air's and the private jets', which only get a plane when the game sends for
// one, reached from the runway's far link) and its pause for fog.
import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/core/config';
import { SKYPORT } from '../src/core/skyport';
import { Airfield, type Flight } from '../src/systems/airport';
import { Airline } from '../src/systems/airline';
import { ease, eastLimit, mayTurn, swingOut, westLimit, type RoadUser } from '../src/systems/road';
import { Fog, Tower } from '../src/systems/tower';
import { Celebrity, WISHES } from '../src/systems/vip';

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

describe('the tower', () => {
  it('always has a full queue with a choice in it, and brings in the chosen card, else the front one', () => {
    const tower = new Tower(rules.tower, 6, seeded(1));
    for (let round = 0; round < 40; round++) {
      expect(tower.cards.length).toBe(rules.tower.queue);
      expect(new Set(tower.cards.map((c) => c.kind)).size).toBeGreaterThan(1);
      const front = tower.cards[0]!;
      const third = tower.cards[2]!;
      if (round % 2) {
        tower.choose(2);
        expect(tower.take(false)).toBe(third);
      } else {
        expect(tower.take(false)).toBe(front);
      }
    }
    expect(tower.picks).toBe(20);
  });

  it('never clogs: a card that has waited through too many landings diverts (the controller only takes the best)', () => {
    const tower = new Tower(rules.tower, 6, seeded(11));
    for (let i = 0; i < 60; i++) {
      tower.take(true);
      expect(tower.cards.every((c) => c.waited < rules.tower.divert)).toBe(true);
      expect(tower.cards.length).toBe(rules.tower.queue);
    }
    // Nobody choosing, every kind lands in turn.
    const kinds = new Set<string>();
    for (let i = 0; i < 60; i++) kinds.add(tower.take(false).kind);
    expect(kinds.size).toBe(rules.tower.cards.length);
  });

  it("lets the controller pick the best-paying card, and choosing a card twice un-chooses it", () => {
    const tower = new Tower(rules.tower, 6, seeded(7));
    const best = Math.max(...tower.cards.map((c) => c.fare));
    expect(tower.take(true).fare).toBe(best);
    tower.choose(1);
    tower.choose(1);
    expect(tower.chosen).toBe(null);
  });

  it('every kind of card is worth about the same a minute: a charter pays more but takes longer', () => {
    const regular = rules.tower.cards.find((c) => c.id === 'regular')!;
    for (const card of rules.tower.cards) {
      // The fare a minute, the turnaround stretched by its cases and clock.
      const work = 0.5 + 0.25 * card.cases + 0.25 * card.clock;
      const regularWork = 0.5 + 0.25 * regular.cases + 0.25 * regular.clock;
      const ratio = card.fare / work / (regular.fare / regularWork);
      expect(ratio).toBeGreaterThan(0.8);
      expect(ratio).toBeLessThan(1.25);
    }
  });

  it('fog rolls in after its first wait, holds a while, lifts, and comes back', () => {
    const fog = new Fog(rules.fog, seeded(2));
    const events: string[] = [];
    for (let t = 0; t < rules.fog.first + rules.fog.seconds + 400; t += DT) {
      const e = fog.update(DT);
      if (e) events.push(`${e}@${Math.round(t)}`);
    }
    expect(events[0]).toBe(`in@${Math.round(rules.fog.first)}`);
    expect(events[1]).toBe(`out@${Math.round(rules.fog.first + rules.fog.seconds)}`);
    expect(events.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Mogul Air', () => {
  it('opens the further tiers as enough of the nearer cities are flown to', () => {
    const store: Record<string, number> = {};
    const airline = new Airline(rules.airline, store, () => 0.99);
    expect(airline.unlocked(1)).toBe(true);
    expect(airline.unlocked(2)).toBe(false);
    expect(airline.choose('snowpeak')).toBe(null);
    for (const id of ['sunnycove', 'maplefalls']) {
      airline.choose(id);
      airline.depart();
      while (!airline.update(1));
      expect(airline.homecoming()?.first).toBe(true);
    }
    expect(airline.openedCount).toBe(2);
    expect(airline.unlocked(2)).toBe(true);
    expect(airline.unlocked(3)).toBe(false);
  });

  it("is away for its route's time, comes back with the takings, and keeps it all in the town's numbers", () => {
    const store: Record<string, number> = {};
    const airline = new Airline(rules.airline, store, () => 0);
    const city = airline.choose('portwillow')!;
    airline.depart(2);
    expect(airline.away).toBe(city.seconds / 2);
    let t = 0;
    while (!airline.update(0.5)) t += 0.5;
    expect(t + 0.5).toBeCloseTo(city.seconds / 2, 5);
    const home = airline.homecoming(1.5)!;
    expect(home.takings).toBe(Math.round(city.takings * 1.5));
    expect(home.souvenir).toBe(true);
    // A new Airline on the same numbers (a reload) knows it all.
    const again = new Airline(rules.airline, store);
    expect(again.opened('portwillow')).toBe(true);
    expect(again.hasSouvenir('portwillow')).toBe(true);
    expect(again.route?.id).toBe('portwillow');
  });

  it('a full tier of souvenirs puts a bonus on every fare', () => {
    const store: Record<string, number> = {};
    const airline = new Airline(rules.airline, store, () => 0);
    for (const c of rules.airline.cities.filter((c) => c.tier === 1)) {
      airline.choose(c.id);
      airline.homecoming();
    }
    expect(airline.fullSets).toBe(1);
    expect(airline.fareBonus).toBeCloseTo(rules.airline.setBonus);
    // A souvenir comes once only.
    airline.choose('sunnycove');
    expect(airline.homecoming()?.souvenir).toBe(false);
  });
});

describe('a celebrity', () => {
  it('tips for each wish granted, once, and the bonus with the last', () => {
    const star = new Celebrity(rules.vip, 2);
    expect(star.grant('carpet')).toBe(rules.vip.tip * 2);
    expect(star.grant('carpet')).toBe(0);
    expect(star.grant('juice')).toBe(rules.vip.tip * 2);
    expect(star.grant('limo')).toBe((rules.vip.tip + rules.vip.allBonus) * 2);
    expect(star.happy).toBe(true);
    expect(star.done).toBe(true);
    expect(WISHES.length).toBe(3);
  });

  it('runs out of patience, and then wants nothing more', () => {
    const star = new Celebrity(rules.vip);
    star.grant('limo');
    let gone = false;
    for (let t = 0; t < rules.vip.patience + 1 && !gone; t += DT) gone = star.update(DT);
    expect(gone).toBe(true);
    expect(star.happy).toBe(false);
    expect(star.grant('carpet')).toBe(0);
  });
});

describe('the airfield in Part C', () => {
  const run = (airfield: Airfield, seconds: number, each?: () => void): void => {
    for (let t = 0; t < seconds; t += DT) {
      airfield.update(DT);
      each?.();
    }
  };

  it("sends a plane to a stand only when asked, and brings stands east of the usual exit in by the far link", () => {
    const airfield = new Airfield(layout, rules, 6, {}, seeded(4));
    airfield.openGate('mogul', 0, true);
    run(airfield, 20);
    expect(airfield.flights.length).toBe(0);
    airfield.call('mogul');
    expect(airfield.calling('mogul')).toBe(true);
    run(airfield, DT * 2);
    const flight = airfield.at('mogul')!;
    expect(airfield.calling('mogul')).toBe(false);
    expect(flight.kind).toBe('prop');
    let furthest = -Infinity;
    run(airfield, 60, () => (furthest = Math.max(furthest, flight.x)));
    expect(flight.phase).toBe('parked');
    // It rolled on past the stand to the far link and taxied back west to it.
    expect(furthest).toBeGreaterThan(layout.links.far - 1);
    expect(flight.x).toBeCloseTo(layout.stands.mogul!.x, 1);
  });

  it('takes the wide-body at Gate 4 and the golden jet at the VIP stand', () => {
    const airfield = new Airfield(layout, rules, 6, {}, seeded(5));
    airfield.openGate('gate4');
    airfield.openGate('vip', 0, true);
    run(airfield, 1);
    const wide = airfield.at('gate4')!;
    expect(wide.kind).toBe('wide');
    expect(wide.seats).toBe(rules.planes.wide.seats);
    expect(airfield.send('vip')?.kind).toBe('private');
  });

  it("holds every arrival while it's foggy, and stretches a charter's clock", () => {
    const airfield = new Airfield(layout, rules, 6, {}, seeded(6));
    airfield.paused = true;
    airfield.openGate('gate1');
    run(airfield, 30);
    expect(airfield.flights.length).toBe(0);
    airfield.paused = false;
    airfield.terms = () => ({ kind: 'charter', fare: 1.5, cases: 1.5, clock: 1.2 });
    run(airfield, 1);
    const flight = airfield.at('gate1') as Flight;
    expect(flight.card?.kind).toBe('charter');
    expect(flight.clockMax).toBeCloseTo(rules.flight.firstClock * 1.2);
  });

  it('keeps every stand busy all day with nobody on the runway at once, nobody in the same place, and nobody kept waiting', () => {
    const airfield = new Airfield(layout, rules, 6, {}, seeded(9));
    const gates = ['gate1', 'gate2', 'gate3', 'gate4'];
    for (const gate of gates) airfield.openGate(gate);
    airfield.openGate('mogul', 0, true);
    airfield.openGate('vip', 0, true);
    const random = seeded(10);
    const turnaround = new Map<Flight, number>();
    const clearedAt = new Map<Flight, number>();
    const away = new Map<string, number>();
    const empty: Record<string, number> = {};
    let worst = 0;
    let closest = Infinity;
    let longest = 0;
    let departed = 0;
    const day = 1800;
    for (let t = 0; t < day; t += DT) {
      airfield.update(DT);
      for (const f of airfield.flights) {
        // The crew turns a plane round in 60–90% of its clock, and clears it.
        if (f.phase === 'parked' && !f.cleared) {
          if (!turnaround.has(f)) turnaround.set(f, f.clockMax * (0.6 + random() * 0.3));
          if (f.parkedFor >= turnaround.get(f)!) {
            f.boarding = true;
            f.cleared = true;
            clearedAt.set(f, t);
          }
        }
        if (f.phase === 'pushback' && clearedAt.has(f)) {
          longest = Math.max(longest, t - clearedAt.get(f)!);
          clearedAt.delete(f);
          departed += 1;
        }
      }
      for (const gate of gates) if (!airfield.at(gate)) empty[gate] = (empty[gate] ?? 0) + DT;
      // Mogul Air's back a minute after it leaves; a celebrity's jet every three minutes or so.
      for (const stand of ['mogul', 'vip']) {
        if (airfield.at(stand) || airfield.calling(stand)) continue;
        const left = (away.get(stand) ?? (stand === 'mogul' ? 60 : 170)) - DT;
        away.set(stand, left);
        if (left <= 0) {
          airfield.call(stand);
          away.delete(stand);
        }
      }
      const onRunway = airfield.flights.filter((f) => f.phase === 'rollout' || f.phase === 'lineup' || f.phase === 'takeoff').length;
      worst = Math.max(worst, onRunway);
      const ground = airfield.flights.filter((f) => f.y < 6);
      for (let i = 0; i < ground.length; i++) {
        for (let j = i + 1; j < ground.length; j++) closest = Math.min(closest, Math.hypot(ground[i]!.x - ground[j]!.x, ground[i]!.z - ground[j]!.z));
      }
    }
    expect(worst).toBeLessThanOrEqual(1);
    expect(departed).toBeGreaterThan(65);
    // Nose to tail in the queue for the runway (or a plane at the hold and one turning in) is the closest they come.
    expect(closest).toBeGreaterThan(10);
    // A cleared plane's off within a minute or so, however busy (a gate kept waiting for a plane comes first).
    expect(longest).toBeLessThan(75);
    // And no gate sits empty for long: the next plane's on its way soon after the last one leaves.
    for (const gate of gates) expect(empty[gate]! / day).toBeLessThan(0.3);
  });
});

describe('the road in front', () => {
  it('keeps a taxi behind the shuttle at its stop, and the shuttle turns round with it waiting there', () => {
    const bus: RoadUser = { x: 4.5, half: 4.2, lane: 'west', speed: 0 };
    const taxi: RoadUser = { x: 90, half: 1.6, lane: 'west', speed: 16 };
    // The taxi's bound for a kerb past the stop: it drives in, slowing, and stops short of the bus.
    for (let t = 0; t < 20; t += DT) {
      const left = taxi.x - Math.max(-19.5, westLimit([bus], taxi));
      taxi.speed = ease(taxi.speed!, left > 0.02 ? Math.max(2.5, Math.min(16, left * 1.7)) : 0, DT, 20);
      taxi.x -= Math.min(Math.max(0, left), taxi.speed * DT);
    }
    expect(taxi.x - bus.x).toBeGreaterThanOrEqual(bus.half + taxi.half);
    expect(taxi.x - bus.x).toBeLessThan(bus.half + taxi.half + 2);
    // Waiting there, it doesn't hold up the bus turning round; one coming fast, or alongside, does.
    expect(mayTurn([{ ...taxi, speed: 0 }], bus)).toBe(true);
    expect(mayTurn([{ ...taxi, x: bus.x + 12, speed: 14 }], bus)).toBe(false);
    expect(mayTurn([{ ...taxi, x: bus.x + 1, speed: 0 }], bus)).toBe(false);
    // Turning, it holds up both lanes; heading east, it keeps behind what's ahead.
    const turning: RoadUser = { ...bus, lane: 'both', half: 6.2 };
    expect(westLimit([turning], taxi)).toBeGreaterThan(turning.x + turning.half);
    expect(eastLimit([{ x: 60, half: 3.3, lane: 'east' }], { x: 20, half: 4.2, lane: 'east' })).toBeCloseTo(60 - 3.3 - 4.2 - 1.5);
  });

  it('passes the limousine in its bay with a swing out, and never stops behind it', () => {
    const limo: RoadUser = { x: 61.6, half: 3.3, lane: 'bay' };
    const taxi: RoadUser = { x: 90, half: 1.6, lane: 'west' };
    expect(westLimit([limo], taxi)).toBe(-Infinity);
    expect(swingOut([limo], { ...taxi, x: 61.6 })).toBe(1);
    expect(swingOut([limo], taxi)).toBe(0);
  });
});
