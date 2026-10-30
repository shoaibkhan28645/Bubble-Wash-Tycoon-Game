import { CanvasTexture, Mesh, MeshLambertMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import type { LocationLayout } from '../core/config';

/** Texture size in pixels (Tech Guide: at most 512): the lot is stretched over it, about 28 pixels per metre. */
const TEXTURE_SIZE = [512, 1024] as const;
/** Pixels per metre for sizes that should look round (arrows, splashes). */
const PX = 29;
const JOINT = 3;
const LANE = 2.7;
const CONCRETE = '#d9d2c4';
const ASPHALT = '#646b77';
const PAINT = 'rgba(255,255,255,0.9)';
const YELLOW = '#ffd24a';

/** Small seeded random generator so the painting is the same every time. */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/**
 * The paved lot as one painted texture (one draw call): concrete slabs with
 * joints, asphalt driveways with edge lines and arrows, wet patches by the
 * wash bays and a few oil stains.
 */
export function lotSurface(layout: LocationLayout, bayXs: number[], tunnelX: number | null): Mesh {
  const { lot, roadZ, collectZ, finishX, exitZ, earlyExitZ } = layout;
  const width = lot.maxX - lot.minX;
  const depth = lot.maxZ - lot.minZ;
  const canvas = document.createElement('canvas');
  // Power-of-two size: the safest kind of texture for every phone GPU.
  canvas.width = TEXTURE_SIZE[0];
  canvas.height = TEXTURE_SIZE[1];
  const sx = canvas.width / width;
  const sy = canvas.height / depth;
  // A software canvas, drawn on the CPU and uploaded once. (A GPU canvas
  // replays every stroke in one burst on first use, which stalled phones.)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const rand = seeded(11);
  const u = (x: number) => (x - lot.minX) * sx;
  const v = (z: number) => (z - lot.minZ) * sy;
  const rect = (x0: number, z0: number, x1: number, z1: number) => ctx.fillRect(u(x0), v(z0), (x1 - x0) * sx, (z1 - z0) * sy);

  // Driveways: down through each bay and the tunnel, across to the finishing lane, down it and out.
  const top = Math.min(roadZ, lot.minZ);
  const half = LANE / 2;
  const downXs = tunnelX === null ? bayXs : [...bayXs, tunnelX];
  const lanes: [number, number, number, number][] = downXs.map((x) => [x - half, top, x + half, collectZ + half]);
  const left = Math.min(...bayXs) - half;
  lanes.push([left, collectZ - half, finishX + half, collectZ + half]);
  lanes.push([finishX - half, collectZ - half, finishX + half, exitZ + half]);
  for (const z of [earlyExitZ, exitZ]) lanes.push([finishX - half, z - half, lot.maxX, z + half]);
  // Concrete slabs with joints, asphalt on the driveways, both with grain.
  const joints = (from: number, to: number, toPx: (m: number) => number, size: number) => {
    const marks = new Uint8Array(size);
    for (let m = from + JOINT; m < to; m += JOINT) {
      const p = Math.round(toPx(m));
      for (let d = -1; d <= 1; d++) if (p + d >= 0 && p + d < size) marks[p + d] = 1;
    }
    return marks;
  };
  paintBase(
    ctx,
    lanes.map(([x0, z0, x1, z1]) => [u(x0), v(z0), u(x1), v(z1)]),
    joints(lot.minX, lot.maxX, u, canvas.width),
    joints(lot.minZ, lot.maxZ, v, canvas.height),
  );

  // Edge lines along the long driveways.
  ctx.fillStyle = PAINT;
  for (const x of downXs) {
    for (const side of [-1, 1]) rect(x + side * (half - 0.12) - 0.05, top + 1.2, x + side * (half - 0.12) + 0.05, collectZ - half);
  }
  for (const side of [-1, 1]) rect(finishX + side * (half - 0.12) - 0.05, collectZ + half, finishX + side * (half - 0.12) + 0.05, exitZ - half);
  // Arrows showing which way to drive.
  for (const x of downXs) arrow(ctx, u(x), v(collectZ - 1.6), 0, PX);
  if (tunnelX !== null) arrow(ctx, u(tunnelX), v(-11), 0, PX);
  arrow(ctx, u(finishX - 3.2), v(collectZ), -Math.PI / 2, PX);
  arrow(ctx, u(finishX), v(collectZ + 2.4), 0, PX);
  for (const z of [earlyExitZ, exitZ]) arrow(ctx, u(lot.maxX - 1.6), v(z), -Math.PI / 2, PX);
  // Yellow stop bars where cars wait to enter a bay.
  ctx.fillStyle = YELLOW;
  for (const x of bayXs) rect(x - half + 0.25, -6.25, x + half - 0.25, -6.05);

  // Wet patches under and around the hand-wash bays.
  for (const x of bayXs) {
    for (let i = 0; i < 5; i++) {
      blob(ctx, u(x + (rand() - 0.5) * 3), v(-3 + (rand() - 0.5) * 6), (0.7 + rand() * 0.9) * PX, 'rgba(70,110,140,0.16)', rand);
    }
  }
  // Oil stains on the concrete.
  for (let i = 0; i < 7; i++) {
    blob(ctx, u(lot.minX + 1 + rand() * (width - 2)), v(lot.minZ + 2 + rand() * (depth - 4)), (0.3 + rand() * 0.4) * PX, 'rgba(40,40,40,0.12)', rand);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const geometry = new PlaneGeometry(width, depth).rotateX(-Math.PI / 2);
  const mesh = new Mesh(geometry, new MeshLambertMaterial({ map: texture }));
  mesh.position.set((lot.minX + lot.maxX) / 2, 0.012, (lot.minZ + lot.maxZ) / 2);
  mesh.receiveShadow = true;
  return mesh;
}

const hex = (color: string) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)) as [number, number, number];

