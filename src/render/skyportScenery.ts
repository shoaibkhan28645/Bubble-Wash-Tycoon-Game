// What stands round Skyport and keeps it lively without anyone doing anything: woods beyond the airfield,
// a fence along the apron's sides, floodlight masts, the taxiway's signs; the landside (core/config.ts
// SkyLandside): the forecourt's fountain, lamps, trees, flags, planters and benches along the promenade, the
// fire station and its crash tender, the maintenance workshop and its yard (a spare engine windmilling, a
// forklift lifting its crate), the operations building with its dish, and across the road the car park, the
// hotel and the fuel farm; out past the west fence the flying club's old hangar with its light planes (one
// running its engine) and the radar; in the hall, a drinks machine, plants and a departures board that lists the
// real flights as they come and go. Every model is from art/blender (render/models/airport.ts); the trees are
// the town's own. (Mogul Air's crew house, the cargo trucks and the Sky Queen's viewing stand come with their
// parts, core/skyportGame.ts.)
import { CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, type Object3D } from 'three';
import type { AirportLayout, Rect } from '../core/config';
import type { Flight } from '../systems/airport';
import { Flag, FireTruck, Forklift, Fountain, LightPlane, OpsBuilding, Radar, SpareEngine, footprint, signBoard, signedModel, skyCopies, skyModel } from './models/airport';
import { scatter, seeded } from './terrain';

const PI = Math.PI;

/** Where each flight's going (by its number), for the departures board. */
const PLACES = ['PARIS', 'ROME', 'OSLO', 'LISBON', 'DUBLIN', 'VIENNA', 'MADRID', 'ATHENS', 'PRAGUE', 'NICE', 'MALTA', 'BERGEN'];

/** A flight's line on the board: what it's doing now, in the board's colours. */
function status(flight: Flight): { text: string; colour: string } {
  if (flight.phase === 'approach' || flight.phase === 'rollout') return { text: 'LANDING', colour: '#7ee0c3' };
  if (flight.phase === 'taxiIn') return { text: 'ARRIVED', colour: '#7ee0c3' };
  if (flight.phase === 'parked' && !flight.cleared) {
    if (flight.late) return { text: 'DELAYED', colour: '#ff5fa8' };
    if (flight.ready) return { text: 'CLOSING', colour: '#ffd24a' };
    if (flight.boarding) return { text: 'BOARDING', colour: '#ffd24a' };
    return { text: 'CHECK-IN', colour: '#ffffff' };
  }
  if (flight.phase === 'climb' || flight.phase === 'takeoff') return { text: 'DEPARTED', colour: '#9aa4b0' };
  return { text: 'TAXIING', colour: '#ffffff' };
}

/** The departures board's screen: amber words on black, the flights in the order they came. */
class DeparturesScreen {
  readonly mesh: Mesh;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: CanvasTexture;
  private shown = '';
  constructor(width: number, height: number) {
    this.canvas.width = 512;
    this.canvas.height = Math.round((512 * height) / width);
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.mesh = new Mesh(new PlaneGeometry(width, height), new MeshBasicMaterial({ map: this.texture }));
    this.draw([]);
  }
  draw(flights: readonly Flight[]): void {
    const rows = flights.slice(0, 4).map((f) => ({ number: `SK ${100 + (f.id % 900)}`, place: PLACES[f.id % PLACES.length]!, gate: f.gate.replace('gate', ''), ...status(f) }));
    const key = rows.map((r) => `${r.number}${r.text}`).join('|');
    if (key === this.shown) return;
    this.shown = key;
    const g = this.canvas.getContext('2d')!;
    const { width: w, height: h } = this.canvas;
    g.fillStyle = '#1b2531';
    g.fillRect(0, 0, w, h);
    g.font = `400 ${Math.round(h * 0.13)}px "Lilita One", Nunito, Arial, sans-serif`;
    g.textBaseline = 'middle';
    g.fillStyle = '#ffd24a';
    g.fillText('DEPARTURES', 14, h * 0.12);
    g.fillStyle = '#5b6b7d';
    g.fillRect(10, h * 0.22, w - 20, 2);
    g.font = `400 ${Math.round(h * 0.115)}px "Lilita One", Nunito, Arial, sans-serif`;
    rows.forEach((r, i) => {
      const y = h * (0.33 + i * 0.18);
      g.fillStyle = '#ffffff';
      g.fillText(r.number, 14, y);
      g.fillText(r.place, w * 0.27, y);
      g.fillText(r.gate, w * 0.62, y);
      g.fillStyle = r.colour;
      g.fillText(r.text, w * 0.7, y);
    });
    if (rows.length === 0) {
      g.fillStyle = '#9aa4b0';
      g.fillText('Welcome to Skyport!', 14, h * 0.45);
    }
    this.texture.needsUpdate = true;
  }
}

