// The hand-wash bay: a tiled wash pad under a candy-striped canopy frame.
import { CanvasTexture, Group, Mesh, MeshLambertMaterial, PlaneGeometry, SRGBColorSpace, TorusGeometry, type BufferGeometry } from 'three';
import { cylinder, mergeParts, rbox, sphere, toyMaterial, type Part } from './build';

const WHITE = '#f6f8fb';
const PINK = '#ff8fc8';
const BLUE = '#5bbcff';
const TILE = '#d3e6f0';
const GROUT = '#b6cbd8';
const KERB = '#c3cad4';
const DRAIN = '#aab6c4';

const geometries = new Map<string, BufferGeometry>();
const signs = new Map<string, MeshLambertMaterial>();

/** "BAY 1" board with a bubble, drawn once per label. */
function signMaterial(label: string): MeshLambertMaterial {
  let material = signs.get(label);
  if (material) return material;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#2f80d1';
  ctx.beginPath();
  ctx.roundRect(4, 4, 248, 88, 22);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 54px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 150, 52);
  // A soap bubble on the left.
  ctx.strokeStyle = '#bfe9ff';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(46, 48, 22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(38, 40, 6, 0, Math.PI * 2);
  ctx.fill();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  material = new MeshLambertMaterial({ map: texture });
  signs.set(label, material);
  return material;
}

function frame(width: number, length: number): Part[] {
  const parts: Part[] = [];
  const hx = width / 2 + 0.1;
  const hz = length / 2 - 0.2;
  // Tiled wash pad, low kerbs along the sides, drain down the middle.
  parts.push({ geometry: rbox(width + 0.2, 0.04, length, 0.015), color: TILE, y: 0.02 });
  for (let i = 1; i < 6; i++) parts.push({ geometry: rbox(width + 0.2, 0.012, 0.04, 0.005), color: GROUT, y: 0.045, z: -length / 2 + (i * length) / 6 });
  for (const f of [-1 / 3, 1 / 3]) parts.push({ geometry: rbox(0.04, 0.012, length, 0.005), color: GROUT, x: f * width, y: 0.045 });
  parts.push({ geometry: rbox(0.36, 0.014, length * 0.7, 0.005), color: DRAIN, y: 0.047 });
  for (const sx of [-1, 1]) parts.push({ geometry: rbox(0.26, 0.16, length + 0.2, 0.06), color: KERB, x: sx * (width / 2 + 0.2), y: 0.08 });

  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const at = { x: sx * hx, z: sz * hz };
      parts.push({ geometry: rbox(0.44, 0.34, 0.44, 0.08), color: sz < 0 ? BLUE : PINK, ...at, y: 0.17 });
      parts.push({ geometry: rbox(0.32, 2.7, 0.32, 0.08), color: WHITE, ...at, y: 1.55 });
      parts.push({ geometry: rbox(0.42, 0.14, 0.42, 0.05), color: WHITE, ...at, y: 2.9 });
    }
    // Candy-striped header beam.
    const stripes = 9;
    const span = width + 0.8;
    for (let i = 0; i < stripes; i++) {
      const color = i % 2 === 0 ? WHITE : sz < 0 ? BLUE : PINK;
      parts.push({ geometry: rbox(span / stripes + 0.01, 0.5, 0.44, 0.04), color, x: -span / 2 + (span / stripes) * (i + 0.5), y: 3.18, z: sz * hz });
    }
  }
  // Side beams and roof slats (open, so the car shows from above).
  for (const sx of [-1, 1]) parts.push({ geometry: rbox(0.22, 0.24, length - 0.2, 0.06), color: WHITE, x: sx * hx, y: 3.05 });
  for (let i = 1; i < 4; i++) {
    parts.push({ geometry: rbox(width + 0.3, 0.12, 0.36, 0.05), color: i % 2 ? BLUE : WHITE, y: 3.38, z: -hz + (i * 2 * hz) / 4 });
  }
  // Lamps under the far header.
  for (const sx of [-1, 1]) parts.push({ geometry: sphere(0.13, 10), color: '#fff3b0', x: sx * (width / 4), y: 2.85, z: -hz });
  // Sign posts on the far header.
  for (const sx of [-1, 1]) parts.push({ geometry: rbox(0.1, 0.4, 0.1, 0.03), color: WHITE, x: sx * 0.7, y: 3.6, z: -hz });
  parts.push({ geometry: rbox(1.9, 0.78, 0.12, 0.05), color: WHITE, y: 4.0, z: -hz });

  // Hose reel on the near right column, with its coiled hose and spray gun.
  const reel = { x: hx - 0.05, z: hz - 0.32 };
  parts.push({ geometry: cylinder(0.3, 0.14, 16), color: BLUE, ...reel, y: 1.45, rx: Math.PI / 2 });
  parts.push({ geometry: new TorusGeometry(0.24, 0.06, 6, 16), color: '#ffd24a', ...reel, y: 1.45, z: reel.z - 0.1 });
  parts.push({ geometry: rbox(0.1, 0.32, 0.14, 0.03), color: '#3b4a5e', x: reel.x + 0.02, y: 1.05, z: reel.z - 0.14 });
  // Soap dispenser on the near left column.
  parts.push({ geometry: rbox(0.3, 0.46, 0.2, 0.05), color: PINK, x: -hx + 0.02, y: 1.3, z: hz - 0.28 });
  parts.push({ geometry: rbox(0.32, 0.08, 0.22, 0.03), color: WHITE, x: -hx + 0.02, y: 1.57, z: hz - 0.28 });
  // Bucket with a sponge in the corner.
  parts.push({ geometry: cylinder(0.26, 0.42, 12), color: '#ffd85c', x: hx - 0.55, y: 0.25, z: length / 2 - 0.6 });
  parts.push({ geometry: cylinder(0.2, 0.05, 12), color: '#bfe9ff', x: hx - 0.55, y: 0.46, z: length / 2 - 0.6 });
  parts.push({ geometry: rbox(0.3, 0.14, 0.2, 0.05), color: PINK, x: hx - 0.5, y: 0.52, z: length / 2 - 0.55, ry: 0.4 });
  return parts;
}

/** Hand-wash bay: one merged frame plus the painted sign. */
export function bayModel(width: number, length: number, label: string): Group {
  const key = `${width}:${length}`;
  let geometry = geometries.get(key);
  if (!geometry) {
    geometry = mergeParts(frame(width, length));
    geometries.set(key, geometry);
  }
  const group = new Group();
  group.add(new Mesh(geometry, toyMaterial));
  const sign = new Mesh(new PlaneGeometry(1.76, 0.66), signMaterial(label));
  sign.position.set(0, 4.0, -(length / 2 - 0.2) + 0.065);
  group.add(sign);
  return group;
}
