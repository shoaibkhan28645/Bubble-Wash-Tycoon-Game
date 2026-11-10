// The festival weekend's parade: Starry the star leads a line of performers
// with balloons once round the park's main paths, then they're gone until
// the next one. People are made the first time a parade sets off.
import { Object3D, type Scene } from 'three';
import type { Point } from '../core/config';
import { PersonAvatar } from './models/person';

/** Metres a second the parade walks, and the gap between performers (metres). */
const SPEED = 1.5;
const GAP = 1.5;

interface Walker {
  avatar: PersonAvatar;
}

export class Parade {
  private walkers: Walker[] = [];
  private readonly lengths: number[] = [];
  private readonly total: number;
  /** How far along the route the leader is (metres); negative: not under way. */
  private s = -1;

  constructor(
    private readonly scene: Scene,
    /** The way round, start to finish. */
    private readonly route: Point[],
    /** The performers, made when first needed: the leader, then the rest. */
    private readonly cast: () => PersonAvatar[],
  ) {
    let sum = 0;
    for (let i = 1; i < route.length; i++) {
      sum += Math.hypot(route[i]!.x - route[i - 1]!.x, route[i]!.z - route[i - 1]!.z);
      this.lengths.push(sum);
    }
    this.total = sum;
  }

  get active(): boolean {
    return this.s >= 0;
  }

  /** Where the leader is, while the parade is on. */
  get lead(): Point | null {
    return this.active ? this.at(this.s) : null;
  }

  start(): void {
    if (this.active) return;
    if (this.walkers.length === 0) {
      this.walkers = this.cast().map((avatar) => {
        this.scene.add(avatar.root);
        return { avatar };
      });
    }
    this.s = 0;
    for (const w of this.walkers) w.avatar.root.visible = false;
  }

  update(dt: number): void {
    if (!this.active) return;
    this.s += SPEED * dt;
    let anyOn = false;
    this.walkers.forEach((w, i) => {
      const d = this.s - i * GAP;
      const on = d >= 0 && d <= this.total;
      w.avatar.root.visible = on;
      if (!on) return;
      anyOn = true;
      const p = this.at(d);
      const q = this.at(Math.min(this.total, d + 0.3));
      w.avatar.root.position.set(p.x, 0, p.z);
      if (Math.hypot(q.x - p.x, q.z - p.z) > 1e-4) w.avatar.root.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
      w.avatar.update(dt);
    });
    if (!anyOn && this.s > this.total) this.s = -1;
  }

  /** The point `d` metres along the route. */
  private at(d: number): Point {
    const route = this.route;
    for (let i = 0; i < this.lengths.length; i++) {
      if (d <= this.lengths[i]!) {
        const start = i === 0 ? 0 : this.lengths[i - 1]!;
        const t = (d - start) / Math.max(1e-6, this.lengths[i]! - start);
        const a = route[i]!;
        const b = route[i + 1]!;
        return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
      }
    }
    return { ...route[route.length - 1]! };
  }

  dispose(): void {
    for (const w of this.walkers) w.avatar.root.removeFromParent();
    this.walkers = [];
  }
}

/** Puts Starry's star head and suit on a person (the mascot, or the parade's leader). */
export function dressAsStarry(avatar: PersonAvatar, costume: Object3D): void {
  const head = costume.getObjectByName('pk_mascot_head');
  const suit = costume.getObjectByName('pk_mascot_suit');
  if (head) {
    head.position.set(0, 1.42, 0.02);
    head.scale.setScalar(1.15);
    avatar.root.add(head);
  }
  if (suit) {
    suit.position.set(0, 0.86, 0);
    suit.scale.set(1.3, 1.35, 1.3);
    avatar.root.add(suit);
  }
  avatar.root.traverse((node) => (node.castShadow = false));
}
