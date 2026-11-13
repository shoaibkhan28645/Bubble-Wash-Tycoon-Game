// Chapter 3's park: visitors buy tickets and line up for rides; a ride fills seat by seat and goes round when
// it's full or when someone pulls its lever.
import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/core/config';
import { newGame } from '../src/core/gameState';
import { STARLIGHT } from '../src/core/starlight';
import { ParkCrowd, ParkVisitor, RIDES, Ride, eveningAt, type Launch } from '../src/systems/park';
import type { WalkUpCounter } from '../src/systems/walkups';
import { ParkSupplies, type ParkSupply } from '../src/systems/parkSupplies';
import { Litter } from '../src/systems/litter';

const RULES = TUNING.park.rides;
const { layout } = STARLIGHT;
const STEP = 0.05;

/** A visitor sitting in seat `i` of a ride (or walking to it). */
function sit(ride: Ride, i: number, step: 'seated' | 'boarding' = 'seated'): ParkVisitor {
  const visitor = new ParkVisitor(null, ride.seatPoint(i), 40, 60, false);
  visitor.step = step;
  visitor.ride = ride;
  visitor.seat = i;
  ride.seats[i] = visitor;
  return visitor;
}

function carousel(): Ride {
  return new Ride('carousel', RIDES.carousel!, layout.rides.carousel!);
}

/** Runs a ride's lever for `seconds`; the launch, if any. */
function pull(ride: Ride, seconds: number, hero: boolean, staff = false): { by: string; perfect: boolean } | null {
  for (let t = 0; t < seconds; t += STEP) {
    const launched = ride.lever(STEP, hero, staff);
    if (launched) return launched;
  }
  return null;
}

describe('a ride', () => {
  it('out for a perfect launch, the hero stepping on waits for a full load, and launching it as the last seat fills is perfect', () => {
    const ride = carousel();
    sit(ride, 0);
    sit(ride, 1);
    let launched: { by: string; perfect: boolean } | null = null;
    for (let t = 0; t < 2 && !launched; t += STEP) launched = ride.lever(STEP, true, false, true);
    expect(launched).toBeNull();
    for (let i = 2; i < 8; i++) sit(ride, i);
    launched = ride.lever(STEP, true, false, true);
    expect(launched).toEqual({ by: 'hero', perfect: true });
  });

  it('waits for a full load when nobody pulls the lever, then goes by itself', () => {
    const ride = carousel();
    for (let i = 0; i < 7; i++) sit(ride, i);
    expect(pull(ride, 30, false)).toBeNull();
    sit(ride, 7);
    expect(ride.full).toBe(true);
    // Not on the spot: a moment for the hero to pull it.
    expect(pull(ride, RULES.launchDelay * 0.5, false)).toBeNull();
    expect(pull(ride, RULES.launchDelay, false)).toEqual({ by: 'auto', perfect: false });
  });

  it('goes as soon as the hero steps on the lever, part full, once each time they step on', () => {
    const ride = carousel();
    sit(ride, 0);
    sit(ride, 1);
    const pulled = pull(ride, 1, true);
    expect(pulled).toEqual({ by: 'hero', perfect: false });
    const launch = ride.launch(pulled!.by as 'hero', false);
    expect(launch).toMatchObject({ riders: 2, full: false });
    expect(ride.phase).toBe('running');
    // Standing there through the next load: it waits for a full ride.
    ride.phase = 'loading';
    ride.seats.fill(null);
    sit(ride, 0);
    expect(pull(ride, 5, true)).toBeNull();
  });

  it('is a perfect launch when the hero is on the lever as the last seat fills', () => {
    const ride = carousel();
    for (let i = 0; i < 7; i++) sit(ride, i);
    // On the lever already, having pulled it once: it waits.
    pull(ride, 1, true);
    ride.phase = 'loading';
    expect(pull(ride, 2, true)).toBeNull();
    sit(ride, 7);
    expect(pull(ride, 0.2, true)).toEqual({ by: 'hero', perfect: true });
  });

  it("has the operator launch a full ride at once, and a part-full one once its first rider has waited", () => {
    const ride = carousel();
    sit(ride, 0);
    expect(pull(ride, RULES.operatorWait - 0.5, false, true)).toBeNull();
    expect(pull(ride, 1, false, true)).toEqual({ by: 'staff', perfect: false });
    const full = carousel();
    for (let i = 0; i < 8; i++) sit(full, i);
    expect(pull(full, STEP * 2, false, true)).toEqual({ by: 'staff', perfect: false });
  });

  it('sits riders still walking to their seats at launch, turns for its time, then lets everyone off', () => {
    const ride = carousel();
    sit(ride, 0);
    const late = sit(ride, 1, 'boarding');
    ride.launch('hero', false);
    expect(late.step).toBe('seated');
    expect(ride.seated).toBe(2);
    let turned = 0;
    for (let t = 0; t < ride.cycle + 1 && ride.phase === 'running'; t += STEP) {
      ride.turn(STEP);
      turned = Math.max(turned, ride.speed);
    }
    expect(turned).toBeCloseTo(ride.def.topSpeed, 1);
    expect(ride.phase).toBe('unloading');
    expect(ride.speed).toBe(0);
  });
});

