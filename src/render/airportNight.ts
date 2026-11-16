// Skyport after dark (Part B, once the runway lights are in): the runway's edge lights and the taxiway's
// blue ones haloed, pools of floodlight over the stands, the terminal's lamps glowing over a warm wash on
// its floor, and a landing light blazing on every plane coming in or going out. As in the park (render/
// parkNight.ts), none of it is a real light: unlit and added on top, shown as the night comes on.
import { AdditiveBlending, BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, Group, InstancedMesh, MeshBasicMaterial, Object3D, PlaneGeometry, Points, PointsMaterial, type Scene } from 'three';
import type { AirportLayout, Point, Rect } from '../core/config';

/** Below this much night, none of it shows. */
const DARK_ENOUGH = 0.02;
/** The pools lie over every layer of the ground (the apron's paint is at 3.5 cm). */
const POOL_HEIGHT = 0.07;

let glowTexture: CanvasTexture | null = null;
/** A soft round glow, white in the middle and fading to nothing at the edge. */
function glow(): CanvasTexture {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(0.65, 'rgba(255,255,255,0.16)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  glowTexture = new CanvasTexture(canvas);
  return glowTexture;
}

const additive = { transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false, toneMapped: false } as const;

/** Halos at these points (one Points object), `size` metres across. */
function halos(at: { x: number; y: number; z: number }[], size: number, colour: string): { points: Points; material: PointsMaterial } {
  const material = new PointsMaterial({ map: glow(), size, color: colour, ...additive });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(at.flatMap((p) => [p.x, p.y, p.z]), 3));
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 2;
  return { points, material };
}

export class AirportNight {
  private readonly group = new Group();
  private readonly materials: { material: MeshBasicMaterial | PointsMaterial; strength: number }[] = [];
  private readonly pools: InstancedMesh;
  private readonly poolPlaces: { at: Point; size: number }[] = [];
  /** Where the rooms' washes start among the pools (the stands' come first). */
  private roomStart = 0;
  private readonly poolMaterial: MeshBasicMaterial;
  private readonly landing: Points;
  private readonly landingAt: Float32BufferAttribute;
  private readonly terminal = new Group();
  private time = 0;

