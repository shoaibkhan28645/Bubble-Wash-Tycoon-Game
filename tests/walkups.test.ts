import { describe, expect, it } from 'vitest';
import { stationDef, type WalkUpLayout } from '../src/core/config';
import { newGame } from '../src/core/gameState';
import { WalkUps, type ServedVisitor, type Visitor } from '../src/systems/walkups';

const RULES = { spawnSeconds: 2, patience: 30, walkSpeed: 2.3, pay: [100, 160] as [number, number] };
/** A walk-up counter of a kind customers on foot use (the Mini-Mart till). */
const KIND = 'counter';

/** A stand beside a walkway: visitors come in at either end and wander off to the two stroll spots. */
const LAYOUT: WalkUpLayout = {
  entrances: [
    { x: -20, z: -4 },
    { x: 20, z: -4 },
  ],
  walkwayZ: -4,
  strolls: [
    { x: -8, z: -9 },
    { x: 8, z: -9 },
  ],
  counters: {
    stand: {
      window: { x: 0, z: 2.3 },
      zone: { minX: -1.1, maxX: 1.1, minZ: 0.2, maxZ: 1.2 },
      queue: [2.3, 3.6, 4.9, 6.2, 7.5].map((z) => ({ x: 0, z })),
      facing: Math.PI,
      approach: { x: 2.4, z: 0.9 },
    },
  },
};

function stand(patience = RULES.patience) {
  const served: ServedVisitor[] = [];
  const gaveUp: Visitor[] = [];
  const walkups = new WalkUps(LAYOUT, newGame(), { ...RULES, patience }, () => 0, () => 0, null, (s) => served.push(s), (v) => gaveUp.push(v), () => 0);
  walkups.open = true;
  walkups.addCounter('stand', KIND, null);
  return { walkups, served, gaveUp };
}

/** Runs the stand for `seconds`, the counter worked at `rate` (0: nobody behind it). */
function run(walkups: WalkUps, seconds: number, rate: number): void {
  for (let t = 0; t < seconds; t += 0.1) walkups.update(0.1, () => ({ rate, byPlayer: rate > 0 }));
}

describe('walk-up counters', () => {
  it('brings visitors round to the window, where they wait to be served', () => {
    const { walkups } = stand();
    const [counter] = walkups.counters;
    run(walkups, 25, 0);
    expect(counter!.line.length).toBeGreaterThan(1);
    expect(counter!.front?.at).toEqual(LAYOUT.counters.stand!.window);
    expect(counter!.needsWork).toBe(true);
  });

  it('serves the front of the line, who pays and wanders off, and the next steps up', () => {
    const { walkups, served } = stand();
    const [counter] = walkups.counters;
    run(walkups, 25, 0);
    const first = counter!.front!;
    const second = counter!.line[1]!;
    run(walkups, (stationDef(KIND).seconds ?? 1) + 0.2, 1);
    expect(served[0]?.visitor).toBe(first);
    expect(first.served).toEqual([stationDef(KIND).serves]);
    expect(first.manual).toBe(true);
    expect(counter!.line[0]).toBe(second);
    run(walkups, 3, 0);
    expect(counter!.front).toBe(second);
  });

  it('opens a new counter with a visitor already at the window', () => {
    const { walkups } = stand();
    walkups.parkFirst();
    const counter = walkups.counters[0]!;
    expect(counter.front?.at).toEqual(LAYOUT.counters.stand!.window);
    walkups.parkFirst();
    expect(counter.line.length).toBe(1);
  });

  it('keeps the line to the spots the counter has', () => {
    const { walkups } = stand(1000);
    run(walkups, 120, 0);
    expect(walkups.counters[0]!.line.length).toBeLessThanOrEqual(LAYOUT.counters.stand!.queue.length);
  });

  it('takes a place in line only on getting there, so a long walk in does not hold the line up', () => {
    const far: WalkUpLayout = { ...LAYOUT, entrances: [{ x: -60, z: -4 }, { x: 60, z: -4 }] };
    const served: ServedVisitor[] = [];
    const walkups = new WalkUps(far, newGame(), { ...RULES, patience: 1000 }, () => 0, () => 0, null, (s) => served.push(s), () => {}, () => 0);
    walkups.open = true;
    walkups.addCounter('stand', KIND, null);
    const counter = walkups.counters[0]!;
    let most = 0;
    for (let t = 0; t < 180; t += 0.1) {
      walkups.update(0.1, () => ({ rate: 1, byPlayer: false }));
      most = Math.max(most, counter.line.length);
    }
    // A visitor every 2 s, half a minute away: over 40 served in three minutes (it was 20 when
    // visitors held their place in line from the moment they set off).
    expect(served.length).toBeGreaterThan(40);
    expect(most).toBeLessThanOrEqual(far.counters.stand!.queue.length);
  });

  it('waits patiently at a counter with nothing to sell, and walks on by a full line', () => {
    const { walkups, gaveUp } = stand(5);
    walkups.stocked = () => false;
    run(walkups, 120, 0);
    const counter = walkups.counters[0]!;
    expect(gaveUp).toEqual([]);
    expect(counter.line.length).toBe(LAYOUT.counters.stand!.queue.length);
    // Others came by, found the line full and went on their way.
    expect(walkups.visitors.some((v) => v.state === 'leaving')).toBe(true);
    walkups.stocked = () => true;
    run(walkups, 6, 0);
    expect(gaveUp.length).toBeGreaterThan(0);
  });

  it('loses visitors kept waiting too long, unserved', () => {
    const { walkups, served, gaveUp } = stand(5);
    run(walkups, 40, 0);
    expect(gaveUp.length).toBeGreaterThan(0);
    expect(gaveUp[0]!.served).toEqual([]);
    expect(served).toEqual([]);
  });

  it('sends nobody before the models are ready, and fewer while a rival is open', () => {
    const closed = stand();
    closed.walkups.open = false;
    run(closed.walkups, 30, 0);
    expect(closed.walkups.visitors).toEqual([]);
    const normal = stand(1000);
    const rival = stand(1000);
    rival.walkups.rateFactor = 0.5;
    run(normal.walkups, 9, 0);
    run(rival.walkups, 9, 0);
    expect(rival.walkups.visitors.length).toBeLessThan(normal.walkups.visitors.length);
  });
});
