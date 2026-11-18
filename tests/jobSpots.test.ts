// Where rush jobs happen (each town's layout `jobSpots`): every spot, and the
// ground things can spill or wander across, is clear of buildings, fences,
// tracks and queues in the finished town, and off every pad (stepping on one
// would buy it or open its panel), where the hero can walk; a parked car's
// whole footprint is clear too; a perfect launch is at a ride's lever; and
// every job in data/jobs.json has its spots in its town.
import { describe, expect, it } from 'vitest';
import { JOBS, TUNING, fixedSolids, type Point, type Rect, type TownLayout } from '../src/core/config';
import { jobFootprint } from '../src/systems/jobs';
import { podiumFront } from '../src/systems/airport';
import { ROADSIDE } from '../src/core/towns';
import { WILLOWBROOK } from '../src/core/willowbrook';
import { STARLIGHT } from '../src/core/starlight';
import { SKYPORT } from '../src/core/skyport';
import { PLANES, entranceSign, hallWalls, loungeSeatSolids, roomWalls, securityLaneSolids } from '../src/render/models/airport';
import { SOLID } from '../src/systems/buildings';
import { FARM_SOLIDS } from '../src/render/models/farm';
import { PARK_SOLIDS } from '../src/render/models/park';
import { Track, trackSolids } from '../src/render/track';

type Boxes = Record<string, [number, number, number?, number?][]>;

/** Every pad's building's solid boxes, all built. */
function built(layout: TownLayout, table: Boxes, at: (id: string) => Point | undefined): Rect[] {
  const rects: Rect[] = [];
  for (const [id, boxes] of Object.entries(table)) {
    const p = at(id);
    if (!p) continue;
    for (const [hw, hd, dx = 0, dz = 0] of boxes) rects.push({ minX: p.x + dx - hw, maxX: p.x + dx + hw, minZ: p.z + dz - hd, maxZ: p.z + dz + hd });
  }
  return [...rects, ...fixedSolids(layout)];
}

const around = (p: Point, half: number): Rect => ({ minX: p.x - half, maxX: p.x + half, minZ: p.z - half, maxZ: p.z + half });
/** How far a point is from a rectangle (0 inside). */
const gap = (p: Point, r: Rect) => Math.hypot(Math.max(r.minX - p.x, 0, p.x - r.maxX), Math.max(r.minZ - p.z, 0, p.z - r.maxZ));

