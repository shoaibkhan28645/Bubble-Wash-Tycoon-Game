import { describe, expect, it } from 'vitest';
import type { Walker } from '../src/systems/mart';
import { Pedestrians } from '../src/systems/pedestrians';
import { benchSeats } from '../src/systems/waitingDrivers';

function walker(): Walker & { seated: boolean } {
  return {
    root: { position: { x: 0, z: 0, set(x: number, _y: number, z: number) { this.x = x; this.z = z; } }, rotation: { y: 0 }, visible: false },
    holding: false,
    seated: false,
    update: () => {},
  };
}

describe('bench seats', () => {
  it('seat two side by side, facing out from the bench front', () => {
    const [a, b] = benchSeats({ x: 2, z: 5 });
    expect(a!.at.z).toBeCloseTo(b!.at.z);
    expect(Math.abs(a!.at.x - b!.at.x)).toBeCloseTo(1);
    // Facing +z: the front is in front (+z), and so is the way they face.
    expect(a!.front.z).toBeGreaterThan(a!.at.z);
    expect(a!.facing).toBe(0);
  });

  it('turn with the bench: one turned a quarter turn faces -x, its seats along z', () => {
    const [a, b] = benchSeats({ x: 7.3, z: 16.4 }, -Math.PI / 2);
    expect(a!.at.x).toBeCloseTo(b!.at.x);
    expect(Math.abs(a!.at.z - b!.at.z)).toBeCloseTo(1);
    expect(a!.front.x).toBeLessThan(a!.at.x);
  });
});

describe('people out walking', () => {
  it('some go on from a dead end to a bench, sit a while, and come back; never two to a seat', () => {
    const route = [{ x: -20, z: 0 }, { x: -10, z: 0, turn: true }];
    const seats = benchSeats({ x: 0, z: 0 });
    const made: (Walker & { seated: boolean })[] = [];
    const people = new Pedestrians([route], () => {
      const w = walker();
      made.push(w);
      return w;
    }, () => 0.1, () => [], [{ from: { x: -10, z: 0 }, via: [{ x: -5, z: 2 }], seats }]);
    let most = 0;
    let seatedAtSeat = false;
    for (let t = 0; t < 120; t += 0.1) {
      people.update(0.1);
      most = Math.max(most, people.sitting);
      for (const w of made) {
        if (!w.seated) continue;
        seatedAtSeat ||= seats.some((s) => Math.hypot(s.at.x - w.root.position.x, s.at.z - w.root.position.z) < 1e-6);
      }
    }
    expect(most).toBeGreaterThan(0);
    expect(most).toBeLessThanOrEqual(seats.length);
    expect(seatedAtSeat).toBe(true);
    // Everyone who sat got up again and went on their way (nobody left sitting for ever).
    for (let t = 0; t < 60; t += 0.1) people.update(0.1);
    expect(made.filter((w) => w.seated && !w.root.visible)).toHaveLength(0);
  });

  it('people on other routes never go to the bench', () => {
    const seats = benchSeats({ x: 0, z: 0 });
    const people = new Pedestrians([[{ x: -20, z: 5 }, { x: 20, z: 5 }]], walker, () => 0.1, () => [], [{ from: { x: -10, z: 0 }, via: [], seats }]);
    for (let t = 0; t < 60; t += 0.1) {
      people.update(0.1);
      expect(people.sitting).toBe(0);
    }
  });
});
