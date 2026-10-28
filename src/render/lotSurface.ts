import { CanvasTexture, Mesh, MeshLambertMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import type { LocationLayout } from '../core/config';

/** Texture pixels per metre of lot. */
const PX = 40;
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
export function lotSurface(layout: LocationLayout, bayXs: number[]): Mesh {
  const { lot, roadZ, collectZ, finishX, exitZ, earlyExitZ } = layout;
  const width = lot.maxX - lot.minX;
  const depth = lot.maxZ - lot.minZ;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * PX);
  canvas.height = Math.round(depth * PX);
  const ctx = canvas.getContext('2d')!;
  const rand = seeded(11);
  const u = (x: number) => (x - lot.minX) * PX;
  const v = (z: number) => (z - lot.minZ) * PX;
  const rect = (x0: number, z0: number, x1: number, z1: number) => ctx.fillRect(u(x0), v(z0), (x1 - x0) * PX, (z1 - z0) * PX);

  // Concrete with speckles and expansion joints.
  ctx.fillStyle = CONCRETE;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  speckle(ctx, rand, canvas.width, canvas.height, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.18)'], 9000);
  ctx.fillStyle = 'rgba(90,80,65,0.3)';
  for (let x = lot.minX + JOINT; x < lot.maxX; x += JOINT) rect(x - 0.02, lot.minZ, x + 0.02, lot.maxZ);
  for (let z = lot.minZ + JOINT; z < lot.maxZ; z += JOINT) rect(lot.minX, z - 0.02, lot.maxX, z + 0.02);

  // Driveways: down through each bay, across to the finishing lane, down it and out.
  const top = Math.min(roadZ, lot.minZ);
  const half = LANE / 2;
  const lanes: [number, number, number, number][] = bayXs.map((x) => [x - half, top, x + half, collectZ + half]);
  const left = Math.min(...bayXs) - half;
  lanes.push([left, collectZ - half, finishX + half, collectZ + half]);
  lanes.push([finishX - half, top, finishX + half, exitZ + half]);
  for (const z of [earlyExitZ, exitZ]) lanes.push([finishX - half, z - half, lot.maxX, z + half]);
  ctx.fillStyle = ASPHALT;
  for (const [x0, z0, x1, z1] of lanes) rect(x0, z0, x1, z1);
  ctx.save();
  ctx.beginPath();
  for (const [x0, z0, x1, z1] of lanes) ctx.rect(u(x0), v(z0), (x1 - x0) * PX, (z1 - z0) * PX);
  ctx.clip();
  speckle(ctx, rand, canvas.width, canvas.height, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.08)'], 12000);
  ctx.restore();

  // Edge lines along the long driveways.
  ctx.fillStyle = PAINT;
  for (const x of [...bayXs, finishX]) {
    for (const side of [-1, 1]) rect(x + side * (half - 0.12) - 0.05, top + 1.2, x + side * (half - 0.12) + 0.05, (x === finishX ? exitZ : collectZ) - half);
  }
  // Arrows showing which way to drive.
  for (const x of bayXs) arrow(ctx, u(x), v(collectZ - 1.6), 0, PX);
  arrow(ctx, u(finishX), v(-11), 0, PX);
  arrow(ctx, u(finishX - 3.2), v(collectZ), -Math.PI / 2, PX);
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
  texture.anisotropy = 4;
  const geometry = new PlaneGeometry(width, depth).rotateX(-Math.PI / 2);
  const mesh = new Mesh(geometry, new MeshLambertMaterial({ map: texture }));
  mesh.position.set((lot.minX + lot.maxX) / 2, 0.012, (lot.minZ + lot.maxZ) / 2);
  mesh.receiveShadow = true;
  return mesh;
}

function speckle(ctx: CanvasRenderingContext2D, rand: () => number, w: number, h: number, colors: string[], count: number): void {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[i % colors.length]!;
    const s = 1 + rand() * 2.5;
    ctx.fillRect(rand() * w, rand() * h, s, s);
  }
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