/** A park with the booth, the carousel and the candy floss cart, everyone walking in straight lines. */
function park() {
  const launches: Launch[] = [];
  const served: string[] = [];
  const gaveUp: ParkVisitor[] = [];
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const crowd = new ParkCrowd(
    layout,
    newGame(),
    () => 0,
    () => 0,
    null,
    (_from, to) => [to],
    {
      onServed: (_v, counter: WalkUpCounter) => served.push(counter.id),
      onGaveUp: (v) => gaveUp.push(v),
      onLaunch: (_ride, launch) => launches.push(launch),
    },
    random,
  );
  crowd.open = true;
  crowd.addCounter('booth', 'booth', null);
  crowd.addRide('carousel', 'carousel');
  return { crowd, launches, served, gaveUp };
}

/** Runs the park for `seconds`: the booth worked at `rate`, the hero (or the operator) at the lever or not. */
function run(crowd: ParkCrowd, seconds: number, rate: number, lever: { hero: boolean; staff: boolean }) {
  for (let t = 0; t < seconds; t += STEP) crowd.update(STEP, () => ({ rate, byPlayer: true }), () => lever);
}

describe('the park', () => {
  it('sells tickets at the booth and fills the carousel, which goes round full by itself', () => {
    const { crowd, launches, served } = park();
    crowd.parkFirst();
    run(crowd, 120, 1, { hero: false, staff: false });
    expect(served.filter((s) => s === 'booth').length).toBeGreaterThan(8);
    expect(launches.length).toBeGreaterThan(0);
    expect(launches.every((l) => l.full && l.by === 'auto')).toBe(true);
  });

  it('gives everyone with a ticket the carousel on their wish list, and ticks it off after the ride', () => {
    const { crowd, launches } = park();
    run(crowd, 150, 1, { hero: false, staff: true });
    expect(launches.length).toBeGreaterThan(1);
    const ticketed = crowd.visitors.filter((v) => v.ticket);
    expect(ticketed.length).toBeGreaterThan(0);
    for (const v of ticketed) {
      if (v.step === 'line' || v.step === 'seated' || v.step === 'boarding') expect(v.wishes).toContain('carousel');
      if (v.step === 'offRide') expect(v.wishes).not.toContain('carousel');
    }
    expect(ticketed.some((v) => v.step === 'offRide' || (v.step === 'leaving' && v.state !== 'angry'))).toBe(true);
  });

  it('sends visitors home unhappy when nobody sells them a ticket', () => {
    const { crowd, served, gaveUp } = park();
    run(crowd, TUNING.park.visitors.patience + 40, 0, { hero: false, staff: false });
    expect(served).toEqual([]);
    expect(gaveUp.length).toBeGreaterThan(0);
  });

  it("doesn't keep staff at a stall with nothing to sell: its line waits, and the seller goes back to the tickets", async () => {
    const { pickStation } = await import('../src/systems/staffPlan');
    const { crowd } = park();
    crowd.addCounter('cart', 'cart', null);
    const cart = crowd.counters.find((c) => c.id === 'cart')!;
    let stocked = true;
    crowd.stocked = (counter) => counter !== cart || stocked;
    // People in both lines.
    for (let t = 0; t < 200 && (!cart.front || !crowd.booth?.front); t += STEP) crowd.update(STEP, (c) => ({ rate: c === crowd.booth ? 1 : 0, byPlayer: false }), () => ({ hero: false, staff: true }));
    expect(cart.front).not.toBeNull();
    expect(crowd.booth?.front).not.toBeNull();
    const nobody = () => false;
    // Stocked, the seller stays with the cart's customer; out of candy floss, they go to the booth.
    expect(pickStation([crowd.booth!, cart], ['booth', 'cart'], cart, nobody)).toBe(cart);
    stocked = false;
    crowd.update(STEP, () => ({ rate: 0, byPlayer: false }), () => ({ hero: false, staff: true }));
    expect(cart.needsWork).toBe(false);
    expect(pickStation([crowd.booth!, cart], ['booth', 'cart'], cart, nobody)).toBe(crowd.booth);
    stocked = true;
    crowd.update(STEP, () => ({ rate: 0, byPlayer: false }), () => ({ hero: false, staff: true }));
    expect(cart.needsWork).toBe(true);
  });

  it("gives every wait its own patience: served, a visitor's patience is back to full for the next line", () => {
    const { crowd, served } = park();
    const patience: number[] = [];
    run(crowd, 1, 1, { hero: false, staff: true });
    for (let t = 0; t < 120 && served.length < 3; t += STEP) {
      const before = served.length;
      crowd.update(STEP, () => ({ rate: 1, byPlayer: false }), () => ({ hero: false, staff: true }));
      if (served.length > before) patience.push(...crowd.visitors.filter((v) => v.ticket && v.step !== 'line').map((v) => v.patience / v.patienceMax));
    }
    expect(served.length).toBeGreaterThan(0);
    expect(patience.length).toBeGreaterThan(0);
    // Everyone just through the booth has all their patience for the carousel's line.
    expect(Math.max(...patience)).toBeCloseTo(1, 5);
  });

  it("lets a wish go at a stall that has sold out, without minding (it costs sales, not the rating)", () => {
    const { crowd, gaveUp } = park();
    crowd.addCounter('cart', 'cart', null);
    const cart = crowd.counters.find((c) => c.id === 'cart')!;
    crowd.stocked = (counter) => counter !== cart;
    const left: ParkVisitor[] = [];
    for (let t = 0; t < 400; t += STEP) {
      const before = [...cart.line] as ParkVisitor[];
      const cross = gaveUp.length;
      crowd.update(STEP, (c) => ({ rate: c === crowd.booth ? 1 : 0, byPlayer: false }), () => ({ hero: false, staff: true }));
      const gone = before.filter((v) => !cart.line.includes(v));
      left.push(...gone);
      // Leaving the empty cart's line, nobody was cross, and the cart's off their list.
      for (const v of gone) {
        expect(gaveUp.slice(cross)).not.toContain(v);
        expect(v.wishes).not.toContain('cart');
      }
    }
    expect(left.length).toBeGreaterThan(0);
  });

  it('serves the candy floss cart to visitors who want it', () => {
    const { crowd, served } = park();
    crowd.addCounter('cart', 'cart', null);
    run(crowd, 200, 1, { hero: false, staff: true });
    expect(served.filter((s) => s === 'cart').length).toBeGreaterThan(0);
  });
});

