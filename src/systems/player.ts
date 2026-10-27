import type { Group, Scene } from 'three';
import type { Point, Rect, Tuning } from '../core/config';
import { CHARACTERS } from '../core/config';
import { PersonAvatar } from '../render/models/actors';
import type { MoveInput } from './input';

const TURN_RATE = 14;

/** The character the player steers. Kinematic movement on the flat lot. */
export class Player {
  readonly mesh: Group;
  private readonly avatar = new PersonAvatar(CHARACTERS.player);
  /** Set by the bays each frame while the player is washing a car. */
  scrubbing = false;
  private heading = 0;
  private moving = false;

  constructor(
    scene: Scene,
    start: Point,
    private readonly tuning: Tuning['player'],
    /** Walk-speed upgrade multiplier (1 = no upgrade). */
    private readonly speedBonus: () => number = () => 1,
  ) {
    this.mesh = this.avatar.root;
    this.mesh.position.set(start.x, 0, start.z);
    scene.add(this.mesh);
  }

  get isMoving(): boolean {
    return this.moving;
  }

  get position(): Point {
    return { x: this.mesh.position.x, z: this.mesh.position.z };
  }

  update(dt: number, move: MoveInput, obstacles: readonly Rect[], bounds: Rect): void {
    const strength = Math.hypot(move.x, move.z);
    this.moving = strength > 0;
    const p = this.mesh.position;
    if (this.moving) {
      const speed = this.tuning.speed * this.speedBonus();
      p.x += move.x * speed * dt;
      p.z += move.z * speed * dt;
      const goal = Math.atan2(move.x, move.z);
      let diff = goal - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.heading += diff * Math.min(1, dt * TURN_RATE);
    }
    const r = this.tuning.radius;
    for (const rect of obstacles) pushOut(p, r, rect);
    p.x = Math.min(bounds.maxX - r, Math.max(bounds.minX + r, p.x));
    p.z = Math.min(bounds.maxZ - r, Math.max(bounds.minZ + r, p.z));

    // The model's own walk, sprint and scrubbing animations.
    this.avatar.update(dt, strength, this.scrubbing);
    this.mesh.rotation.y = this.heading;
  }
}

/** Pushes a circle out of an axis-aligned rectangle. */
export function pushOut(p: { x: number; z: number }, radius: number, rect: Rect): void {
  const cx = Math.min(rect.maxX, Math.max(rect.minX, p.x));
  const cz = Math.min(rect.maxZ, Math.max(rect.minZ, p.z));
  const dx = p.x - cx;
  const dz = p.z - cz;
  const distSq = dx * dx + dz * dz;
  if (distSq >= radius * radius) return;
  if (distSq > 1e-9) {
    const dist = Math.sqrt(distSq);
    p.x = cx + (dx / dist) * radius;
    p.z = cz + (dz / dist) * radius;
    return;
  }
  // Centre is inside the rectangle: leave by the nearest side.
  const exits = [
    { d: p.x - rect.minX, x: rect.minX - radius, z: p.z },
    { d: rect.maxX - p.x, x: rect.maxX + radius, z: p.z },
    { d: p.z - rect.minZ, x: p.x, z: rect.minZ - radius },
    { d: rect.maxZ - p.z, x: p.x, z: rect.maxZ + radius },
  ];
  const best = exits.reduce((a, b) => (b.d < a.d ? b : a));
  p.x = best.x;
  p.z = best.z;
}
