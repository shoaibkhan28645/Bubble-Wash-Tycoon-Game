// Skyport's planes never pass through anything: the taxiway's far enough from the stands that a wide-body or the
// Sky Queen taxiing past clears the tails of the big planes parked there and the buildings' fronts; far enough from
// the runway that a plane on one clears a plane on the other; a plane waiting for the runway keeps its tail out of
// the first stand's turn; and on a busy day no plane on the ground (its wings, its tailplane, its fuselage, as
// modelled) runs into a building or into another plane.
import { describe, expect, it } from 'vitest';
import { TUNING, type Point, type Rect } from '../src/core/config';
import { SKYPORT } from '../src/core/skyport';
import { Airfield, holdFor, planeAt, type Flight } from '../src/systems/airport';
import { PLANES, planeFootprint, type PlaneKindName } from '../src/render/models/airport';

const layout = SKYPORT.layout;
const rules = TUNING.airport;
const DT = 1 / 30;
const KINDS = Object.keys(PLANES) as PlaneKindName[];
const halfSpan = (kind: PlaneKindName): number => PLANES[kind].size.span / 2;
const widest = Math.max(...KINDS.map(halfSpan));
const spots = [...Object.values(layout.gates), ...Object.values(layout.stands)];

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('room round the taxiway', () => {
  it('lets the widest plane taxi past every parked plane’s tail and every building’s front', () => {
    const tip = layout.taxiway.z + widest;
    for (const spot of spots) {
      if (spot === layout.stands.skyqueen) continue;
      const kind = planeAt(spot);
      expect(spot.noseZ - PLANES[kind].size.length - tip, `${kind} at x ${spot.x}`).toBeGreaterThan(1);
    }
    // (The hangar's door leaves stand out in front of it, stacked aside.)
    for (const front of [layout.hangar!.hall.minZ - 0.85, layout.jetwash!.hall.minZ, layout.tower.at.z - 2.6, layout.cargo!.shed.minZ]) expect(front - tip).toBeGreaterThan(3);
  });

  it('keeps a plane on the taxiway clear of one on the runway', () => {
    expect(layout.taxiway.z - layout.runway.z).toBeGreaterThan(2 * widest + 1);
  });

  it('holds a plane waiting for the runway with its tail out of the first stand’s turn', () => {
    const west = spots.reduce((a, b) => (b.x < a.x ? b : a));
    for (const kind of KINDS) {
      // (The Sky Queen only flies once there's a second runway.)
      for (const second of kind === 'queen' ? [true] : [false, true]) {
        const hold = holdFor(layout, rules, kind, second);
        expect(hold + PLANES[kind].size.length / 2, `${kind}`).toBeLessThan(west.x - halfSpan(planeAt(west)));
        // (Short of the link onto the first runway when that's where it's going.)
        if (!second) expect(hold).toBeGreaterThan(layout.links.entry);
      }
    }
  });
});