describe('breakdowns', () => {
  it('wears a ride with each go, and a worn-out one breaks down as it stops, when allowed', () => {
    const { crowd } = park();
    const broken: string[] = [];
    (crowd as unknown as { events: { onBroken: (r: Ride) => void } }).events.onBroken = (r) => broken.push(r.id);
    const ride = crowd.ride('carousel')!;
    ride.wear = 0.98;
    sit(ride, 0);
    ride.launch('hero', false);
    expect(ride.wear).toBeGreaterThan(1);
    crowd.canBreak = () => false;
    run(crowd, ride.cycle + 1, 0, { hero: false, staff: false });
    expect(ride.broken).toBe(false);
    ride.phase = 'loading';
    sit(ride, 0);
    ride.launch('hero', false);
    crowd.canBreak = () => true;
    run(crowd, ride.cycle + 1, 0, { hero: false, staff: false });
    expect(ride.broken).toBe(true);
    expect(broken).toEqual(['carousel']);
  });

  it("won't launch while broken, and is fixed by standing at its lever for a few seconds", () => {
    const ride = carousel();
    ride.broken = true;
    ride.wear = 1.1;
    for (let i = 0; i < 8; i++) sit(ride, i);
    expect(pull(ride, 5, true, true)).toBeNull();
    let fixed = false;
    for (let t = 0; t < RULES.repairSeconds - 0.2; t += STEP) fixed ||= ride.repair(STEP, true);
    expect(fixed).toBe(false);
    for (let t = 0; t < 0.4; t += STEP) fixed ||= ride.repair(STEP, true);
    expect(fixed).toBe(true);
    expect(ride.broken).toBe(false);
    expect(ride.wear).toBe(0);
  });

  it('boards bumper cars straight from the way in, not round a platform', () => {
    const ride = new Ride('bumper', RIDES.bumper!, layout.rides.bumper!);
    const path = ride.boardPath(0);
    expect(path).toHaveLength(2);
    expect(path[0]).toEqual(ride.steps);
  });
});

