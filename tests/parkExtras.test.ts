// Starlight Fun Park's extras: visitor groups, school trips, servicing worn
// rides, extra seats, one operator a zone and the upgrades' caps.
import { describe, expect, it } from 'vitest';
import { TUNING, UPGRADES } from '../src/core/config';
import { newGame } from '../src/core/gameState';
import { STARLIGHT } from '../src/core/starlight';
import { ParkCrowd, ParkVisitor, RIDES, Ride } from '../src/systems/park';
import { maxLevel } from '../src/systems/upgrades';

const { layout } = STARLIGHT;
const STEP = 0.05;
const RULES = TUNING.park.rides;

function park(seed = 21) {
  const served: ParkVisitor[] = [];
  const launches: { id: string; riders: number }[] = [];
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const crowd = new ParkCrowd(layout, newGame(), () => 0, () => 0, null, (_from, to) => [to], {
    onServed: (v) => served.push(v),
    onGaveUp: () => {},
    onLaunch: (ride, launch) => launches.push({ id: ride.id, riders: launch.riders }),
  }, random);
  crowd.open = true;
  crowd.addCounter('booth', 'booth', null);
  for (const id of ['carousel', 'teacups', 'bumper', 'swings', 'haunted']) crowd.addRide(id, id);
  crowd.addCounter('cart', 'cart', null);
  return { crowd, served, launches };
}

function run(crowd: ParkCrowd, seconds: number, onStep?: () => void) {
  for (let t = 0; t < seconds; t += STEP) {
    crowd.update(STEP, () => ({ rate: 1, byPlayer: false }), () => ({ hero: false, staff: true }));
    onStep?.();
  }
}

describe('visitor groups', () => {
  it('come as families, pairs of teenagers and couples, sharing one wish list', () => {
    const { crowd } = park();
    const groups = new Set<NonNullable<ParkVisitor['group']>>();
    run(crowd, 200, () => {
      for (const v of crowd.visitors) if (v.group) groups.add(v.group);
    });
    expect(groups.size).toBeGreaterThan(3);
    const kinds = new Set([...groups].map((g) => g.kind));
    expect(kinds.size).toBeGreaterThan(1);
    for (const g of groups) {
      if (g.kind === 'family') expect(g.members.filter((m) => m.child).length).toBeGreaterThan(0);
      if (!g.wishes) continue;
      for (const m of g.members.filter((m) => m.ticket)) expect(g.wishes).toEqual(expect.arrayContaining(m.wishes));
    }
  });

  it('wait for each other by the way out, then go on to the same thing together', () => {
    const { crowd } = park();
    let regrouped = 0;
    let together = 0;
    run(crowd, 300, () => {
      for (const v of crowd.visitors) {
        if (v.step === 'regroup') regrouped++;
        const mates = v.group?.members.filter((m) => m !== v && crowd.visitors.includes(m)) ?? [];
        if (v.rideHeading && mates.some((m) => m.rideHeading === v.rideHeading)) together++;
      }
    });
    expect(regrouped).toBeGreaterThan(0);
    expect(together).toBeGreaterThan(0);
  });
});

describe('school trips', () => {
  it('bring a class of children who want the rides children like', () => {
    const { crowd } = park();
    const kids = crowd.spawnTrip(layout.busStop.stop, TUNING.park.school.children);
    expect(kids.length).toBe(TUNING.park.school.children);
    expect(kids.every((k) => k.trip && k.child)).toBe(true);
    run(crowd, 200);
    const rides = kids.filter((k) => k.ticket).flatMap((k) => (k.wished ? [k] : []));
    expect(rides.length).toBeGreaterThan(0);
  });
});

describe('servicing a worn ride', () => {
  function ride(): Ride {
    return new Ride('carousel', RIDES.carousel!, layout.rides.carousel!);
  }

  it('is done at the lever while it stands empty, once worn past the mark, and pays a little more for a few runs', () => {
    const r = ride();
    r.wear = RULES.serviceAt - 0.05;
    expect(r.service(RULES.repairSeconds + 1, true)).toBe(false);
    r.wear = RULES.serviceAt + 0.05;
    let done = false;
    for (let t = 0; t < RULES.repairSeconds + 0.2 && !done; t += STEP) done = r.service(STEP, true);
    expect(done).toBe(true);
    expect(r.wear).toBe(0);
    expect(r.bonusRuns).toBe(RULES.serviceRuns);
    const launch = r.launch('staff', false);
    expect(launch.serviced).toBe(true);
    expect(r.bonusRuns).toBe(RULES.serviceRuns - 1);
  });

  it("can't be done with riders aboard, or by nobody", () => {
    const r = ride();
    r.wear = 0.9;
    expect(r.service(5, false)).toBe(false);
    r.seats[0] = new ParkVisitor(null, r.seatPoint(0), 40, 60, false);
    expect(r.service(5, true)).toBe(false);
  });
});

describe('extra seats', () => {
  it('add seats a ride fills before it goes, up to what its model holds', () => {
    const r = new Ride('teacups', RIDES.teacups!, layout.rides.teacups!);
    r.setSeats(RIDES.teacups!.seats + 2);
    expect(r.seats.length).toBe(RIDES.teacups!.seats + 2);
    r.setSeats(3);
    expect(r.seats.length).toBe(RIDES.teacups!.seats + 2);
    expect(maxLevel('teacups.seats')).toBe(4);
    expect(maxLevel('flume.seats')).toBe(2);
    expect(maxLevel('carousel.speed')).toBe(UPGRADES.kinds.speed!.max);
  });

  it('are offered only for rides whose models have room', () => {
    for (const [panel, keys] of Object.entries(UPGRADES.panels)) {
      for (const key of keys.filter((k) => k.endsWith('.seats'))) {
        expect(UPGRADES.maxLevels?.[key], `${panel}: ${key}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('one operator a zone', () => {
  it('puts every ride in a zone: Kiddie Corner, the Midway, Lakeside or the Thrill Zone', () => {
    for (const def of Object.values(RIDES)) expect(['kiddie', 'midway', 'lakeside', 'thrill']).toContain(def.zone);
    expect(RIDES.haunted!.zone).toBe('thrill');
    expect(RIDES.swings!.zone).toBe('lakeside');
  });
});

describe('ticket price', () => {
  it('is what rides and the gate offer, in place of quality', () => {
    for (const ride of ['carousel', 'teacups', 'bumper', 'swings', 'boats', 'haunted', 'flume', 'coaster']) {
      expect(UPGRADES.panels[ride]).toContain(`${ride}.price`);
      expect(UPGRADES.panels[ride]).not.toContain(`${ride}.quality`);
    }
    expect(UPGRADES.panels.booth).toContain('booth.price');
    expect(UPGRADES.kinds.price!.factor).toBe(UPGRADES.kinds.quality!.factor);
  });
});
