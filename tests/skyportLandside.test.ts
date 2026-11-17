// Skyport's redesigned map: the terminal in the middle, Mogul Air's base, the hangar and the jet wash to the west,
// the tower, cargo and the Sky Queen to the east. What stands round them for the look of it (the landside) keeps
// clear of everything the hero and the crew work at, and of the planes; each part's camera area shows its own
// pads, piles and crew as it's built; and the walk from the check-in desk to each place is shorter than it was.
import { describe, expect, it } from 'vitest';
import type { Point, Rect } from '../src/core/config';
import { SKYPORT } from '../src/core/skyport';

const layout = SKYPORT.layout;
const land = layout.landside!;
const pads = SKYPORT.pads;

const box = (p: Point, hx: number, hz: number): Rect => ({ minX: p.x - hx, maxX: p.x + hx, minZ: p.z - hz, maxZ: p.z + hz });
const inside = (p: Point, r: Rect, margin = 0): boolean => p.x > r.minX - margin && p.x < r.maxX + margin && p.z > r.minZ - margin && p.z < r.maxZ + margin;
const overlaps = (a: Rect, b: Rect): boolean => a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;

// Each piece's outline on the ground (the models' sizes, art/blender/skyport_landside.py), with what sticks out:
// the fire station's crash tender half out of its bay, the ops building's canopy, the crew house's bench and bikes.
const pieces: [string, Rect][] = [
  ['fire station', box(land.fireStation, 5.9, 4.9)],
  ['crash tender', box({ x: land.fireStation.x - 2.6, z: land.fireStation.z + 5.6 }, 1.5, 4.2)],
  ['workshop', box(land.workshop, 6.2, 4.2)],
  ['spare engine', box(land.engine, 1.2, 2.4)],
  ['tyres', box(land.tyres, 1.6, 1.4)],
  ['pallets', box({ x: land.pallets.x + 0.9, z: land.pallets.z - 1.0 }, 2.8, 1.6)],
  ['forklift', box({ x: land.forklift.x - 0.3, z: land.forklift.z }, 1.7, 0.7)],
  ['more tyres', box({ x: land.workshop.x + 4.5, z: land.workshop.z + 6.2 }, 1.6, 1.4)],
  ['more pallets', box({ x: land.workshop.x - 4.9, z: land.workshop.z + 8.0 }, 2.8, 1.6)],
  ['air stairs', box({ x: land.tyres.x + 0.6, z: land.tyres.z + 6.5 }, 0.7, 2.0)],
  ['tug', box({ x: land.gpu.x - 4.2, z: land.gpu.z + 0.2 }, 1.2, 0.7)],
  ['power unit', box(land.gpu, 0.9, 0.7)],
  ['crew house', { ...box(land.crewHouse, 3.7, 3.3), maxZ: land.crewHouse.z + 4.8 }],
  ['ops building', { ...box(land.ops, 6.5, 3.9), minZ: land.ops.z - 5.5 }],
  ...land.trucks.map((t, i): [string, Rect] => [`truck ${i + 1}`, box(t, 1.5, 3.8)]),
  ['grandstand', box(land.grandstand, 7.4, 2.6)],
  ['fountain', box(land.fountain, 2.8, 2.8)],
];

/** Everywhere someone stands to work, or goes: pads to buy and upgrade, piles, crew, marshals, the VIP's way out, job spots. */
const spots: [string, Point][] = [
  ...Object.entries(layout.pads).map(([k, p]): [string, Point] => [`pad ${k}`, p]),
  ...Object.entries(layout.upgradePads).map(([k, p]): [string, Point] => [`upgrade ${k}`, p]),
  ...Object.entries(layout.piles).map(([k, p]): [string, Point] => [`pile ${k}`, p]),
  ...Object.entries(layout.staffSpots).map(([k, p]): [string, Point] => [`crew ${k}`, p]),
  ...Object.entries(layout.stands).map(([k, s]): [string, Point] => [`marshal ${k}`, s.marshal]),
  ...layout.vip.photo.map((p, i): [string, Point] => [`photographer ${i}`, p]),
  ['VIP kerb', layout.vip.kerb],
  ['VIP south door', layout.vip.south],
  ['bus stop', layout.shuttle.stop],
  ['jet wash controls', layout.jetwash!.control],
  ['hangar door', layout.hangar!.door],
  ['cargo dock', layout.cargo!.dock],
  ['tower door', layout.tower.door],
  ...(layout.managerWalk ?? []).map((p, i): [string, Point] => [`manager walk ${i}`, p]),
  ...Object.entries(layout.jobSpots ?? {}).flatMap(([k, list]) => list.map((p, i): [string, Point] => [`job ${k} ${i}`, p])),
];

/** The buildings the game puts up, and the stands' paving and the service road. */
const buildings: [string, Rect][] = [
  ['hall', layout.hall],
  ['wing', layout.wing!],
  ['pier', layout.pier!],
  ['VIP lounge', layout.vip.lounge],
  ['Mogul Air office', layout.mogul.office],
  ['cargo shed', layout.cargo!.shed],
  ['hangar', layout.hangar!.hall],
  ['jet wash', layout.jetwash!.hall],
  ['service road', layout.serviceRoad],
  ['apron', { ...layout.apron, maxZ: layout.serviceRoad.minZ }],
  ['Sky Queen apron', { ...layout.skyqueen!.apron, maxZ: layout.stands.skyqueen!.noseZ + 1 }],
];