const TOWNS = [
  {
    def: ROADSIDE,
    kind: 'carWash',
    solids: () => built(ROADSIDE.layout, SOLID, (id) => ROADSIDE.layout.buildAt[id] ?? ROADSIDE.layout.pads[id]),
  },
  {
    def: WILLOWBROOK,
    kind: 'farm',
    solids: () => {
      const { layout } = WILLOWBROOK;
      const rects = built(layout, FARM_SOLIDS, (id) => layout.buildAt[id] ?? layout.pads[id]);
      // The pens' runs, and the tracks the farm's vehicles drive.
      for (const pen of Object.values(layout.pens)) rects.push(pen.run);
      return [...rects, ...layout.tracks];
    },
  },
  {
    def: STARLIGHT,
    kind: 'park',
    solids: () => {
      const { layout } = STARLIGHT;
      const rects = built(layout, PARK_SOLIDS, (id) => layout.buildAt[id] ?? layout.pads[id] ?? layout.rides[id]?.at);
      for (const id of ['flume', 'coaster'] as const) {
        const spot = layout.rides[id]!;
        rects.push(...trackSolids(new Track(spot.track!, id), spot.deck ? [spot.deck] : []));
      }
      for (const l of layout.lamps) rects.push(around(l, 0.2));
      for (const t of layout.trees) rects.push(around(t, 0.4 * (t.size ?? 1)));
      for (const b of layout.bins) rects.push(around(b, 0.32));
      for (const bed of layout.flowerBeds) rects.push(around(bed, 1));
      // Where people queue for rides and stalls, and the ride levers.
      for (const ride of Object.values(layout.rides)) {
        for (const q of ride.queue) rects.push(around(q, 0.35));
        rects.push(around(ride.lever, 0.55));
      }
      for (const c of Object.values(layout.counters)) for (const q of c.queue) rects.push(around(q, 0.35));
      return rects;
    },
  },
  {
    def: SKYPORT,
    kind: 'airport',
    solids: () => {
      const { layout } = SKYPORT;
      const { desk, hall, belt } = layout;
      const box = (x: number, z: number, hw: number, hd: number): Rect => ({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
      const rects: Rect[] = [
        ...hallWalls(layout),
        // The desk, its bag belt, the barriers along its line.
        box(desk.at.x, desk.at.z, 1.58, 0.48),
        { minX: desk.at.x + 1.6, maxX: desk.at.x + 2.6, minZ: desk.at.z - 2.5, maxZ: desk.at.z + 0.48 },
        ...[-0.72, 0.72].map((dx) => ({ minX: desk.at.x + dx - 0.06, maxX: desk.at.x + dx + 0.06, minZ: desk.at.z + 1.3, maxZ: desk.at.z + 4.4 })),
        // The baggage belt and its cart, the tug parked at the end of the service road.
        { minX: belt.at.x - 1.0, maxX: belt.at.x + 1.0, minZ: belt.at.z - 3.95, maxZ: belt.at.z + 0.95 },
        box(-1.55, 8.6, 1.05, 0.9),
        box(entranceSign(layout).x, entranceSign(layout).z, 3.85, 0.55),
        box(hall.maxX - 4.6, hall.maxZ - 4.2, 1.5, 0.3),
        ...layout.trees.map((t) => box(t.x, t.z, 0.45 * (t.size ?? 1), 0.45 * (t.size ?? 1))),
        // Where the line queues.
        ...desk.queue.map((q) => box(q.x, q.z, 0.35, 0.35)),
        // The power units at the apron's edges.
        box(layout.lot.minX + 1.4, -8.5, 0.6, 0.85),
        box(layout.lot.maxX - 1.2, -8.5, 0.6, 0.85),
      ];
      // Part C: Gate 4's pier, the VIP lounge, the tower, Mogul Air's office, the shuttle's stop, the bag sorter,
      // and the planes on the stands that aren't gates'.
      rects.push(...roomWalls(layout.pier, [{ side: 'north', x: layout.gates.gate4!.door.x, half: 0.75 }, { side: 'south', x: layout.pierSecurity!.arch.x, half: 0.9 }]));
      rects.push(...roomWalls(layout.vip.lounge, [{ side: 'north', x: layout.vip.door.x, half: 0.95 }, { side: 'south', x: layout.vip.door.x, half: 0.95 }]));
      // Gate 4's own security lane, at the pier's door from the plaza, and its line.
      rects.push(...securityLaneSolids(layout.pierSecurity!.arch, true), ...layout.pierSecurity!.queue.map((q) => box(q.x, q.z, 0.35, 0.35)));
      rects.push(box(layout.tower.at.x, layout.tower.at.z, 2.6, 2.6), layout.mogul.office, box(layout.shuttle.stop.x, layout.shuttle.stop.z, 2.45, 1.0), box(layout.sorter.at.x, layout.sorter.at.z, 1.45, 1.3));
      for (const stand of Object.values(layout.stands)) {
        const plane = PLANES[stand.plane ?? 'prop'];
        const mid = stand.noseZ - plane.size.length / 2;
        rects.push({ minX: stand.x - plane.solid.half, maxX: stand.x + plane.solid.half, minZ: mid + plane.solid.tail, maxZ: mid + plane.solid.nose });
        for (const q of plane.solid.parts) for (const side of [-1, 1]) rects.push(box(stand.x + side * q.x, mid + q.z, q.hx, q.hz));
      }
      for (const gate of Object.values(layout.gates)) {
        const plane = PLANES[gate.plane ?? 'prop'];
        const mid = gate.noseZ - plane.size.length / 2;
        // A parked plane's body, wheels and propellers (or engines); its stairs (a stair truck for the
        // wide-body, none at a jet bridge), fuel truck and podium; its lounge's seats.
        rects.push({ minX: gate.x - plane.solid.half, maxX: gate.x + plane.solid.half, minZ: mid + plane.solid.tail, maxZ: mid + plane.solid.nose });
        for (const q of plane.solid.parts) for (const side of [-1, 1]) rects.push(box(gate.x + side * q.x, mid + q.z, q.hx, q.hz));
        if (gate.plane === 'wide') rects.push({ minX: gate.planeDoor.x + 0.1, maxX: gate.stairsFoot.x - 0.35, minZ: gate.stairsFoot.z - 1.1, maxZ: gate.stairsFoot.z + 1.1 });
        else if (!gate.bridge) rects.push({ minX: gate.stairsFoot.x - 3.92, maxX: gate.stairsFoot.x + 0.02, minZ: gate.stairsFoot.z - 0.8, maxZ: gate.stairsFoot.z + 0.8 });
        rects.push(box(gate.truck.x, gate.truck.z, 1.2, 3.3), box(gate.podium.x, gate.podium.z, 0.72, 0.38));
        rects.push(...loungeSeatSolids(gate.lounge));
      }
      return rects;
    },
  },
] as const;

/** Every pad and upgrade pad, as far as standing on it reaches; but not the pads of what's built for the job (they're gone). */
const padRects = (layout: TownLayout, built: readonly string[]): Rect[] => [
  ...Object.entries(layout.pads)
    .filter(([id]) => !built.includes(id))
    .map(([, p]) => around(p, TUNING.pads.radius)),
  ...Object.values(layout.upgradePads).map((p) => around(p, TUNING.pads.upgradeRadius)),
];

describe('the airport', () => {
  it('has room for the hero at every spot they work a gate from (opening it, the ramp pad, the hose, the hold)', () => {
    const solid = TOWNS.find((t) => t.def.id === SKYPORT.id)!.solids();
    const bad: string[] = [];
    for (const [key, gate] of Object.entries(SKYPORT.layout.gates)) {
      const spots = { open: podiumFront(gate), marshal: gate.marshal, hose: gate.fuelSpot, hold: gate.hold };
      for (const [name, p] of Object.entries(spots)) {
        const hit = solid.find((r) => gap(p, r) < TUNING.player.radius);
        if (hit) bad.push(`${key} ${name} at ${p.x}, ${p.z}: by ${JSON.stringify(hit)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('rush job spots', () => {
  for (const { def, kind, solids } of TOWNS) {
    it(`${def.id}: every job here has its spots, all clear of everything solid and where the hero can walk`, () => {
      const spots = def.layout.jobSpots ?? {};
      const solid = solids();
      const rides: Record<string, { lever: Point }> = 'rides' in def.layout ? def.layout.rides : {};
      const { walk } = def.layout;
      const jobs = JOBS.jobs.filter((j) => j.town === kind);
      expect(jobs.length).toBeGreaterThan(0);
      const bad: string[] = [];
      for (const job of jobs) {
        for (const name of [job.from, job.to].filter((n): n is string => !!n)) {
          const list = spots[name];
          expect(list?.length, `${job.id}: spots "${name}"`).toBeGreaterThan(0);
          for (const p of list!) {
            const rects = [...solid, ...padRects(def.layout, [...job.needs, ...(p.needs ? [p.needs] : [])])];
            if (!(p.x > walk.minX + 0.5 && p.x < walk.maxX - 0.5 && p.z > walk.minZ + 0.5 && p.z < walk.maxZ - 0.5)) bad.push(`${name} at ${p.x}, ${p.z}: outside the walk`);
            // A perfect launch: on a ride's lever (where the hero stands to launch it), its own lever.
            if (job.pattern === 'signal' && name === job.from) {
              const lever = rides[p.id ?? '']?.lever;
              if (!lever || Math.hypot(lever.x - p.x, lever.z - p.z) > 0.05 || p.needs !== p.id) bad.push(`${name} at ${p.x}, ${p.z}: not ${p.id}'s lever`);
              continue;
            }
            // Someone (or something) stands here: room round it.
            const hit = rects.find((r) => gap(p, r) < 0.5);
            if (hit) bad.push(`${name} at ${p.x}, ${p.z}: by ${JSON.stringify(hit)}`);
            // A parked car: all of it clear, with room to walk round.
            const footprint = name === job.from ? jobFootprint(job, p) : null;
            if (footprint) {
              const corners = [
                { x: footprint.minX, z: footprint.minZ },
                { x: footprint.maxX, z: footprint.maxZ },
              ];
              const blocked = rects.find((r) => !(footprint.maxX + 0.6 < r.minX || footprint.minX - 0.6 > r.maxX || footprint.maxZ + 0.6 < r.minZ || footprint.minZ - 0.6 > r.maxZ));
              if (blocked) bad.push(`${name} at ${p.x}, ${p.z}: its ${JSON.stringify(corners)} by ${JSON.stringify(blocked)}`);
            }
          }
        }
        // Things spilled about: the whole spread is mostly clear (the job only lays them on clear ground, and
        // needs room for them all).
        if (job.pattern === 'collect') {
          const rects = [...solid, ...padRects(def.layout, job.needs)];
          for (const c of spots[job.from]!) {
            let clear = 0;
            let total = 0;
            const r = job.spread ?? 2;
            for (let x = -r; x <= r; x += 0.25)
              for (let z = -r; z <= r; z += 0.25) {
                if (x * x + z * z > r * r) continue;
                total++;
                const p = { x: c.x + x, z: c.z + z };
                if (rects.every((q) => gap(p, q) >= 0.45)) clear++;
              }
            if (clear / total <= 0.85) bad.push(`${job.from} at ${c.x}, ${c.z}: only ${Math.round((clear / total) * 100)}% of the spread is clear`);
          }
        }
      }
      expect(bad).toEqual([]);
    });
  }
});