describe('supplies', () => {
  const stalls = [
    { id: 'cart', kind: 'cart', zone: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 } },
    { id: 'burger', kind: 'burger', zone: { minX: 5, maxX: 6, minZ: 0, maxZ: 1 } },
  ];
  const door = { minX: -10, maxX: -9, minZ: 0, maxZ: 1 };
  const S = TUNING.park.supplies;

  /** Someone with a back to carry boxes on, standing at `at`. */
  function carrier(at: { x: number; z: number }) {
    const stack: ParkSupply[] = [];
    return {
      stack,
      timer: 0,
      position: at,
      get full() {
        return stack.length >= 3;
      },
      count: (item: ParkSupply) => stack.filter((s) => s === item).length,
      push: (item: ParkSupply) => void stack.push(item),
      remove: (item: ParkSupply) => {
        const i = stack.lastIndexOf(item);
        if (i < 0) return false;
        stack.splice(i, 1);
        return true;
      },
    };
  }

  it('lets stalls sell freely until the shed opens, then from their stock, full to start', () => {
    const supplies = new ParkSupplies(newGame());
    expect(supplies.hasStock(stalls[0]!)).toBe(true);
    supplies.openShed(stalls);
    expect(supplies.stock('cart')).toBe(S.stall);
    for (let i = 0; i < S.stall; i++) supplies.use(stalls[0]!);
    expect(supplies.hasStock(stalls[0]!)).toBe(false);
    expect(supplies.hasStock({ id: 'booth', kind: 'booth' })).toBe(true);
  });

  it('picks up what the stalls are shortest of at the shed, and hands it over behind the stall', () => {
    const supplies = new ParkSupplies(newGame());
    supplies.openShed(stalls);
    for (let i = 0; i < S.stall; i++) supplies.use(stalls[1]!);
    const back = carrier({ x: -9.5, z: 0.5 });
    for (let k = 0; k < 3; k++) {
      supplies.update([back as never], stalls, door);
      back.timer = 0;
    }
    expect(back.stack).toEqual(['buns', 'buns', 'buns']);
    back.position = { x: 5.5, z: 0.5 };
    for (let k = 0; k < 3; k++) {
      supplies.update([back as never], stalls, door);
      back.timer = 0;
    }
    expect(back.stack).toEqual([]);
    expect(supplies.stock('burger')).toBe(3);
  });

  it("tops the shed up with the truck's load, never past what it holds", () => {
    const supplies = new ParkSupplies(newGame());
    supplies.openShed(stalls);
    expect(supplies.wantsTruck).toBe(false);
    expect(supplies.deliver()).toBe(0);
  });
});

describe('litter', () => {
  it('lands now and then, less with bins, never past a few pieces; the hero picks it up by walking over it', () => {
    const always = new Litter(() => 0);
    for (let i = 0; i < 40; i++) always.drop({ x: i, z: 0 }, false);
    expect(always.pieces.length).toBe(TUNING.park.litter.max);
    const never = new Litter(() => 0.99);
    expect(never.drop({ x: 0, z: 0 }, true)).toBeNull();
    const some = new Litter(() => 0.4);
    expect(some.drop({ x: 0, z: 0 }, false)).not.toBeNull();
    expect(some.drop({ x: 0, z: 0 }, true)).toBeNull();
    expect(some.pickUp({ x: 0.3, z: 0 }, 0.8)).toHaveLength(1);
    expect(some.pieces).toHaveLength(0);
  });
});

describe('part C: storms, busloads, the mascot, evenings', () => {
  it('closes outdoor rides in a storm (their lines wait without minding), but not the haunted house', () => {
    const { crowd } = park();
    const haunted = crowd.addRide('haunted', 'haunted')!;
    crowd.storm = true;
    const carousel = crowd.ride('carousel')!;
    for (let i = 0; i < 8; i++) sit(carousel, i);
    for (let i = 0; i < 6; i++) sit(haunted, i);
    run(crowd, 3, 0, { hero: false, staff: false });
    expect(carousel.paused).toBe(true);
    expect(carousel.phase).toBe('loading');
    expect(haunted.paused).toBe(false);
    expect(haunted.phase).toBe('running');
  });

  it('brings a busload that queues for tickets, waiting about when the line is full', () => {
    const { crowd } = park();
    const n = crowd.spawnGroup(layout.busStop.stop, 10);
    expect(n).toBe(10);
    run(crowd, 40, 0, { hero: false, staff: false });
    const booth = crowd.booth!;
    expect(booth.line.length).toBe(booth.spots);
    expect(crowd.visitors.filter((v) => v.step === 'idle').length).toBeGreaterThan(0);
  });

  it("slows the patience of a line the mascot is cheering up", () => {
    const { crowd } = park();
    crowd.spawnGroup(layout.busStop.stop, 4);
    run(crowd, 30, 0, { hero: false, staff: false });
    const front = crowd.booth!.line[0]!;
    crowd.calm = front.at;
    const before = front.patience;
    run(crowd, 2, 0, { hero: false, staff: false });
    expect(before - front.patience).toBeCloseTo(2 * TUNING.park.mascot.calmFactor, 1);
  });

  it('turns the day to evening and back, fading between', () => {
    const rules = TUNING.park.evening;
    expect(eveningAt(0, rules)).toBe(0);
    expect(eveningAt(rules.day - rules.fade / 2, rules)).toBeCloseTo(0.5);
    expect(eveningAt(rules.day + 1, rules)).toBe(1);
    expect(eveningAt(rules.day + rules.evening + 1, rules)).toBe(0);
  });
});
