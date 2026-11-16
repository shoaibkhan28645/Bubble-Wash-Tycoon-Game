// What stands round Skyport and keeps it lively without anyone doing anything: woods beyond the airfield,
// a fence along the apron's sides, floodlight masts, lamps, flags and planters on the plaza, benches, a
// drinks machine and plants in the hall, a departures board that lists the real flights as they come and
// go, the flying club's old hangar with its light planes (one running its engine), the radar, the taxiway's
// signs. Every model is from art/blender (render/models/airport.ts); the trees are the town's own.
import { CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, type Object3D } from 'three';
import type { AirportLayout, Rect } from '../core/config';
import type { Flight } from '../systems/airport';
import { Flag, LightPlane, Radar, footprint, signBoard, skyCopies, skyModel } from './models/airport';
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

    // Woods round the airfield, clear of the runway, the taxiway and its links, the road and the club.
    const rand = seeded(41);
    const runwayBand: Rect = { minX: runway.minX - 12, maxX: runway.maxX + 12, minZ: runway.z - runway.half - 6, maxZ: runway.z + runway.half + 4 };
    const taxiBand: Rect = { minX: runway.minX - 12, maxX: runway.maxX + 12, minZ: taxiway.z - taxiway.half - 5, maxZ: taxiway.z + taxiway.half + 3 };
    const linkBands: Rect[] = [links.entry, links.exit, links.far].map((x) => ({ minX: x - 6, maxX: x + 6, minZ: runway.z, maxZ: taxiway.z }));
    const road: Rect = { minX: -200, maxX: 200, minZ: roadZ - 6, maxZ: roadZ + 5 };
    const club: Rect = { minX: -55, maxX: -34, minZ: -12, maxZ: 14 };
    // (And clear of where the second runway goes, with the taxiway out round the first's end to it.)
    const second: Rect[] = layout.runway2
      ? [
          { minX: layout.runway2.minX - 12, maxX: layout.runway2.maxX + 12, minZ: layout.runway2.z - layout.runway2.half - 6, maxZ: layout.runway2.z + layout.runway2.half + 4 },
          { minX: (links.around ?? runway.minX) - 9, maxX: runway.minX, minZ: layout.runway2.z, maxZ: taxiway.z + taxiway.half + 3 },
        ]
      : [];
    const keepOut = [lot, runwayBand, taxiBand, ...linkBands, ...second, road, club, { minX: -38, maxX: -30, minZ: -16, maxZ: -6 }];
    const woods: { x: number; z: number; s: number; r: number }[] = layout.trees.map((t) => ({ x: t.x, z: t.z, s: 2.4 * (t.size ?? 1), r: rand() * 6 }));
    let tries = 0;
    while (woods.length < 90 && tries++ < 6000) {
      const x = -90 + rand() * 140;
      const z = -75 + rand() * 135;
      if (inside(x, z, 2.5, keepOut)) continue;
      woods.push({ x, z, s: 2.2 + rand() * 1.4, r: rand() * 6 });
    }
    this.group.add(
      scatter('nature:tree_oak', woods.filter((_, i) => i % 3 === 0)),
      scatter('nature:tree_default', woods.filter((_, i) => i % 3 === 1)),
      scatter('nature:tree_fat', woods.filter((_, i) => i % 3 === 2)),
    );

    // A fence down each side of the apron, floodlight masts at its corners.
    const fence: { x: number; z: number; rot: number }[] = [];
    for (let z = apron.maxZ - 1; z > taxiway.z + taxiway.half + 3.5; z -= 3) {
      fence.push({ x: lot.minX - 0.6, z, rot: PI / 2 }, { x: lot.maxX + 1.2, z, rot: PI / 2 });
    }
    copies('sp_fence', fence, 0);
    const floods = [
      { x: lot.minX - 1.6, z: taxiway.z + taxiway.half + 4.5, rot: -PI / 4 },
      { x: lot.maxX + 2.2, z: taxiway.z + taxiway.half + 4.5, rot: PI / 4 },
      { x: lot.minX - 1.6, z: apron.maxZ - 4.5, rot: -PI / 2 },
      { x: lot.maxX + 2.2, z: apron.maxZ - 4.5, rot: PI / 2 },
    ];
    this.group.add(skyCopies('sp_flood', floods));
    for (const f of floods) pole(f.x, f.z, 0.45);
    // Taxiway signs either side of where the planes turn off the runway, cones and a power unit by the apron's edges.
    for (const [x, z, text] of [
      [links.exit - 5, taxiway.z + taxiway.half + 1.6, '← A  |  APRON'],
      [links.entry + 5, taxiway.z + taxiway.half + 1.6, 'A →  |  RWY 09'],
    ] as const) {
      const sign = add(skyModel('sp_sign'), x, z);
      solid(footprint('sp_sign', x, z, 0, 0.02));
      const face = signBoard(text, 1.66, 0.62, '#ffd24a', '#1f2a36');
      face.position.set(0, 0.75, 0.15);
      sign.add(face);
    }
    const gpus = [{ x: lot.minX + 1.4, z: -8.5, rot: 0 }, { x: lot.maxX - 1.2, z: -8.5, rot: PI }];
    this.group.add(skyCopies('sp_gpu', gpus));
    for (const g of gpus) solid(turned(g.x, g.z, g.rot, { minX: -0.6, maxX: 0.6, minZ: -0.85, maxZ: 0.85 }));

    // The flying club: its old hangar on the grass west of the apron, two light planes, one running.
    const clubhouse = add(skyModel('sp_clubhouse'), -45.5, -4, PI / 2);
    solid(footprint('sp_clubhouse', -45.5, -4, PI / 2, 0.05));
    const clubSign = signBoard('FLYING CLUB', 3.4, 0.62, '#ffffff', '#e8493f');
    const at = clubhouse.getObjectByName('sp_clubhouse_sign');
    if (at) {
      clubSign.position.copy(at.position);
      clubhouse.add(clubSign);
    }
    for (const [x, z, rot, running] of [
      [-40.2, 6.5, PI / 2 + 0.3, true],
      [-46.5, 9.5, PI / 2 - 0.2, false],
    ] as const) {
      const plane = new LightPlane(running);
      add(plane.root, x, z, rot);
      this.movers.push(plane);
      // Its body and wheels (the wing's high enough to walk under).
      solid(turned(x, z, rot, { minX: -0.6, maxX: 0.6, minZ: -2.6, maxZ: 2.0 }));
      solid(turned(x, z, rot, { minX: -1.1, maxX: 1.1, minZ: 0.2, maxZ: 0.6 }));
    }

    // The radar on its hut, beside the apron.
    const radar = new Radar();
    add(radar.root, apron.minX - 5.2, taxiway.z + taxiway.half + 10);
    solid(footprint('sp_radar', apron.minX - 5.2, taxiway.z + taxiway.half + 10, 0, 0.15));
    this.movers.push(radar);

    // The plaza: lamps along the road, the airport's flags, planters, benches, the taxi rank's sign.
    const lampZ = plaza.maxZ - 0.7;
    const lamps = [entrance.x - 11.9, entrance.x - 6.6, entrance.x + 6.4, entrance.x + 11.6].map((x) => ({ x, z: lampZ, rot: PI }));
    this.group.add(skyCopies('sp_lamp', lamps));
    for (const l of lamps) pole(l.x, l.z, 0.24);
    for (const x of [plaza.maxX - 7.0, plaza.maxX - 5.2, plaza.maxX - 3.4]) {
      const flag = new Flag();
      add(flag.root, x, plaza.minZ + 2.2);
      pole(x, plaza.minZ + 2.2, 0.24);
      this.movers.push(flag);
    }
    copies('sp_planter', [{ x: entrance.x + 7.2, z: plaza.minZ + 1.0 }, { x: entrance.x - 7.6, z: plaza.maxZ - 2.6 }]);
    copies('sp_bench', [{ x: plaza.maxX - 4.6, z: plaza.maxZ - 2.3 }, { x: plaza.minX + 4.2, z: plaza.maxZ - 2.6 }]);
    copies('sp_bin', [{ x: entrance.x - 6.6, z: plaza.maxZ - 1.9 }, { x: plaza.maxX - 1.4, z: plaza.maxZ - 2.6 }, { x: entrance.x + 2.4, z: hall.maxZ - 2.6 }]);
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
