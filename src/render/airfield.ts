// Skyport's ground: mown grass, the runway and taxiway with their paint and lights, the apron and its
// stands, the hall's floor, the plaza and the road in front. Drawn once (parkland() does the same for
// the park); what moves over it (the approach lights' chase, the clouds' shadows) is the Ambience.
import {
  CanvasTexture,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  SphereGeometry,
  type Scene,
} from 'three';
import type { AirportLayout, Rect } from '../core/config';
import { box, mergeParts, toyMaterial, type Part } from './models/build';
import { treeParts } from './models/airport';

const PI = Math.PI;
const WHITE = '#f4f6f8';
const YELLOW = '#ffd24a';

let seed = 11;
const rnd = (): number => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
type Draw = (g: CanvasRenderingContext2D, s: number) => void;
const speck = (g: CanvasRenderingContext2D, s: number, colours: string[], n: number, r: number): void => {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colours[i % colours.length]!;
    g.fillRect(rnd() * s, rnd() * s, r, r);
  }
};
/** Each kind of ground: how big one tile of its pattern is (metres), and the pattern. */
const KINDS: Record<string, { tile: number; draw: Draw }> = {
  // Mown in stripes, like a real airfield's verges.
  grass: { tile: 8, draw: (g, s) => { g.fillStyle = '#86d46f'; g.fillRect(0, 0, s, s); g.fillStyle = '#7ccb66'; g.fillRect(0, 0, s / 2, s); speck(g, s, ['#93dc7c', '#74c25f'], 900, 2); } },
  runway: { tile: 6, draw: (g, s) => { g.fillStyle = '#4b505b'; g.fillRect(0, 0, s, s); speck(g, s, ['#565c68', '#42464f'], 1400, 2); } },
  taxi: { tile: 6, draw: (g, s) => { g.fillStyle = '#69707b'; g.fillRect(0, 0, s, s); speck(g, s, ['#747b87', '#5e6570'], 1400, 2); } },
  apron: { tile: 5, draw: (g, s) => { g.fillStyle = '#d5d9dc'; g.fillRect(0, 0, s, s); speck(g, s, ['#dfe3e6', '#c8cdd1'], 1200, 2); g.strokeStyle = '#bcc2c7'; g.lineWidth = 3; g.strokeRect(0, 0, s, s); } },
  plaza: { tile: 4, draw: (g, s) => { g.fillStyle = '#eddcb8'; g.fillRect(0, 0, s, s); speck(g, s, ['#f5e7c8', '#e2cfa6'], 900, 2); g.strokeStyle = '#d9c59c'; g.lineWidth = 3; for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) g.strokeRect((x * s) / 2, (y * s) / 2, s / 2, s / 2); } },
  road: { tile: 6, draw: (g, s) => { g.fillStyle = '#555a65'; g.fillRect(0, 0, s, s); speck(g, s, ['#5f6570', '#4c515b'], 1400, 2); } },
  floor: { tile: 3, draw: (g, s) => { g.fillStyle = '#f6f0e4'; g.fillRect(0, 0, s, s); g.fillStyle = '#efe7d6'; g.fillRect(0, 0, s / 2, s / 2); g.fillRect(s / 2, s / 2, s / 2, s / 2); g.strokeStyle = '#e3d9c4'; g.lineWidth = 2; g.strokeRect(0, 0, s, s); } },
  carpet: { tile: 3, draw: (g, s) => { g.fillStyle = '#c9f5f6'; g.fillRect(0, 0, s, s); speck(g, s, ['#b5ecee', '#d8f9fa'], 500, 3); } },
};
const canvases = new Map<string, HTMLCanvasElement>();
function material(kind: string, w: number, d: number): MeshLambertMaterial {
  const k = KINDS[kind]!;
  let canvas = canvases.get(kind);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    k.draw(canvas.getContext('2d')!, 256);
    canvases.set(kind, canvas);
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(w / k.tile, d / k.tile);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return new MeshLambertMaterial({ map: texture });
}

/** Words painted flat on the ground (north up from above; `turn` turns them). */
function painted(text: string, x: number, z: number, height: number, colour: string, turn = 0, display = false): Mesh {
  const font = display ? '400 170px "Lilita One", Nunito, Arial, sans-serif' : '900 150px Nunito, Arial, sans-serif';
  const canvas = document.createElement('canvas');
  const measure = canvas.getContext('2d')!;
  measure.font = font;
  canvas.width = Math.ceil(measure.measureText(text).width) + 40;
  canvas.height = 200;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const draw = (): void => {
    const g = canvas.getContext('2d')!;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = colour;
    g.fillText(text, canvas.width / 2, 104, canvas.width - 20);
    texture.needsUpdate = true;
  };
  draw();
  if (display) void document.fonts?.load('400 64px "Lilita One"').then(draw);
  const geometry = new PlaneGeometry((height * canvas.width) / 200, height).rotateX(-PI / 2);
  const mesh = new Mesh(geometry, new MeshLambertMaterial({ map: texture, transparent: true, depthWrite: false }));
  mesh.position.set(x, 0.07, z);
  mesh.rotation.y = turn;
  mesh.receiveShadow = true;
  mesh.renderOrder = 2;
  return mesh;
}

