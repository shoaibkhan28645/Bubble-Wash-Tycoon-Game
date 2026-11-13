// Where rush jobs happen (each town's layout `jobSpots`): every spot, and the
// ground things can spill or wander across, is clear of buildings, fences,
// tracks and queues in the finished town, and off every pad (stepping on one
// would buy it or open its panel), where the hero can walk; a parked car's
// whole footprint is clear too; a perfect launch is at a ride's lever; and
// every job in data/jobs.json has its spots in its town.
import { describe, expect, it } from 'vitest';
import { JOBS, TUNING, fixedSolids, type Point, type Rect, type TownLayout } from '../src/core/config';
import { jobFootprint } from '../src/systems/jobs';
import { ROADSIDE } from '../src/core/towns';
import { WILLOWBROOK } from '../src/core/willowbrook';
import { STARLIGHT } from '../src/core/starlight';
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
] as const;

/** Every pad and upgrade pad, as far as standing on it reaches; but not the pads of what's built for the job (they're gone). */
const padRects = (layout: TownLayout, built: readonly string[]): Rect[] => [
  ...Object.entries(layout.pads)
    .filter(([id]) => !built.includes(id))
    .map(([, p]) => around(p, TUNING.pads.radius)),
  ...Object.values(layout.upgradePads).map((p) => around(p, TUNING.pads.upgradeRadius)),
];

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