describe('a busy day on the ground', () => {
  type Piece = { part: string; points: Point[] };
  const placed = (f: Flight): Piece[] => {
    const c = Math.cos(f.heading);
    const s = Math.sin(f.heading);
    return planeFootprint(f.kind).map(({ part, points }) => ({ part, points: points.map((p) => ({ x: f.x + p.x * c + p.z * s, z: f.z - p.x * s + p.z * c })) }));
  };
  /** How far two convex outlines overlap (0 if they don't). */
  const overlap = (a: Point[], b: Point[]): number => {
    let least = Infinity;
    for (const poly of [a, b]) {
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i]!;
        const q = poly[(i + 1) % poly.length]!;
        const nx = -(q.z - p.z);
        const nz = q.x - p.x;
        const n = Math.hypot(nx, nz);
        const along = (v: Point): number => (v.x * nx + v.z * nz) / n;
        const [a0, a1] = [Math.min(...a.map(along)), Math.max(...a.map(along))];
        const [b0, b1] = [Math.min(...b.map(along)), Math.max(...b.map(along))];
        least = Math.min(least, Math.min(a1, b1) - Math.max(a0, b0));
        if (least <= 0) return 0;
      }
    }
    return least;
  };
  const corners = (r: Rect): Point[] => [
    { x: r.minX, z: r.minZ },
    { x: r.maxX, z: r.minZ },
    { x: r.maxX, z: r.maxZ },
    { x: r.minX, z: r.maxZ },
  ];
  // The buildings round the apron, the control tower's base; the hangar's and the jet wash's walls either side
  // (a plane goes in), the hangar's door leaves stacked aside in front, a third of its width each side.
  const hangar = layout.hangar!.hall;
  const wash = layout.jetwash!.hall;
  const stack = (hangar.maxX - hangar.minX) / 6;
  const wall = (x: number, r: Rect): Point[] => corners({ minX: x - 0.3, maxX: x + 0.3, minZ: r.minZ, maxZ: r.maxZ });
  const buildings: [string, Point[]][] = [
    ['hangar', wall(hangar.minX, hangar)],
    ['hangar', wall(hangar.maxX, hangar)],
    ['hangar doors', corners({ minX: hangar.minX, maxX: hangar.minX + stack, minZ: hangar.minZ - 0.85, maxZ: hangar.minZ })],
    ['hangar doors', corners({ minX: hangar.maxX - stack, maxX: hangar.maxX, minZ: hangar.minZ - 0.85, maxZ: hangar.minZ })],
    ['jet wash', wall(wash.minX, wash)],
    ['jet wash', wall(wash.maxX, wash)],
    ['cargo shed', corners(layout.cargo!.shed)],
    ['tower', corners({ minX: layout.tower.at.x - 2.6, maxX: layout.tower.at.x + 2.6, minZ: layout.tower.at.z - 2.6, maxZ: layout.tower.at.z + 2.6 })],
    ['hall', corners(layout.hall)],
    ['wing', corners(layout.wing)],
    ['pier', corners(layout.pier)],
    ['VIP lounge', corners(layout.vip.lounge)],
  ];

  it('never runs a plane into a building or into another plane', () => {
    const into: string[] = [];
    let touches = 0;
    for (const seed of [11, 23]) {
      const airfield = new Airfield(layout, rules, 6, {}, seeded(seed));
      airfield.runway2 = true;
      for (const gate of ['gate1', 'gate2', 'gate3', 'gate4', 'cargo']) airfield.openGate(gate);
      const stands = ['mogul', 'vip', 'mogul2', 'hangar', 'jetwash', 'skyqueen'];
      for (const s of stands) airfield.openGate(s, 0, true);
      airfield.park('skyqueen');
      const random = seeded(seed + 1);
      const turnaround = new Map<Flight, number>();
      const away = new Map<string, number>();
      for (let t = 0; t < 700; t += DT) {
        airfield.update(DT);
        for (const f of airfield.flights) {
          if (f.phase === 'parked' && !f.cleared) {
            if (!turnaround.has(f)) turnaround.set(f, Math.min(f.clockMax, 90) * (0.5 + random() * 0.3));
            if (f.parkedFor >= turnaround.get(f)!) {
              f.boarding = true;
              f.cleared = true;
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
        const ground = airfield.flights.filter((f) => f.y < 0.6).map((f) => ({ f, pieces: placed(f) }));
        for (const { f, pieces } of ground) {
          for (const piece of pieces) {
            for (const [name, outline] of buildings) if (overlap(piece.points, outline) > 0.05) into.push(`${f.gate} ${f.kind} ${f.phase} ${piece.part} into the ${name}`);
          }
        }
        for (let i = 0; i < ground.length; i++) {
          for (let j = i + 1; j < ground.length; j++) {
            let deepest = 0;
            for (const a of ground[i]!.pieces) for (const b of ground[j]!.pieces) deepest = Math.max(deepest, overlap(a.points, b.points));
            // (Wingtips may brush for a moment as two arrivals cross at a link, never more than that.)
            expect(deepest, `${ground[i]!.f.gate} and ${ground[j]!.f.gate}`).toBeLessThan(0.5);
            if (deepest > 0) touches += 1;
          }
        }
      }
    }
    expect([...new Set(into)]).toEqual([]);
    expect(touches).toBeLessThan(10);
  }, 120000);
});
