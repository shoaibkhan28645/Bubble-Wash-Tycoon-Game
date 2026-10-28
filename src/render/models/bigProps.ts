// Models for the later buildings: vending machine, roadside sign, brush tunnel,
// detailing garage and the truck to the next town.
import { CanvasTexture, Group, Mesh, MeshLambertMaterial, PlaneGeometry, type Object3D } from 'three';
import { box, cylinder, mergeParts, sphere, toyMaterial, type Part } from './build';
import { mergedModel } from '../assets';

const WHITE = '#f4f7fb';
const PINK = '#ff8fc8';
const BLUE = '#6cc4ff';
const MINT = '#7ee0c3';
const YELLOW = '#ffd85c';
const SLAB = '#c9d6e3';

/** A flat board with text painted on, for signs. */
function textBoard(text: string, width: number, height: number, background: string, color: string): Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = Math.round((256 * height) / width);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  ctx.font = `900 ${Math.round(canvas.height * 0.42)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  const texture = new CanvasTexture(canvas);
  texture.anisotropy = 4;
  return new Mesh(new PlaneGeometry(width, height), new MeshLambertMaterial({ map: texture }));
}

/** Snack vending machine. */
export function vendingModel(): Mesh {
  const parts: Part[] = [
    { geometry: box(1.3, 2.1, 0.9), color: '#ff5c6c', y: 1.05 },
    { geometry: box(0.85, 1.3, 0.05), color: '#cfeeff', x: -0.15, y: 1.3, z: 0.46 },
    { geometry: box(0.25, 0.7, 0.05), color: '#3a3f4a', x: 0.45, y: 1.3, z: 0.46 },
    { geometry: box(1.3, 0.25, 0.92), color: WHITE, y: 2.15 },
  ];
  const snacks = [YELLOW, BLUE, MINT, PINK];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      parts.push({ geometry: box(0.18, 0.18, 0.06), color: snacks[(row + col) % 4]!, x: -0.45 + col * 0.3, y: 0.85 + row * 0.38, z: 0.48 });
    }
  }
  return new Mesh(mergeParts(parts), toyMaterial);
}

/** Tall roadside sign facing the road. */
export function signModel(): Object3D {
  const group = new Group();
  group.add(
    new Mesh(
      mergeParts([
        { geometry: box(0.7, 0.2, 0.7), color: SLAB, y: 0.1 },
        { geometry: cylinder(0.12, 4.2), color: WHITE, x: -1.1, y: 2.1 },
        { geometry: cylinder(0.12, 4.2), color: WHITE, x: 1.1, y: 2.1 },
        { geometry: box(3.2, 1.5, 0.2), color: PINK, y: 3.6 },
        { geometry: sphere(0.3), color: '#ffffff', x: 1.55, y: 4.4 },
        { geometry: sphere(0.2), color: '#cfeeff', x: 1.85, y: 4.75 },
        { geometry: sphere(0.22), color: '#ffffff', x: -1.6, y: 4.35 },
      ]),
      toyMaterial,
    ),
  );
  // Text faces the road (north) and the lot (south).
  for (const side of [-1, 1]) {
    const board = textBoard('BUBBLE WASH', 2.9, 1.2, '#ff8fc8', '#ffffff');
    board.position.set(0, 3.6, side * 0.11);
    if (side < 0) board.rotation.y = Math.PI;
    group.add(board);
  }
  return group;
}

/** Automatic brush tunnel: open frame over the lane, with brushes that spin. */
export class TunnelModel {
  readonly root = new Group();
  private readonly brushes: Mesh[] = [];

  constructor(width: number, length: number) {
    const hx = width / 2 + 0.05;
    const parts: Part[] = [
      { geometry: box(width + 0.3, 0.1, length + 0.3), color: '#aeb6c2', y: 0.05 },
      { geometry: box(width, 0.12, length), color: '#d9e1ea', y: 0.07 },
    ];
    // Conveyor rails.
    for (const sx of [-0.5, 0.5]) parts.push({ geometry: box(0.18, 0.14, length - 0.4), color: '#8b95a3', x: sx, y: 0.1 });
    const arches = 4;
    for (let i = 0; i < arches; i++) {
      const z = -length / 2 + 0.2 + (i * (length - 0.4)) / (arches - 1);
      for (const sx of [-1, 1]) parts.push({ geometry: box(0.3, 3, 0.3), color: WHITE, x: sx * hx, y: 1.5, z });
      parts.push({ geometry: box(width + 0.6, 0.45, 0.4), color: i % 2 ? PINK : BLUE, y: 3.1, z });
    }
    for (const sx of [-1, 1]) parts.push({ geometry: box(0.22, 0.22, length), color: WHITE, x: sx * hx, y: 2.9 });
    // Big sign over the entrance.
    parts.push({ geometry: box(width + 0.4, 0.8, 0.25), color: YELLOW, y: 3.8, z: -length / 2 + 0.2 });
    this.root.add(new Mesh(mergeParts(parts), toyMaterial));

    // Two pairs of tall side brushes and one roller.
    const brushMaterial = new MeshLambertMaterial({ vertexColors: true });
    const side = mergeParts([
      { geometry: cylinder(0.42, 2.2, 10), color: BLUE, y: 1.25 },
      { geometry: cylinder(0.46, 0.3, 10), color: PINK, y: 0.6 },
      { geometry: cylinder(0.46, 0.3, 10), color: PINK, y: 1.9 },
    ]);
    for (const z of [-length / 4, length / 4]) {
      for (const sx of [-1, 1]) {
        const brush = new Mesh(side, brushMaterial);
        brush.position.set(sx * (width / 2 - 0.45), 0, z);
        this.brushes.push(brush);
        this.root.add(brush);
      }
    }
    const roller = new Mesh(mergeParts([{ geometry: cylinder(0.35, width - 0.6, 12), color: MINT, rz: Math.PI / 2 }]), brushMaterial);
    roller.position.set(0, 2.2, 0);
    this.brushes.push(roller);
    this.root.add(roller);
  }

  update(dt: number, busy: boolean): void {
    const speed = busy ? 9 : 1.5;
    for (const brush of this.brushes) {
      if (brush.position.y > 1) brush.rotation.x += dt * speed;
      else brush.rotation.y += dt * speed * (brush.position.x > 0 ? 1 : -1);
    }
  }
}

/** Detailing garage: open at both ends so cars drive through; low side walls, a roof frame and a sign. */
export function garageModel(width: number, length: number): Object3D {
  const group = new Group();
  const hx = width / 2 + 0.1;
  const parts: Part[] = [
    { geometry: box(width + 0.4, 0.1, length + 0.4), color: '#aeb6c2', y: 0.05 },
    { geometry: box(width, 0.12, length), color: '#f0e6ff', y: 0.07 },
  ];
  for (const sx of [-1, 1]) {
    parts.push({ geometry: box(0.25, 1.1, length), color: WHITE, x: sx * hx, y: 0.55 });
    for (const sz of [-1, 1]) parts.push({ geometry: box(0.3, 3.2, 0.3), color: '#b79cff', x: sx * hx, y: 1.6, z: sz * (length / 2 - 0.1) });
    parts.push({ geometry: box(0.3, 0.3, length), color: '#b79cff', x: sx * hx, y: 3.2 });
  }
  for (const sz of [-1, 1]) parts.push({ geometry: box(width + 0.5, 0.35, 0.3), color: '#b79cff', y: 3.2, z: sz * (length / 2 - 0.1) });
  // Tyre rack and a vacuum by the wall.
  for (let i = 0; i < 3; i++) parts.push({ geometry: cylinder(0.3, 0.2, 14), color: '#3a3f4a', x: -hx - 0.45, y: 0.32 + i * 0.22, z: -0.6, rx: 0 });
  parts.push({ geometry: box(0.5, 0.8, 0.5), color: YELLOW, x: -hx - 0.5, y: 0.4, z: 0.8 });
  group.add(new Mesh(mergeParts(parts), toyMaterial));
  const sign = textBoard('DETAILING', width, 0.8, '#b79cff', '#ffffff');
  sign.position.set(0, 3.8, -length / 2 + 0.05);
  sign.rotation.y = Math.PI;
  const front = textBoard('DETAILING', width, 0.8, '#b79cff', '#ffffff');
  front.position.set(0, 3.8, length / 2 - 0.05);
  group.add(sign, front);
  return group;
}

/** The truck to the next town: Car Kit delivery truck, a bit bigger than cars. */
export function truckModel(): Mesh {
  const { geometry, material } = mergedModel('car:delivery');
  const mesh = new Mesh(geometry, material);
  mesh.scale.setScalar(1.35);
  mesh.rotation.y = Math.PI / 2;
  return mesh;
}
