import type { Group, Scene } from 'three';
import type { Point, Rect, Tuning } from '../core/config';
import { CHARACTERS } from '../core/config';
import { PersonAvatar } from '../render/models/person';
import type { MoveInput } from './input';

const TURN_RATE = 14;
/** How quickly the hero gets up to speed, and stops (per second): a little weight, still snappy. */
const ACCELERATION = 12;
const STOPPING = 16;
/** Body lean (radians) per m/s² of speeding up, and per (rad/s × m/s) of turning; and the most of each. */
const LEAN_ACCEL = 0.012;
const LEAN_TURN = 0.016;
const MAX_LEAN_FORWARD = 0.12;
const MAX_LEAN_SIDE = 0.15;
/** How quickly the measured ground speed follows the real one (per second), so the stride doesn't jitter. */
const SPEED_SMOOTHING = 12;

/** The character the player steers, with a little momentum on the flat lot. */
export class Player {
  readonly mesh: Group;
  private readonly avatar = new PersonAvatar(CHARACTERS.player, 'sponge');
  /** Set by the bays each frame while the player is washing a car. */
  scrubbing = false;
  private heading = 0;
  private moving = false;
  private readonly velocity = { x: 0, z: 0 };
  /** Metres a second really covered (after walls and cars), smoothed. */
  private groundSpeed = 0;

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

  /** Called as each foot lands (for the footstep sound). */
  onFootstep(handler: () => void): void {
    this.avatar.onStep = handler;
  }

  update(dt: number, move: MoveInput, obstacles: readonly Rect[], bounds: Rect): void {
    const strength = Math.hypot(move.x, move.z);
    const p = this.mesh.position;
    const v = this.velocity;
    const top = this.tuning.speed * this.speedBonus();
    const k = Math.min(1, dt * (strength > 0 ? ACCELERATION : STOPPING));
    v.x += (move.x * top - v.x) * k;
    v.z += (move.z * top - v.z) * k;
    const fromX = p.x;
    const fromZ = p.z;
    p.x += v.x * dt;
    p.z += v.z * dt;
    let turned = 0;
    if (strength > 0) {
      const goal = Math.atan2(move.x, move.z);
      let diff = goal - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      turned = diff * Math.min(1, dt * TURN_RATE);
      this.heading += turned;
    }
    const r = this.tuning.radius;
    for (const rect of obstacles) pushOut(p, r, rect);
    p.x = Math.min(bounds.maxX - r, Math.max(bounds.minX + r, p.x));
    p.z = Math.min(bounds.maxZ - r, Math.max(bounds.minZ + r, p.z));

    // Walls and cars stop the hero for real: carry on only with what was actually moved.
    const before = this.groundSpeed;
    if (dt > 0) {
      v.x = (p.x - fromX) / dt;
      v.z = (p.z - fromZ) / dt;
      this.groundSpeed += (Math.hypot(v.x, v.z) - this.groundSpeed) * Math.min(1, dt * SPEED_SMOOTHING);
      const accel = (this.groundSpeed - before) / dt;
      const forward = clamp(accel * LEAN_ACCEL, MAX_LEAN_FORWARD);
      const side = clamp((-turned / dt) * this.groundSpeed * LEAN_TURN, MAX_LEAN_SIDE);
      this.avatar.setLean(forward, side);
    }
    this.moving = strength > 0 || this.groundSpeed > 0.2;

    // The hero's walk, jog and sprint, played to match the ground covered.
    this.avatar.update(dt, strength, this.scrubbing, this.groundSpeed);
    this.mesh.rotation.y = this.heading;
  }
}

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
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
