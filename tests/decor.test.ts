// Where the boutique's decorations stand (shop.json `decor`): in the finished town, each one's ground is
// clear of buildings, fences, tracks, rides and queues, off every pad, clear of where rush jobs happen,
// staff stand and cash piles up, and off the walkways people follow; inside the walkable ground. A
// string of bunting's poles are clear too; a balloon floats over everything.
import { describe, expect, it } from 'vitest';
import { SHOP, TUNING, fixedSolids, type Point, type Rect, type TownLayout } from '../src/core/config';
import { ROADSIDE } from '../src/core/towns';
import { WILLOWBROOK } from '../src/core/willowbrook';
import { STARLIGHT } from '../src/core/starlight';
import { SOLID } from '../src/systems/buildings';
import { FARM_SOLIDS } from '../src/render/models/farm';
import { PARK_SOLIDS } from '../src/render/models/park';
import { Track, trackSolids } from '../src/render/track';
import { Scene } from 'three';
import { TownDecor, footprint } from '../src/render/townDecor';

type Boxes = Record<string, [number, number, number?, number?][]>;

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
/** The gap between two rectangles (0 if they touch or overlap). */
const apart = (a: Rect, b: Rect) => Math.hypot(Math.max(b.minX - a.maxX, 0, a.minX - b.maxX), Math.max(b.minZ - a.maxZ, 0, a.minZ - b.maxZ));
/** How far a point is from a rectangle (0 inside). */
const gap = (p: Point, r: Rect) => apart(around(p, 0), r);
const segmentGap = (r: Rect, a: Point, b: Point): number => {
  let best = Infinity;
  for (let i = 0; i <= 20; i++) best = Math.min(best, gap({ x: a.x + ((b.x - a.x) * i) / 20, z: a.z + ((b.z - a.z) * i) / 20 }, r));
  return best;
};

const TOWNS: { def: { id: string; layout: TownLayout }; solids: () => Rect[] }[] = [
  { def: ROADSIDE, solids: () => built(ROADSIDE.layout, SOLID, (id) => ROADSIDE.layout.buildAt[id] ?? ROADSIDE.layout.pads[id]) },
  {
    def: WILLOWBROOK,
    solids: () => {
      const { layout } = WILLOWBROOK;
      const rects = built(layout, FARM_SOLIDS, (id) => layout.buildAt[id] ?? layout.pads[id]);
      for (const pen of Object.values(layout.pens)) rects.push(pen.run);
      for (const field of Object.values(layout.fields)) for (const p of field.plots) rects.push({ minX: p.x - 1.4, maxX: p.x + 1.4, minZ: p.z - 1.5, maxZ: p.z + 1.5 });
      return [...rects, ...layout.tracks, layout.pond];
    },
  },
  {
    def: STARLIGHT,
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
      for (const ride of Object.values(layout.rides)) {
        for (const q of ride.queue) rects.push(around(q, 0.35));
        rects.push(around(ride.lever, 0.55));
      }
      // The paths visitors walk, the service yard and the lake (with its shore).
      const { lake } = layout;
      rects.push(...layout.paths, ...layout.yard, { minX: lake.x - lake.rx - 1, maxX: lake.x + lake.rx + 1, minZ: lake.z - lake.rz - 1, maxZ: lake.z + lake.rz + 1 });
      return rects;
    },
  },
];

describe('decorations', () => {
  for (const { def, solids } of TOWNS) {
    it(`${def.id}: every decoration stands clear, where the hero can walk`, () => {
      const layout = def.layout as TownLayout & Record<string, unknown>;
      const decor = SHOP.decor.filter((d) => d.town === def.id);
      expect(decor.length).toBeGreaterThan(0);
      const solid = solids();
      const pads = [...Object.values(layout.pads).map((p) => around(p, TUNING.pads.radius)), ...Object.values(layout.upgradePads).map((p) => around(p, TUNING.pads.upgradeRadius))];
      // Points people use, and how far a decoration keeps from each.
      const points: [Point, number, string][] = [];
      for (const [name, list] of Object.entries(layout.jobSpots ?? {})) for (const p of list) points.push([p, 1.2, `job spot ${name}`]);
      for (const [name, p] of Object.entries((layout.staffSpots ?? {}) as Record<string, Point>)) points.push([p, 0.8, `staff ${name}`]);
      for (const [name, p] of Object.entries((layout.piles ?? {}) as Record<string, Point>)) points.push([p, 1.0, `pile ${name}`]);
      for (const p of (layout.managerRound ?? []) as Point[]) points.push([p, 0.8, 'manager round']);
      const lines: Point[][] = [...((layout.walkways ?? []) as Point[][])];
      for (const v of (layout.benchVisits ?? []) as { from: Point; via: Point[]; bench: Point }[]) lines.push([v.from, ...v.via, v.bench]);
      for (const c of Object.values((layout.counters ?? {}) as Record<string, { queue: Point[]; enter?: Point[]; leave?: Point[]; zone: Rect }>)) {
        lines.push(c.queue);
        if (c.enter) lines.push(c.enter);
        if (c.leave) lines.push(c.leave);
        solid.push(c.zone);
      }
      const { walk } = layout;
      const bad: string[] = [];
      const check = (name: string, ground: Rect): void => {
        if (ground.minX < walk.minX || ground.maxX > walk.maxX || ground.minZ < walk.minZ || ground.maxZ > walk.maxZ) bad.push(`${name}: outside the walk`);
        const hit = [...solid, ...pads].find((r) => apart(ground, r) < 0.3);
        if (hit) bad.push(`${name}: by ${JSON.stringify(hit)}`);
        for (const [p, room, what] of points) if (gap(p, ground) < room) bad.push(`${name}: by ${what} at ${p.x}, ${p.z}`);
        for (const line of lines) for (let i = 1; i < line.length; i++) if (segmentGap(ground, line[i - 1]!, line[i]!) < 0.6) bad.push(`${name}: on a walkway near ${line[i]!.x}, ${line[i]!.z}`);
      };
      for (const d of decor) {
        if (d.y) continue;
        if (d.solid) check(d.id, footprint(d, d.solid));
        if (d.to) {
          check(`${d.id} pole`, around(d, 0.1));
          check(`${d.id} far pole`, around(d.to, 0.1));
        }
        if (!d.solid && !d.to) bad.push(`${d.id}: stands on the ground but takes up none`);
      }
      expect(bad).toEqual([]);
    });
  }
});

describe('town decorations', () => {
  it('puts up and takes down what it is given, and is solid where it stands', () => {
    const scene = new Scene();
    const decor = new TownDecor(scene, { burst: () => {} });
    const tubeman = SHOP.decor.find((d) => d.id === 'tubeman')!;
    const bunting = SHOP.decor.find((d) => d.id === 'bunting')!;
    decor.sync([tubeman, bunting], null);
    expect(scene.getObjectByName('decor')!.children).toHaveLength(2);
    expect(decor.solids()).toEqual([footprint(tubeman, tubeman.solid!)]);
    decor.update(0.1);
    decor.sync([bunting], null);
    expect(scene.getObjectByName('decor')!.children).toHaveLength(1);
    expect(decor.solids()).toEqual([]);
    // The close-up frames bunting by a stretch of it, and a decoration put away by its spot.
    expect(decor.frame(bunting).radius).toBeGreaterThan(3);
    expect(decor.frame(tubeman).center.x).toBeCloseTo(tubeman.x);
  });
});
