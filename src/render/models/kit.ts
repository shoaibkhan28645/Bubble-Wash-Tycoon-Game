// Shared pieces for station and prop models, so everything has one look:
// tiled wash pads, bevelled columns, candy-striped beams and painted signs.
import { CanvasTexture, Mesh, MeshLambertMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { box, rbox, type Part } from './build';

export const C = {
  white: '#f6f8fb',
  pink: '#ff8fc8',
  blue: '#5bbcff',
  mint: '#7ee0c3',
  yellow: '#ffd24a',
  gold: '#ffbf3c',
  lilac: '#b79cff',
  red: '#ff5c6c',
  kerb: '#c3cad4',
  steel: '#8d98a7',
  dark: '#3b4a5e',
  wood: '#c98a52',
} as const;

const COLUMN_HEIGHT = 2.7;

/** Tiled floor with grout lines, a drain and low kerbs along both sides. */
export function washPad(width: number, length: number, tile: string, grout: string): Part[] {
  const parts: Part[] = [{ geometry: box(width + 0.2, 0.04, length), color: tile, y: 0.02 }];
  const rows = Math.max(2, Math.round(length / 0.85));
  for (let i = 1; i < rows; i++) parts.push({ geometry: box(width + 0.2, 0.012, 0.04), color: grout, y: 0.045, z: -length / 2 + (i * length) / rows });
  for (const f of [-1 / 3, 1 / 3]) parts.push({ geometry: box(0.04, 0.012, length), color: grout, x: f * width, y: 0.045 });
  parts.push({ geometry: box(0.36, 0.014, length * 0.7), color: '#aab6c4', y: 0.047 });
  for (const sx of [-1, 1]) parts.push({ geometry: rbox(0.26, 0.16, length + 0.2, 0.06), color: C.kerb, x: sx * (width / 2 + 0.2), y: 0.08 });
  return parts;
}

/** A white column with a coloured foot and a cap. */
export function column(x: number, z: number, foot: string, height = COLUMN_HEIGHT): Part[] {
  return [
    { geometry: rbox(0.44, 0.34, 0.44, 0.08), color: foot, x, z, y: 0.17 },
    { geometry: rbox(0.32, height, 0.32, 0.08), color: C.white, x, z, y: 0.2 + height / 2 },
    { geometry: rbox(0.42, 0.14, 0.42, 0.05), color: C.white, x, z, y: 0.2 + height },
  ];
}

/** Candy-striped beam across x (or along z), centred on (x, y, z). */
export function stripedBeam(span: number, y: number, z: number, color: string, alongZ = false, x = 0, stripes = 9): Part[] {
  const parts: Part[] = [];
  const step = span / stripes;
  for (let i = 0; i < stripes; i++) {
    const offset = -span / 2 + step * (i + 0.5);
    // Plain boxes: side by side they read as one beam, and bevels here cost ~1k triangles a station.
    const geometry = alongZ ? box(0.44, 0.5, step + 0.01) : box(step + 0.01, 0.5, 0.44);
    parts.push({ geometry, color: i % 2 === 0 ? C.white : color, x: alongZ ? x : x + offset, y, z: alongZ ? z + offset : z });
  }
  return parts;
}

/**
 * The open canopy every station shares: four columns, striped beams at both
 * ends (`far` colour on the road side, `near` on the camera side), side
 * beams and roof slats, open so the car shows from above.
 */
export function canopy(width: number, length: number, far: string, near = far): Part[] {
  const hx = width / 2 + 0.1;
  const hz = length / 2 - 0.2;
  const parts: Part[] = [];
  for (const sz of [-1, 1]) {
    const color = sz < 0 ? far : near;
    for (const sx of [-1, 1]) parts.push(...column(sx * hx, sz * hz, color));
    parts.push(...stripedBeam(width + 0.8, 3.18, sz * hz, color));
  }
  for (const sx of [-1, 1]) parts.push({ geometry: rbox(0.22, 0.24, length - 0.2, 0.06), color: C.white, x: sx * hx, y: 3.05 });
  // Few, thin slats: the car underneath must stay visible from above.
  const slats = Math.max(2, Math.round(length / 2));
  for (let i = 1; i < slats; i++) {
    parts.push({ geometry: rbox(width + 0.3, 0.1, 0.24, 0.04), color: i % 2 ? far : C.white, y: 3.38, z: -hz + (i * 2 * hz) / slats });
  }
  return parts;
}

/** Frame and posts for a sign standing on the far beam of a canopy. */
export function signFrame(z: number, width: number): Part[] {
  return [
    ...[-1, 1].map((sx) => ({ geometry: rbox(0.1, 0.4, 0.1, 0.03), color: C.white, x: (sx * width) / 3, y: 3.6, z })),
    { geometry: rbox(width, 0.78, 0.12, 0.05), color: C.white, y: 4.0, z },
  ];
}

const plates = new Map<string, MeshLambertMaterial>();

/**
 * A painted sign (text on a rounded board, optional bubble), facing +z.
 * Materials are cached per text, so each sign is drawn only once.
 */
export function plate(text: string, width: number, height: number, background: string, bubble = true): Mesh {
  const key = `${text}|${background}|${bubble}|${width / height}`;
  let material = plates.get(key);
  if (!material) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = Math.round((256 * height) / width);
    const ctx = canvas.getContext('2d')!;
    const h = canvas.height;
    ctx.fillStyle = background;
    ctx.beginPath();
    ctx.roundRect(4, 4, 248, h - 8, Math.min(22, h / 4));
    ctx.fill();
    const lines = text.split('\n');
    const size = Math.min(54, (h * 0.62) / lines.length, 330 / Math.max(...lines.map((l) => l.length)));
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${Math.round(size)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const textX = bubble ? 150 : 128;
    lines.forEach((line, i) => ctx.fillText(line, textX, h / 2 + (i - (lines.length - 1) / 2) * size * 1.05 + 2));
    if (bubble) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(46, h / 2, Math.min(22, h / 4), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(39, h / 2 - 7, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    material = new MeshLambertMaterial({ map: texture });
    plates.set(key, material);
  }
  return new Mesh(new PlaneGeometry(width, height), material);
}
