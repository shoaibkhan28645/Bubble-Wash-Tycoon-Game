// Map 1's cars drive as a driver would: pulling away gently, slowing for bends and to stop, easing off in
// time for a car ahead (the road rules say how much room there is), and round corners on a curve.
import { afterEach, describe, expect, it } from 'vitest';
import { CARS, type Point } from '../src/core/config';
import type { CarModel } from '../src/render/models/actors';
import { Car } from '../src/systems/cars';
import { RoadRules } from '../src/systems/roadRules';

const DT = 1 / 60;

/** A car with a stand-in model (no drawing in tests). */
function car(at: Point): Car {
  const position = {
    x: at.x,
    y: 0,
    z: at.z,
    set(x: number, y: number, z: number) {
      Object.assign(this, { x, y, z });
    },
  };
  const model = {
    mesh: { position, rotation: { y: 0 }, scale: { setScalar: () => {} }, visible: true },
    setType: () => {},
    setClean: () => {},
    animate: () => {},
  };
  return new Car(model as unknown as CarModel);
}

const SEDAN = CARS.find((c) => !c.vip && c.id !== 'monster')!;

/** Drives cars for `seconds` (or until all have arrived); each car's speed every frame. */
function drive(cars: Car[], seconds: number): number[][] {
  const speeds: number[][] = cars.map(() => []);
  const last = cars.map((c) => c.position);
  for (let t = 0; t < seconds && cars.some((c) => !c.arrived); t += DT) {
    cars.forEach((c, i) => {
      c.update(DT, 8);
      const p = c.position;
      speeds[i]!.push(Math.hypot(p.x - last[i]!.x, p.z - last[i]!.z) / DT);
      last[i] = p;
    });
  }
  return speeds;
}

afterEach(() => {
  Car.rules = null;
});

describe('a car on map 1', () => {
  it('pulls away gently, slows for the bend, takes it on a curve, and eases to a stop where it was going', () => {
    const c = car({ x: 0, z: 0 });
    c.spawn(SEDAN, { x: 0, z: 0 }, [{ x: 0, z: 20 }], { x: 20, z: 20 });
    // From a standstill (as if it had just stopped).
    c.follow([{ x: 0, z: 20 }, { x: 20, z: 20 }]);
    (c as unknown as { vel: number }).vel = 0;
    const corner = { x: 0, z: 20 };
    let closest = Infinity;
    const speeds: number[] = [];
    let last = c.position;
    for (let t = 0; t < 30 && !c.arrived; t += DT) {
      c.update(DT, 8);
      const p = c.position;
      speeds.push(Math.hypot(p.x - last.x, p.z - last.z) / DT);
      closest = Math.min(closest, Math.hypot(p.x - corner.x, p.z - corner.z));
      last = p;
    }
    expect(c.arrived).toBe(true);
    expect(c.position).toEqual({ x: 20, z: 20 });
    // No jumps in speed: it speeds up and slows down a little each frame (up to the last, where it stops on the spot at a crawl).
    for (let i = 1; i < speeds.length - 1; i++) expect(Math.abs(speeds[i]! - speeds[i - 1]!)).toBeLessThan(25 * DT);
    expect(Math.max(...speeds)).toBeGreaterThan(7.5);
    // Round the bend on a curve, slower than flat out; and it rolls up to the end slowly.
    expect(closest).toBeGreaterThan(0.5);
    const atBend = speeds[Math.floor(speeds.length / 2)]!;
    expect(atBend).toBeLessThan(6);
    expect(speeds.at(-2)!).toBeLessThan(1.5);
  });

  it('keeps track of the way in: once round its corner, a new spot down the lane takes it straight there', () => {
    const c = car({ x: 0, z: 0 });
    c.spawn(SEDAN, { x: 0, z: 0 }, [{ x: 0, z: 10 }], { x: 10, z: 10 });
    // Round the corner and on a little.
    for (let t = 0; t < 5 && c.position.x < 3; t += DT) c.update(DT, 8);
    expect(c.position.x).toBeGreaterThan(2.5);
    c.driveTo({ x: 6, z: 10 });
    const before = c.position;
    for (let t = 0; t < 5 && !c.arrived; t += DT) c.update(DT, 8);
    expect(c.arrived).toBe(true);
    expect(c.position).toEqual({ x: 6, z: 10 });
    // It never went back towards the corner.
    expect(before.x).toBeLessThan(6);
  });

  it('eases off for a car stopped ahead, and draws up behind it rather than stopping dead', () => {
    const ahead = car({ x: 0, z: 30 });
    ahead.spawn(SEDAN, { x: 0, z: 30 }, [], { x: 0, z: 30.01 });
    const behind = car({ x: 0, z: 0 });
    behind.spawn(SEDAN, { x: 0, z: 0 }, [], { x: 0, z: 60 });
    const cars = [ahead, behind];
    Car.rules = new RoadRules(() => cars, () => []);
    const [, speeds] = drive([ahead, behind], 12);
    const length = SEDAN.size[2];
    // It stopped behind the other car, with room to spare, and not through it.
    expect(behind.position.z).toBeLessThan(30 - length);
    expect(behind.position.z).toBeGreaterThan(30 - length - 2);
    expect(behind.held).toBe(true);
    // And it slowed down on the way: no frame where it went from driving to standing.
    for (let i = 1; i < speeds!.length; i++) expect(speeds![i - 1]! - speeds![i]!).toBeLessThan(25 * DT);
  });
});