/** Is (x, z) within `margin` of any of `rects`? */
const inside = (x: number, z: number, margin: number, rects: readonly Rect[]): boolean =>
  rects.some((r) => x > r.minX - margin && x < r.maxX + margin && z > r.minZ - margin && z < r.maxZ + margin);

/** A rectangle given in a model's own space (x across, z along), placed at (x, z) and turned `rot` about y. */
function turned(x: number, z: number, rot: number, local: Rect): Rect {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const xs: number[] = [];
  const zs: number[] = [];
  for (const [lx, lz] of [[local.minX, local.minZ], [local.maxX, local.minZ], [local.minX, local.maxZ], [local.maxX, local.maxZ]] as const) {
    xs.push(x + lx * c + lz * s);
    zs.push(z - lx * s + lz * c);
  }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

export class SkyportScenery {
  readonly group = new Group();
  /** What's solid of all this (the hero walks round it, and so do the passengers and crew). */
  readonly solids: Rect[] = [];
  private readonly movers: { update(dt: number): void }[] = [];
  private readonly screen: DeparturesScreen;
  private timer = 0;

  constructor(layout: AirportLayout) {
    const { lot, apron, hall, plaza, runway, taxiway, links, roadZ, entrance } = layout;
    const add = (object: Object3D, x: number, z: number, rot = 0): Object3D => {
      object.position.set(x, 0, z);
      object.rotation.y = rot;
      this.group.add(object);
      return object;
    };
    const solid = (r: Rect): number => this.solids.push(r);
    /** A post, a pot or a pole: solid `r` round its middle. */
    const pole = (x: number, z: number, r: number): number => solid({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r });
    /** Copies of a model, each as solid as its own outline. */
    const copies = (name: string, at: { x: number; z: number; rot?: number }[], inset = 0.03): void => {
      this.group.add(skyCopies(name, at));
      for (const p of at) solid(footprint(name, p.x, p.z, p.rot ?? 0, inset));
    };

    const land = layout.landside;
    const back = taxiway.z + taxiway.half;

    // Woods round the airfield, clear of the runways, the taxiway and its links, the road, the land either side of
    // it and the flying club: out to the grass's edge each way (only the nearest show, and in the long views).
    const rand = seeded(41);
    const runwayBand: Rect = { minX: runway.minX - 12, maxX: runway.maxX + 12, minZ: runway.z - runway.half - 6, maxZ: runway.z + runway.half + 4 };
    const taxiBand: Rect = { minX: runway.minX - 12, maxX: runway.maxX + 12, minZ: taxiway.z - taxiway.half - 5, maxZ: taxiway.z + taxiway.half + 3 };
    const linkXs = [links.entry, links.exit, links.far, ...(links.east !== undefined ? [links.east] : []), ...(links.queen !== undefined ? [links.queen] : [])];
    const linkBands: Rect[] = linkXs.map((x) => ({ minX: x - 14, maxX: x + 14, minZ: runway.z, maxZ: taxiway.z + 12 }));
    // (Nothing grows between the runway and the taxiway: a wide-body's wings reach across most of it.)
    const between: Rect = { minX: runway.minX - 12, maxX: runway.maxX + 12, minZ: runway.z, maxZ: taxiway.z };
    const road: Rect = { minX: -400, maxX: 400, minZ: roadZ - 6, maxZ: roadZ + 6 };
    // (And clear of where the second runway goes, with the taxiway out round the first's end to it.)
    const second: Rect[] = layout.runway2
      ? [
          { minX: layout.runway2.minX - 12, maxX: layout.runway2.maxX + 12, minZ: layout.runway2.z - layout.runway2.half - 6, maxZ: layout.runway2.z + layout.runway2.half + 4 },
          { minX: (links.around ?? runway.minX) - 9, maxX: runway.minX, minZ: layout.runway2.z, maxZ: taxiway.z + taxiway.half + 3 },
        ]
      : [];
    const grown = (r: Rect, by: number): Rect => ({ minX: r.minX - by, maxX: r.maxX + by, minZ: r.minZ - by, maxZ: r.maxZ + by });
    const around = (p: { x: number; z: number }, hx: number, hz = hx): Rect => ({ minX: p.x - hx, maxX: p.x + hx, minZ: p.z - hz, maxZ: p.z + hz });
    const landRects: Rect[] = land
      ? [grown(land.carPark, 3), grown(land.hotelDrive, 2), around(land.hotel, 11, 7), around(land.fuelFarm, 15, 8), around(land.club, 14, 12), around(land.radar, 4)]
      : [];
    const keepOut = [grown(lot, 2), runwayBand, taxiBand, between, ...linkBands, ...second, road, ...landRects, { minX: links.entry - 14, maxX: links.entry, minZ: back, maxZ: back + 16 }];
    const west = Math.min(runway.minX, layout.runway2?.minX ?? runway.minX, links.around ?? runway.minX) - 85;
    const east = runway.maxX + 75;
    const woods: { x: number; z: number; s: number; r: number }[] = layout.trees.map((t) => ({ x: t.x, z: t.z, s: 2.4 * (t.size ?? 1), r: rand() * 6 }));
    // (Most close round the airport, where the views reach; a few further out towards the horizon.)
    let tries = 0;
    const near = { minX: lot.minX - 55, maxX: lot.maxX + 55 };
    while (woods.length < 160 && tries++ < 12000) {
      const far = woods.length >= 125;
      const x = far ? west + rand() * (east - west) : near.minX + rand() * (near.maxX - near.minX);
      const z = -105 + rand() * 195;
      if (inside(x, z, 2.5, keepOut)) continue;
      woods.push({ x, z, s: 2.2 + rand() * 1.4, r: rand() * 6 });
    }
    // The promenade along the front, lamps and trees in turn (clear of the kerbs, the VIP's car, the bus stop,
    // the forecourt, the truck yard's gate and the Sky Queen's plaza), and a few trees on the far verge.
    const lampZ = plaza.maxZ - 0.7;
    const promenade: { x: number; z: number; rot?: number }[] = [];
    const avenue: { x: number; z: number; s: number; r: number }[] = [];
    const busy: [number, number][] = [
      [layout.vip.kerb.x - 6, layout.vip.kerb.x + 6],
      [(land?.forecourt.minX ?? entrance.x - 15) - 1, (land?.forecourt.maxX ?? entrance.x + 15) + 1],
      ...(land ? [[land.truckYard.minX - 1, land.truckYard.maxX + 1] as [number, number], [land.queenPlaza.minX - 1, land.queenPlaza.maxX + 2] as [number, number]] : []),
    ];
    for (let x = plaza.minX + 4, k = 0; x < plaza.maxX - 2; x += 6, k++) {
      if (busy.some(([a, b]) => x > a && x < b)) continue;
      if (k % 2) avenue.push({ x, z: plaza.maxZ - 1.1, s: 1.9 + rand() * 0.4, r: rand() * 6 });
      else promenade.push({ x, z: lampZ, rot: PI });
    }
    for (let x = west + 40; x < east - 40; x += 11) {
      const z = roadZ + 8.5 + rand() * 1.5;
      if (inside(x, z, 3, [...landRects, grown(lot, 2)])) continue;
      avenue.push({ x, z, s: 2.0 + rand() * 0.6, r: rand() * 6 });
    }
    // A little garden on the lawn between Mogul Air's office and the VIP lounge: a tree, planters, a bench.
    const lawn = { x: (layout.mogul.office.maxX + layout.vip.lounge.minX) / 2, z: layout.mogul.office.minZ + 7.5 };
    avenue.push({ x: lawn.x, z: lawn.z + 5.4, s: 2.1, r: rand() * 6 });
    const trees = [...woods, ...avenue];
    this.group.add(
      scatter('nature:tree_oak', trees.filter((_, i) => i % 3 === 0)),
      scatter('nature:tree_default', trees.filter((_, i) => i % 3 === 1)),
      scatter('nature:tree_fat', trees.filter((_, i) => i % 3 === 2)),
    );
    for (const t of avenue) if (inside(t.x, t.z, 0, [lot])) pole(t.x, t.z, 0.45);

    // A fence down each side of the apron, floodlight masts at its corners: all well back from the taxiway (a
    // wide-body's wingtips reach ten metres out from it, a private jet's low ones five, and the Sky Queen's nose
    // swings out over the corner as she turns off her link).
    const fence: { x: number; z: number; rot: number }[] = [];
    for (let z = apron.maxZ - 1; z > back + 11; z -= 3) {
      fence.push({ x: lot.minX - 0.6, z, rot: PI / 2 }, { x: lot.maxX + 1.2, z, rot: PI / 2 });
    }
    copies('sp_fence', fence, 0);
    const floods = [
      { x: lot.minX - 1.6, z: back + 12.5, rot: -PI / 4 },
      // (Out of the Sky Queen's way as she turns off her link onto the taxiway.)
      { x: links.queen !== undefined ? links.queen + 10 : lot.maxX + 2.2, z: back + 12.5, rot: PI / 4 },
      { x: lot.minX - 1.6, z: apron.maxZ - 4.5, rot: -PI / 2 },
      { x: lot.maxX + 2.2, z: apron.maxZ - 4.5, rot: PI / 2 },
    ];
    this.group.add(skyCopies('sp_flood', floods));
    for (const f of floods) pole(f.x, f.z, 0.45);
    // Taxiway signs: one in the gap between Gate 4's wide-body and the freighter's stand, by the tower (clear of
    // both as they turn in or back out, and of the widest wingtips on the taxiway), one out by the runway's start,
    // clear of a plane holding for it.
    const signs: [number, number, string][] = [
      [layout.tower.at.x + 4.6, back + 9.5, '← A  |  CARGO'],
      [links.entry + 6, back + 9, 'A →  |  RWY 09'],
    ];
    for (const [x, z, text] of signs) {
      const sign = add(skyModel('sp_sign'), x, z);
      solid(footprint('sp_sign', x, z, 0, 0.02));
      const face = signBoard(text, 1.66, 0.62, '#ffd24a', '#1f2a36');
      face.position.set(0, 0.75, 0.15);
      sign.add(face);
    }
    // A power unit by the Sky Queen's apron, out of her way.
    const gpus = [{ x: lot.maxX - 1.2, z: -8.5, rot: PI }, ...(land ? [{ x: land.gpu.x, z: land.gpu.z, rot: PI / 2 }] : [])];
    this.group.add(skyCopies('sp_gpu', gpus));
    for (const g of gpus) solid(turned(g.x, g.z, g.rot, { minX: -0.6, maxX: 0.6, minZ: -0.85, maxZ: 0.85 }));

    if (land) {
      // Out past the west fence: the flying club's old hangar with its light planes (one running), the radar,
      // the windsock's neighbours.
      const club = land.club;
      const clubhouse = add(skyModel('sp_clubhouse'), club.x, club.z, PI / 2);
      solid(footprint('sp_clubhouse', club.x, club.z, PI / 2, 0.05));
      const clubSign = signBoard('FLYING CLUB', 3.4, 0.62, '#ffffff', '#e8493f');
      const at = clubhouse.getObjectByName('sp_clubhouse_sign');
      if (at) {
        clubSign.position.copy(at.position);
        clubhouse.add(clubSign);
      }
      for (const [dx, dz, rot, running] of [
        [8.0, 6.5, PI / 2 + 0.3, true],
        [7.0, -6.0, PI / 2 - 0.2, false],
      ] as const) {
        const plane = new LightPlane(running);
        add(plane.root, club.x + dx, club.z + dz, rot);
        this.movers.push(plane);
      }
      const radar = new Radar();
      add(radar.root, land.radar.x, land.radar.z);
      solid(footprint('sp_radar', land.radar.x, land.radar.z, 0, 0.15));
      this.movers.push(radar);

      // The west end of the landside, behind the jet wash and the hangar: the fire station (its crash tender half
      // out of the open bay), the maintenance workshop, and the yard: a spare engine, tyres, pallets, a forklift.
      add(signedModel('sp_firestation', 'FIRE', 2.4, 0.78, '#d8342c'), land.fireStation.x, land.fireStation.z);
      // (Its walls, and the open bay's sides: the truck's in it.)
      const fs = footprint('sp_firestation', land.fireStation.x, land.fireStation.z, 0, 0.05);
      solid({ ...fs, maxZ: fs.maxZ - 0.3 });
      const truck = new FireTruck();
      const truckAt = { x: land.fireStation.x - 2.6, z: fs.maxZ + 0.6 };
      add(truck.root, truckAt.x, truckAt.z);
      solid(footprint('sp_firetruck', truckAt.x, truckAt.z, 0, 0.05));
      this.movers.push(truck);
      add(signedModel('sp_workshop', 'MAINTENANCE', 5.0, 0.7), land.workshop.x, land.workshop.z);
      solid(footprint('sp_workshop', land.workshop.x, land.workshop.z, 0, 0.05));
      const engine = new SpareEngine();
      add(engine.root, land.engine.x, land.engine.z);
      solid(footprint('sp_engine', land.engine.x, land.engine.z, 0, 0.05));
      this.movers.push(engine);
      copies('sp_tyres', [{ x: land.tyres.x, z: land.tyres.z }, { x: land.workshop.x + 4.5, z: land.workshop.z + 6.2, rot: 0.6 }]);
      copies('sp_pallets', [{ x: land.pallets.x, z: land.pallets.z }, { x: land.workshop.x - 4.0, z: land.workshop.z + 7.0, rot: PI }]);
      // A set of air stairs and a baggage tug parked in the yard, cones round the spare engine.
      copies('sp_stairs', [{ x: land.tyres.x + 0.6, z: land.tyres.z + 4.6, rot: PI / 2 }]);
      copies('sp_tug', [{ x: land.gpu.x - 4.2, z: land.gpu.z + 0.2, rot: -PI / 2 }]);
      this.group.add(skyCopies('sp_cone', [-1, 1].flatMap((e) => [{ x: land.engine.x + e * 1.6, z: land.engine.z - 2.4 }, { x: land.engine.x + e * 1.6, z: land.engine.z + 2.2 }])));
      const lift = new Forklift();
      add(lift.root, land.forklift.x, land.forklift.z, -PI / 2);
      solid(footprint('sp_forklift', land.forklift.x, land.forklift.z, -PI / 2, 0.05));
      this.movers.push(lift);

      // The operations building behind the tower, its dish turning.
      const ops = new OpsBuilding();
      add(ops.root, land.ops.x, land.ops.z);
      const of = footprint('sp_ops', land.ops.x, land.ops.z, 0, 0.05);
      // (The building, and the posts of the canopy over its door.)
      solid({ ...of, minZ: of.minZ + 1.6 });
      for (const dx of [0.2, 3.0]) pole(land.ops.x + dx, of.minZ + 0.15, 0.1);
      this.movers.push(ops);

      // The forecourt's fountain, at the terminal's doors.
      const fountain = new Fountain();
      add(fountain.root, land.fountain.x, land.fountain.z);
      pole(land.fountain.x, land.fountain.z, 2.75);
      this.movers.push(fountain);

      // Across the road: the car park (two rows of cars nosed in to its aisle, a few bays empty), the hotel, the
      // fuel farm.
      const park = land.carPark;
      const cars: { x: number; z: number; rot: number }[][] = [[], [], []];
      const rows = [
        { z: park.minZ + 2.6, rot: 0 },
        { z: park.minZ + 11.4, rot: PI },
      ];
      for (const row of rows) {
        for (let x = park.minX + 1.5; x < park.maxX - 1; x += 2.6) {
          if (rand() < 0.22) continue;
          cars[Math.floor(rand() * 3)]!.push({ x: x + (rand() - 0.5) * 0.2, z: row.z + (rand() - 0.5) * 0.3, rot: row.rot + (rand() - 0.5) * 0.06 });
        }
      }
      cars.forEach((at, k) => at.length && this.group.add(skyCopies(`sp_car${k}`, at)));
      const parkLamps = [park.minX + 10, (park.minX + park.maxX) / 2, park.maxX - 10].map((x) => ({ x, z: (park.minZ + park.maxZ) / 2 - 1, rot: PI / 2 }));
      promenade.push(...parkLamps);
      add(signedModel('sp_hotel', 'SKYPORT HOTEL', 6.2, 1.0), land.hotel.x, land.hotel.z);
      add(skyModel('sp_fuelfarm'), land.fuelFarm.x, land.fuelFarm.z);
    }

    // The plaza: lamps along the road and the promenade, the airport's flags, planters, benches, the taxi rank's sign.
    const lamps = [entrance.x - 11.9, entrance.x - 6.6, entrance.x + 6.4, entrance.x + 11.6].map((x) => ({ x, z: lampZ, rot: PI }));
    this.group.add(skyCopies('sp_lamp', [...lamps, ...promenade]));
    for (const l of [...lamps, ...promenade]) if (inside(l.x, l.z, 0, [lot])) pole(l.x, l.z, 0.24);
    const flagsX = land ? land.forecourt.maxX - 5.4 : plaza.maxX - 7;
    for (const x of [flagsX, flagsX + 1.8, flagsX + 3.6]) {
      const flag = new Flag();
      add(flag.root, x, plaza.minZ + 2.2);
      pole(x, plaza.minZ + 2.2, 0.24);
      this.movers.push(flag);
    }
    copies('sp_planter', [
      { x: entrance.x + 7.2, z: plaza.minZ + 1.0 },
      { x: entrance.x - 7.6, z: plaza.maxZ - 2.6 },
      { x: lawn.x - 2.4, z: lawn.z, rot: PI / 2 },
      { x: lawn.x + 2.4, z: lawn.z, rot: PI / 2 },
    ]);
    const fountainX = land?.fountain.x ?? entrance.x + 30;
    copies('sp_bench', [
      { x: fountainX - 4.6, z: plaza.maxZ - 1.0 },
      { x: fountainX + 4.6, z: plaza.maxZ - 1.0 },
      { x: plaza.minX + 9.0, z: plaza.maxZ - 2.6 },
      { x: plaza.minX + 33.0, z: plaza.maxZ - 2.6 },
      { x: lawn.x, z: lawn.z + 2.4 },
    ]);
    copies('sp_bin', [{ x: entrance.x - 6.6, z: plaza.maxZ - 1.9 }, { x: fountainX + 7.0, z: plaza.maxZ - 1.2 }, { x: entrance.x + 2.4, z: hall.maxZ - 2.6 }]);
    const taxiSign = add(skyModel('sp_taxisign'), entrance.x + 2.6, plaza.maxZ - 0.6);
    pole(entrance.x + 2.6, plaza.maxZ - 0.6, 0.14);
    const taxiFace = signBoard('TAXI', 0.9, 0.42, '#ffd24a', '#1f2a36');
    const face = taxiSign.getObjectByName('sp_taxisign_face');
    if (face) {
      taxiFace.position.copy(face.position);
      taxiSign.add(taxiFace);
    }

    // In the hall: the departures board, a drinks machine, plants in the corners.
    const board = add(skyModel('sp_board'), hall.maxX - 4.6, hall.maxZ - 4.2);
    solid(footprint('sp_board', hall.maxX - 4.6, hall.maxZ - 4.2, 0, 0.02));
    this.screen = new DeparturesScreen(2.74, 1.28);
    const screenAt = board.getObjectByName('sp_board_screen');
    if (screenAt) this.screen.mesh.position.copy(screenAt.position);
    board.add(this.screen.mesh);
    copies('sp_vending', [{ x: hall.maxX - 1.2, z: hall.maxZ - 8.6, rot: -PI / 2 }, { x: hall.minX + 1.0, z: hall.maxZ - 5.8, rot: PI / 2 }]);
    const plants = [
      { x: hall.minX + 0.9, z: hall.maxZ - 0.9 },
      { x: hall.maxX - 0.9, z: hall.maxZ - 0.9 },
      { x: hall.minX + 0.9, z: hall.minZ + 6.0 },
      { x: hall.maxX - 0.9, z: hall.minZ + 6.0 },
      { x: entrance.x - 3.4, z: hall.maxZ - 0.9 },
      { x: entrance.x + 3.4, z: hall.maxZ - 0.9 },
    ];
    this.group.add(skyCopies('sp_plant', plants));
    for (const p of plants) pole(p.x, p.z, 0.46);
  }

  /** One frame: the flags, the running light plane, the radar; the board shows the flights every second. */
  update(dt: number, flights: readonly Flight[]): void {
    for (const mover of this.movers) mover.update(dt);
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 1;
    this.screen.draw(flights);
  }
}