describe('the land round the terminal', () => {
  it('keeps every building and prop off the pads, the piles, the crew and the ways people go', () => {
    const hits: string[] = [];
    for (const [name, r] of pieces) for (const [what, p] of spots) if (inside(p, r, 1.0)) hits.push(`${name} on ${what}`);
    expect(hits).toEqual([]);
  });

  it('keeps them clear of the buildings, the apron and the service road, and of each other', () => {
    const hits: string[] = [];
    for (const [name, r] of pieces) {
      for (const [other, b] of buildings) if (overlaps(r, b)) hits.push(`${name} into the ${other}`);
      // (The crash tender stands half out of the fire station's open bay.)
      const together = (a: string, b: string): boolean => [a, b].includes('fire station') && [a, b].includes('crash tender');
      for (const [other, b] of pieces) if (other !== name && !together(name, other) && overlaps(r, b)) hits.push(`${name} into the ${other}`);
    }
    expect([...new Set(hits)]).toEqual([]);
  });

  it('stands inside the lot, where the hero can walk round it (the car park, the hotel and the fuel farm across the road)', () => {
    for (const [name, r] of pieces) expect(r.minX >= layout.lot.minX && r.maxX <= layout.lot.maxX && r.minZ >= layout.lot.minZ && r.maxZ <= layout.lot.maxZ, name).toBe(true);
    const across = layout.roadZ + 3.25;
    for (const r of [land.carPark, land.hotelDrive, box(land.hotel, 8, 4.5), box(land.fuelFarm, 12, 5.5)]) expect(r.minZ).toBeGreaterThan(across);
    // (Low enough near the road not to hide the hero on the plaza: only the cars come within ten metres of it.)
    expect(land.hotel.z - 4.5 - across).toBeGreaterThan(7);
    // The flying club and the radar out past the west fence, clear of a plane holding for the runway.
    expect(land.club.x + 6).toBeLessThan(layout.lot.minX);
    expect(land.radar.x + 1.5).toBeLessThan(layout.lot.minX);
  });
});

describe('the map growing part by part', () => {
  it('shows each part’s pads, piles and crew in the camera’s area once it’s bought', () => {
    const order = pads.map((p) => p.id);
    const missing: string[] = [];
    for (let i = 0; i < order.length; i++) {
      const bought = order.slice(0, i + 1);
      // What the camera may show: its base, every bought part's area and pad.
      const shown: Rect[] = [layout.cameraBase, ...bought.flatMap((id) => [layout.areas[id], layout.pads[id] && box(layout.pads[id]!, 1.5, 1.5)]).filter((r): r is Rect => !!r)];
      for (const v of layout.views) if (bought.includes(v.after)) shown.push(v);
      const rect = shown.reduce((a, r) => ({ minX: Math.min(a.minX, r.minX), maxX: Math.max(a.maxX, r.maxX), minZ: Math.min(a.minZ, r.minZ), maxZ: Math.max(a.maxZ, r.maxZ) }));
      const id = order[i]!;
      const staff = pads[i]!.effects.staff as string | undefined;
      for (const [what, p] of [
        ['pad', layout.pads[id]],
        ['upgrade', layout.upgradePads[id]],
        ['pile', layout.piles[id]],
        ['crew', staff ? layout.staffSpots[staff] : undefined],
      ] as const) {
        if (p && !inside(p, rect)) missing.push(`${id} ${what} at ${p.x}, ${p.z}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('puts Mogul Air, the VIP lounge, the hangar and the jet wash west of the terminal, the tower, cargo and the Sky Queen east', () => {
    const hall = layout.hall;
    for (const id of ['mogul', 'vip', 'mogul2', 'hangar', 'jetwash']) expect(layout.stands[id]!.x, id).toBeLessThan(hall.minX);
    for (const id of ['cargo', 'skyqueen']) expect(layout.stands[id]!.x, id).toBeGreaterThan(layout.pier!.maxX);
    expect(layout.tower.at.x).toBeGreaterThan(layout.pier!.maxX);
  });

  it('brings every place the hero works within a short walk of the check-in desk', () => {
    // Along the service road from the desk, as the plan worked out: none further than 130 m, 80 on average.
    const desk = layout.desk.at;
    const road = (layout.serviceRoad.minZ + layout.serviceRoad.maxZ) / 2;
    const walk = (p: Point): number => Math.abs(desk.z - road) + Math.abs(p.x - desk.x) + Math.abs(p.z - road);
    const places = [layout.vip.carpet, layout.mogul.board, layout.tower.door, layout.cargo!.dock, layout.hangar!.service, layout.jetwash!.control, layout.stands.skyqueen!.marshal];
    const walks = places.map(walk);
    expect(Math.max(...walks)).toBeLessThan(130);
    expect(walks.reduce((a, b) => a + b, 0) / walks.length).toBeLessThan(80);
  });
});