/** Pixel by pixel: concrete or asphalt, darker joints between slabs, and fine grain. */
function paintBase(ctx: CanvasRenderingContext2D, lanes: number[][], jointCols: Uint8Array, jointRows: Uint8Array): void {
  const { width, height } = ctx.canvas;
  const image = ctx.createImageData(width, height);
  const data = image.data;
  const concrete = hex(CONCRETE);
  const asphalt = hex(ASPHALT);
  let seed = 7;
  for (let py = 0; py < height; py++) {
    const row = lanes.filter((r) => py >= r[1]! && py < r[3]!);
    for (let px = 0; px < width; px++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const n = (seed >>> 24) / 255 - 0.5;
      const onLane = row.some((r) => px >= r[0]! && px < r[2]!);
      const base = onLane ? asphalt : concrete;
      // Mostly gentle grain, with the odd bright fleck.
      const k = n * (onLane ? 22 : 14) + (n > 0.47 ? 26 : 0);
      const shade = !onLane && (jointCols[px] || jointRows[py]) ? 0.8 : 1;
      const i = (py * width + px) * 4;
      data[i] = base[0] * shade + k;
      data[i + 1] = base[1] * shade + k;
      data[i + 2] = base[2] * shade + k;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

/** A soft irregular splash. */
function blob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, rand: () => number): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  const points = 10;
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * Math.PI * 2;
    const rr = r * (0.7 + rand() * 0.45);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr * 0.75;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

/** A painted arrow; angle 0 points down the lot (+z). */
function arrow(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, scale: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.fillStyle = PAINT;
  ctx.beginPath();
  ctx.moveTo(-0.16, -0.9);
  ctx.lineTo(0.16, -0.9);
  ctx.lineTo(0.16, 0);
  ctx.lineTo(0.45, 0);
  ctx.lineTo(0, 0.6);
  ctx.lineTo(-0.45, 0);
  ctx.lineTo(-0.16, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