/** The airfield's ground and everything painted or planted on it. */
export function airfield(layout: AirportLayout): Object3D {
  const group = new Group();
  group.name = 'airfield';
  const ground = (kind: string, r: Rect, y: number): void => {
    const w = r.maxX - r.minX;
    const d = r.maxZ - r.minZ;
    // (In small squares: a huge triangle's depth is too coarse to keep these thin layers in order.)
    const mesh = new Mesh(new PlaneGeometry(w, d, Math.ceil(w / 16), Math.ceil(d / 16)).rotateX(-PI / 2), material(kind, w, d));
    mesh.position.set((r.minX + r.maxX) / 2, y, (r.minZ + r.maxZ) / 2);
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  const { runway, taxiway, links, apron, serviceRoad, hall, plaza, roadZ } = layout;
  const rw = { minX: runway.minX, maxX: runway.maxX, minZ: runway.z - runway.half, maxZ: runway.z + runway.half };
  const tw = { minX: runway.minX, maxX: runway.maxX, minZ: taxiway.z - taxiway.half, maxZ: taxiway.z + taxiway.half };
  ground('grass', { minX: -160, maxX: 190, minZ: -130, maxZ: 110 }, -0.05);
  ground('runway', rw, 0.01);
  ground('taxi', tw, 0.01);
  for (const x of [links.entry, links.exit, links.far]) ground('taxi', { minX: x - 3, maxX: x + 3, minZ: rw.maxZ, maxZ: tw.minZ }, 0.012);
  ground('apron', { ...apron, minZ: tw.maxZ }, 0.011);
  ground('taxi', serviceRoad, 0.02);
  ground('floor', hall, 0.03);
  ground('carpet', { minX: hall.minX + 0.4, maxX: hall.maxX - 0.4, minZ: hall.minZ + 0.4, maxZ: hall.minZ + 5.6 }, 0.035);
  ground('plaza', plaza, 0.011);
  ground('road', { minX: -160, maxX: 190, minZ: roadZ - 3.25, maxZ: roadZ + 3.25 }, 0.012);

  // Paint.
  const marks: Part[] = [];
  const mark = (x: number, z: number, w: number, d: number, color = WHITE): void => void marks.push({ geometry: box(w, 0.02, d), color, x, y: 0.035, z });
  const mid = (runway.minX + runway.maxX) / 2;
  const long = runway.maxX - runway.minX;
  for (let x = runway.minX + 19; x <= runway.maxX - 19; x += 7) mark(x, runway.z, 3.6, 0.4);
  for (const side of [-1, 1]) mark(mid, runway.z + side * (runway.half - 0.6), long - 2, 0.28);
  for (const end of [-1, 1]) {
    const x = end < 0 ? runway.minX + 2.4 : runway.maxX - 2.4;
    for (let i = 0; i < 8; i++) mark(x, runway.z - (runway.half - 1.2) + i * ((2 * runway.half - 2.4) / 7), 3.2, 0.55);
    for (const d of [10, 15, 20]) for (const side of [-1, 1]) mark(x - end * d, runway.z + side * 2.3, 2.6, 0.8);
    for (const side of [-1, 1]) mark(x - end * 27, runway.z + side * 2.3, 4.2, 1.5);
  }
  group.add(painted('09', runway.minX + 8.8, runway.z, 3.4, WHITE, PI / 2), painted('27', runway.maxX - 8.8, runway.z, 3.4, WHITE, -PI / 2));
  // The taxiway's yellow line, up each link, and dashes along its edges.
  mark(mid, taxiway.z, long - 2, 0.26, YELLOW);
  for (const x of [links.entry, links.exit, links.far]) mark(x, (rw.maxZ + taxiway.z) / 2, 0.26, taxiway.z - rw.maxZ, YELLOW);
  for (let x = runway.minX + 3; x <= runway.maxX - 3; x += 4) for (const side of [-1, 1]) mark(x, taxiway.z + side * (taxiway.half - 0.3), 1.6, 0.14, YELLOW);
  // Each stand: the line in from the taxiway, the stop bar, its number, and a dashed outline.
  Object.values(layout.gates).forEach((gate, i) => {
    mark(gate.x, (tw.maxZ + gate.noseZ) / 2, 0.26, gate.noseZ - tw.maxZ, YELLOW);
    mark(gate.x, gate.noseZ + 0.4, 2.2, 0.3, YELLOW);
    for (const side of [-1, 1]) for (let z = tw.maxZ + 2; z < gate.noseZ + 1; z += 2.4) mark(gate.x + side * 6.3, z, 0.16, 1.2, '#ff8a3d');
    group.add(painted(String(i + 1), gate.x - 4.7, gate.noseZ + 0.2, 2.4, YELLOW));
  });
  // The service road's dashes; a yellow box where cases are picked up; the road's centre line and a crossing.
  for (let x = serviceRoad.minX + 1.5; x <= serviceRoad.maxX - 1; x += 3) mark(x, (serviceRoad.minZ + serviceRoad.maxZ) / 2, 1.4, 0.16);
  const pick = layout.belt.pick;
  for (const z of [pick.minZ, pick.maxZ]) mark((pick.minX + pick.maxX) / 2, z, pick.maxX - pick.minX, 0.14, YELLOW);
  for (const x of [pick.minX, pick.maxX]) mark(x, (pick.minZ + pick.maxZ) / 2, 0.14, pick.maxZ - pick.minZ, YELLOW);
  for (let x = -158; x <= 188; x += 5) mark(x, roadZ, 2.4, 0.22, YELLOW);
  for (let x = layout.entrance.x - 2.4; x <= layout.entrance.x + 2.4; x += 1.2) mark(x, roadZ, 0.6, 5.6);
  const paint = new Mesh(mergeParts(marks), toyMaterial);
  paint.receiveShadow = true;
  group.add(paint);
  // The airport's name in white on the grass between the runway and the taxiway, the way airfields sign themselves from the air.
  group.add(painted('SKYPORT', (apron.minX + apron.maxX) / 2, (rw.maxZ + tw.minZ) / 2 + 0.1, 3.4, '#ffffff', 0, true));

  // Lights along the runway's edges and the taxiway's.
  const lights: Part[] = [];
  for (let x = runway.minX + 3; x <= runway.maxX - 3; x += 6) for (const side of [-1, 1]) lights.push({ geometry: new SphereGeometry(0.2, 6, 5), color: '#fff3a0', x, y: 0.2, z: runway.z + side * (runway.half + 0.5) });
  for (let x = runway.minX + 3; x <= runway.maxX - 3; x += 6) lights.push({ geometry: new SphereGeometry(0.16, 6, 5), color: '#5ad8ff', x, y: 0.18, z: tw.maxZ + 0.4 });
  group.add(new Mesh(mergeParts(lights), toyMaterial));

  // Trees round the plaza, and a hedge either side of the door.
  const green: Part[] = layout.trees.flatMap((t) => treeParts(t.x, t.z, t.size ?? 1));
  for (let x = hall.minX + 1.2; x <= hall.maxX - 1; x += 1.5) {
    if (Math.abs(x - layout.entrance.x) < 6) continue;
    green.push({ geometry: new SphereGeometry(0.72, 8, 6), color: '#5fb84f', x, y: 0.5, z: hall.maxZ + 0.95 });
  }
  const plants = new Mesh(mergeParts(green), toyMaterial);
  plants.castShadow = true;
  plants.receiveShadow = true;
  group.add(plants);
  return group;
}

/**
 * What moves over the airfield without anyone doing anything: the approach lights running in towards
 * the runway's threshold, and the shadows of clouds drifting across the grass and the apron.
 */
export class Ambience {
  private readonly lights: InstancedMesh;
  private readonly marker = new Object3D();
  private readonly clouds: Mesh[] = [];
  private time = 0;
  private readonly rows = 7;

  constructor(scene: Scene, private readonly layout: AirportLayout) {
    this.lights = new InstancedMesh(new SphereGeometry(0.26, 8, 6), new MeshBasicMaterial({ color: 0xfff6c8 }), this.rows * 3);
    this.lights.frustumCulled = false;
    scene.add(this.lights);
    // A soft-edged blob of shade.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const g = canvas.getContext('2d')!;
    const fade = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    fade.addColorStop(0, 'rgba(20,50,70,1)');
    fade.addColorStop(0.55, 'rgba(20,50,70,0.7)');
    fade.addColorStop(1, 'rgba(20,50,70,0)');
    g.fillStyle = fade;
    g.fillRect(0, 0, 128, 128);
    const texture = new CanvasTexture(canvas);
    const material = new MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.13, depthWrite: false });
    for (const [w, d, x, z] of [[46, 30, -70, -30], [34, 24, 10, 6], [52, 34, 90, -14], [30, 22, -20, 44]] as const) {
      const cloud = new Mesh(new PlaneGeometry(w, d).rotateX(-PI / 2), material);
      cloud.position.set(x, 0.08, z);
      cloud.renderOrder = 1;
      scene.add(cloud);
      this.clouds.push(cloud);
    }
  }

  update(dt: number): void {
    this.time += dt;
    // The chase: each row of three flares up in turn, towards the runway.
    const { runway } = this.layout;
    const lit = Math.floor((this.time * 9) % (this.rows + 5));
    for (let row = 0; row < this.rows; row++) {
      for (let k = 0; k < 3; k++) {
        this.marker.position.set(runway.minX - 3 - (this.rows - 1 - row) * 2.6, 0.26, runway.z + (k - 1) * 1.5);
        this.marker.scale.setScalar(row === lit ? 2.1 : 0.9);
        this.marker.updateMatrix();
        this.lights.setMatrixAt(row * 3 + k, this.marker.matrix);
      }
    }
    this.lights.instanceMatrix.needsUpdate = true;
    for (const cloud of this.clouds) {
      cloud.position.x += dt * 1.5;
      cloud.position.z += dt * 0.35;
      if (cloud.position.x > 130) {
        cloud.position.x = -130;
        cloud.position.z = -50 + ((cloud.position.z + 97) % 110);
      }
    }
  }
}