  constructor(scene: Scene, layout: AirportLayout) {
    this.group.name = 'fx:night';
    const { runway, taxiway, hall } = layout;
    // The runway's edge lights (warm white), the taxiway's (blue), the runway's ends (green in, red out).
    const edges: { x: number; y: number; z: number }[] = [];
    for (let x = runway.minX + 3; x <= runway.maxX - 3; x += 6) for (const side of [-1, 1]) edges.push({ x, y: 0.3, z: runway.z + side * (runway.half + 0.5) });
    const blue: { x: number; y: number; z: number }[] = [];
    for (let x = runway.minX + 3; x <= runway.maxX - 3; x += 6) blue.push({ x, y: 0.28, z: taxiway.z + taxiway.half + 0.4 });
    const ends = (x: number) => Array.from({ length: 7 }, (_, i) => ({ x, y: 0.3, z: runway.z - runway.half + 0.8 + (i * (2 * runway.half - 1.6)) / 6 }));
    for (const [at, size, colour, strength] of [
      [edges, 1.5, '#fff1c4', 1],
      [blue, 1.2, '#58c8ff', 1],
      [ends(runway.minX + 1.2), 1.4, '#5dff8a', 1],
      [ends(runway.maxX - 1.2), 1.4, '#ff5a4a', 1],
    ] as const) {
      const h = halos([...at], size, colour);
      this.group.add(h.points);
      this.materials.push({ material: h.material, strength });
    }
    // Floodlight pools over each stand, warm and broad.
    this.poolMaterial = new MeshBasicMaterial({ map: glow(), color: new Color('#ffcf8a'), ...additive });
    for (const gate of Object.values(layout.gates)) this.poolPlaces.push({ at: { x: gate.x, z: gate.noseZ - 5 }, size: 17 });
    this.poolPlaces.push({ at: { x: (hall.minX + hall.maxX) / 2, z: 8.5 }, size: 22 });
    this.roomStart = this.poolPlaces.length;
    this.pools = new InstancedMesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.poolMaterial, 12);
    this.pools.frustumCulled = false;
    this.pools.renderOrder = 1;
    this.placePools();
    this.group.add(this.pools);
    this.materials.push({ material: this.poolMaterial, strength: 0.45 });
    // A landing light on each plane in the air or rolling: one point each (moved every frame).
    const landing = new BufferGeometry();
    this.landingAt = new Float32BufferAttribute(new Float32Array(3 * 8), 3);
    landing.setAttribute('position', this.landingAt);
    landing.setDrawRange(0, 0);
    const landingMaterial = new PointsMaterial({ map: glow(), size: 4.2, color: '#fff7d6', ...additive });
    this.landing = new Points(landing, landingMaterial);
    this.landing.frustumCulled = false;
    this.landing.renderOrder = 2;
    this.group.add(this.landing);
    this.materials.push({ material: landingMaterial, strength: 1 });
    this.group.add(this.terminal);
    this.group.visible = false;
    scene.add(this.group);
  }

  private placePools(): void {
    const place = new Object3D();
    this.poolPlaces.forEach((p, i) => {
      place.position.set(p.at.x, POOL_HEIGHT, p.at.z);
      place.scale.set(p.size, 1, p.size);
      place.updateMatrix();
      this.pools.setMatrixAt(i, place.matrix);
    });
    this.pools.count = this.poolPlaces.length;
    this.pools.instanceMatrix.needsUpdate = true;
  }

  /** The terminal's lamps (their globes, 2.7 m up) haloed over a warm wash on its floor, for `rooms` (the hall, then the wing once built). */
  setTerminal(rooms: Rect[]): void {
    this.terminal.clear();
    const lamps: { x: number; y: number; z: number }[] = [];
    for (const r of rooms) {
      const n = Math.max(1, Math.round((r.maxX - r.minX) / 4.4));
      for (let i = 0; i <= n; i++) for (const z of [r.minZ, r.maxZ]) lamps.push({ x: r.minX + (i * (r.maxX - r.minX)) / n, y: 2.7, z });
    }
    const h = halos(lamps, 2.4, '#ffe0a0');
    this.terminal.add(h.points);
    const index = this.materials.findIndex((m) => m.material.name === 'terminal-lamps');
    if (index >= 0) this.materials.splice(index, 1);
    h.material.name = 'terminal-lamps';
    this.materials.push({ material: h.material, strength: 0.9 });
    // A wash over each room's floor (after the stands' pools).
    this.poolPlaces.length = this.roomStart;
    for (const r of rooms) this.poolPlaces.push({ at: { x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 }, size: Math.max(r.maxX - r.minX, r.maxZ - r.minZ) * 0.9 });
    this.placePools();
  }

  /** Moves a stand's pool (a new gate's lights). */
  addStand(at: Point): void {
    if (this.poolPlaces.length >= 12) return;
    this.poolPlaces.splice(this.roomStart, 0, { at, size: 17 });
    this.roomStart += 1;
    this.placePools();
  }

  /**
   * One frame at `night` (0 by day, 1 at night): everything fades in with it; the runway's lights shimmer a
   * little; `planes` are where the landing lights shine (the noses of planes coming in or going out).
   */
  update(dt: number, night: number, planes: readonly { x: number; y: number; z: number }[]): void {
    this.time += dt;
    const on = night > DARK_ENOUGH;
    this.group.visible = on;
    if (!on) return;
    for (const { material, strength } of this.materials) material.opacity = Math.min(1, night * strength * (1 + 0.04 * Math.sin(this.time * 6)));
    const n = Math.min(8, planes.length);
    for (let i = 0; i < n; i++) this.landingAt.setXYZ(i, planes[i]!.x, planes[i]!.y + 0.6, planes[i]!.z);
    this.landingAt.needsUpdate = true;
    this.landing.geometry.setDrawRange(0, n);
  }

  dispose(): void {
    this.group.removeFromParent();
  }
}
