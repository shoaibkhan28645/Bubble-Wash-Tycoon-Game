// Chapter 3's park: visitors buy tickets and line up for rides; a ride fills seat by seat and goes round when
// it's full or when someone pulls its lever.
import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/core/config';
import { newGame } from '../src/core/gameState';
import { STARLIGHT } from '../src/core/starlight';
import { ParkCrowd, ParkVisitor, RIDES, Ride, type Launch } from '../src/systems/park';
import type { WalkUpCounter } from '../src/systems/walkups';

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

  it('serves the candy floss cart to visitors who want it', () => {
    const { crowd, served } = park();
    crowd.addCounter('cart', 'cart', null);
    run(crowd, 200, 1, { hero: false, staff: true });
    expect(served.filter((s) => s === 'cart').length).toBeGreaterThan(0);
  });
});
