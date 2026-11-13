// What a rush job looks like (systems/jobs.ts has what it is): a glowing ring
// and beam of light where to go next, the things to pick up lying on the
// ground, what the hero's carrying held in front of them, the person waiting
// (and following once found), and someone waiting at the other end. The
// chip under the cash bar says what the job is, how long's left and what it
// pays; an arrow at the screen's edge points the way when it's off screen.
import {
  AdditiveBlending,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Vector3,
  type BufferGeometry,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
} from 'three';
import type { Point } from '../core/config';
import { box, cylinder, mergeParts, sphere, toyMaterial } from './models/build';
import type { PersonAvatar } from './models/person';
import type { Job, JobBoard } from '../systems/jobs';
import { formatCash } from '../systems/economy';
import { formatClock } from '../systems/construction';
import { EdgePointer } from '../ui/edgePointer';
import type { EventChips } from '../ui/eventChips';
import { t, type StringKey } from '../ui/strings';
import type { Label, WorldLabels } from '../ui/worldLabels';

/** What the things in a job look like (by job id): a soap bottle, a crate. */
const THINGS: Record<string, BufferGeometry> = {
  spill: mergeParts([
    { geometry: cylinder(0.13, 0.26), color: '#6cc4ff', y: 0.13 },
    { geometry: cylinder(0.05, 0.08), color: '#ffffff', y: 0.3 },
  ]),
  rush: mergeParts([
    { geometry: box(0.5, 0.32, 0.4), color: '#c08a55', y: 0.16 },
    { geometry: box(0.52, 0.05, 0.42), color: '#8f6036', y: 0.3 },
    { geometry: box(0.08, 0.33, 0.42), color: '#ff5a5f', y: 0.165 },
    { geometry: sphere(0.08, 6), color: '#ff5a5f', y: 0.36 },
  ]),
};
const FALLBACK = THINGS.spill!;

/** Seconds left that make the chip hurry (red, pulsing). */
const HURRY = 10;
/** Seconds the people stay, happy, once it's done. */
const LINGER = 2.4;

/** Who to show for a job: a child lost, a grown-up waiting. Null if their models aren't loaded yet. */
export type MakePerson = (who: 'child' | 'adult') => PersonAvatar | null;

interface Shown {
  job: Job;
  things: Mesh[];
  held: Mesh[];
  person: { avatar: PersonAvatar; bubble: Label; at: Vector3 } | null;
  waiting: { avatar: PersonAvatar; bubble: Label; at: Vector3 } | null;
}

export class JobView {
  private readonly ring: Mesh;
  private readonly beam: Mesh;
  private readonly marker = new Group();
  private readonly icon: Label;
  private readonly iconAt = new Vector3();
  private readonly hands = new Group();
  private readonly pointer: EdgePointer;
  private shown: Shown | null = null;
  /** People who've finished, staying a moment before they go. */
  private readonly leaving: { avatar: PersonAvatar; bubble: Label; left: number }[] = [];
  private time = 0;
  private chipText = '';

  constructor(
    private readonly scene: Scene,
    private readonly labels: WorldLabels,
    root: HTMLElement,
    private readonly chips: EventChips,
    /** The hero's model: what they carry is held in front of them. */
    hero: Object3D,
    private readonly makePerson: MakePerson,
  ) {
    const glow = (color: number, opacity: number) =>
      new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
    this.ring = new Mesh(new RingGeometry(0.75, 1.0, 40).rotateX(-Math.PI / 2), glow(0xffc23a, 0.85));
    this.ring.position.y = 0.12;
    this.beam = new Mesh(new CylinderGeometry(0.55, 0.75, 3.2, 20, 1, true), glow(0xffd24a, 0.22));
    this.beam.position.y = 1.6;
    this.marker.add(this.ring, this.beam);
    this.marker.visible = false;
    this.marker.renderOrder = 2;
    scene.add(this.marker);
    const icon = document.createElement('div');
    icon.className = 'job-icon';
    this.icon = labels.add(icon, this.iconAt);
    this.icon.visible = false;
    // Held in front, at the chest.
    this.hands.position.set(0, 0.95, 0.42);
    this.hands.scale.setScalar(1.4);
    hero.add(this.hands);
    this.pointer = new EdgePointer(root, 'job');
  }

  /** A job's been offered: puts its things and people out. */
  show(job: Job): void {
    this.clear();
    const geometry = THINGS[job.def.id] ?? FALLBACK;
    const things =
      job.def.pattern === 'collect'
        ? job.items.map((p) => this.thing(geometry, p))
        : job.def.pattern === 'deliver'
          ? [this.thing(geometry, job.from)]
          : [];
    const person = job.def.pattern === 'escort' ? this.person('child', job.from, '😢') : null;
    const waiting = job.to && job.def.pattern !== 'collect' ? this.person('adult', job.to, job.def.pattern === 'escort' ? '😟' : `${job.def.icon}❓`) : null;
    (this.icon.el as HTMLElement).textContent = job.def.icon;
    this.shown = { job, things, held: [], person, waiting };
  }

  /** Something was picked up (or fetched): it goes from the ground into the hero's hands. */
  picked(at: Point): void {
    const shown = this.shown;
    if (!shown) return;
    const i = shown.things.findIndex((m) => Math.abs(m.position.x - at.x) < 1e-6 && Math.abs(m.position.z - at.z) < 1e-6);
    const mesh = i >= 0 ? shown.things.splice(i, 1)[0]! : null;
    if (!mesh) return;
    this.scene.remove(mesh);
    mesh.position.set(0, shown.held.length * 0.3, 0);
    mesh.rotation.set(0, (shown.held.length % 2) * 0.4, 0);
    this.hands.add(mesh);
    shown.held.push(mesh);
  }

  /** It's done: the people are happy, and go after a moment. */
  done(): void {
    const shown = this.shown;
    if (!shown) return;
    for (const who of [shown.person, shown.waiting]) {
      if (!who) continue;
      who.bubble.el.textContent = '😊❤️';
      who.avatar.wave();
      this.leaving.push({ avatar: who.avatar, bubble: who.bubble, left: LINGER });
      if (who === shown.person) shown.person = null;
      else shown.waiting = null;
    }
    this.clear();
  }

  /** Takes everything away (run out, or the hero left). */
  clear(): void {
    const shown = this.shown;
    this.shown = null;
    this.marker.visible = false;
    this.icon.visible = false;
    this.chips.set('job', null);
    this.chipText = '';
    if (!shown) return;
    for (const m of [...shown.things, ...shown.held]) m.removeFromParent();
    for (const who of [shown.person, shown.waiting]) {
      if (!who) continue;
      who.avatar.root.removeFromParent();
      this.labels.remove(who.bubble);
    }
  }

  update(dt: number, board: JobBoard, hero: Point, streak: number, camera: PerspectiveCamera, width: number, height: number, insets: { top: number; right: number }): void {
    this.time += dt;
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const who = this.leaving[i]!;
      who.left -= dt;
      who.avatar.update(dt);
      if (who.left > 0) continue;
      who.avatar.root.removeFromParent();
      this.labels.remove(who.bubble);
      this.leaving.splice(i, 1);
    }
    const shown = this.shown;
    const job = board.active;
    if (!shown || !job || job !== shown.job) {
      if (shown) this.clear();
      this.pointer.update(camera, width, height, null, insets);
      return;
    }
    // Where to go next: the ring, the beam and the icon over it.
    const target = board.target(hero);
    this.marker.visible = !!target;
    this.icon.visible = !!target;
    if (target) {
      this.marker.position.set(target.x, 0, target.z);
      const pulse = 1 + Math.sin(this.time * 5) * 0.08;
      this.ring.scale.set(pulse, 1, pulse);
      this.ring.rotation.y = this.time * 0.8;
      this.iconAt.set(target.x, 2.6 + Math.sin(this.time * 3) * 0.12, target.z);
    }
    // The things on the ground bob and turn so they catch the eye.
    shown.things.forEach((m, i) => {
      m.position.y = 0.05 + Math.abs(Math.sin(this.time * 3 + i)) * 0.12;
      m.rotation.y = this.time * 1.5 + i;
    });
    // The lost one: waiting, then following the hero, walking as they go.
    if (shown.person && job.person) {
      const { avatar, at } = shown.person;
      const dx = job.person.x - avatar.root.position.x;
      const dz = job.person.z - avatar.root.position.z;
      if (Math.hypot(dx, dz) > 1e-3) avatar.root.rotation.y = Math.atan2(dx, dz);
      else if (!job.following) avatar.root.rotation.y = Math.atan2(hero.x - job.person.x, hero.z - job.person.z);
      avatar.root.position.set(job.person.x, 0, job.person.z);
      avatar.update(dt);
      at.set(job.person.x, 2.1, job.person.z);
      if (job.following) shown.person.bubble.el.textContent = '🙂';
    }
    if (shown.waiting) {
      const { avatar } = shown.waiting;
      const look = shown.person && job.person ? job.person : hero;
      avatar.root.rotation.y = Math.atan2(look.x - avatar.root.position.x, look.z - avatar.root.position.z);
      avatar.update(dt);
    }
    // The chip: what, how long, what it pays (and the streak, and how many picked up).
    const count = job.def.pattern === 'collect' ? ` ${job.carried}/${job.def.count ?? 1}` : '';
    const bonus = streak > 0 && job.multiplier > 1 ? ` 🔥×${job.multiplier}` : '';
    const text = `⚡ ${t(job.def.title as StringKey)}${count} · ${formatClock(Math.max(0, job.left))} · +${formatCash(job.pay)}${bonus}`;
    const hurry = job.left <= HURRY;
    const key = `${text}|${hurry}`;
    if (key !== this.chipText) {
      if (hurry !== this.chipText.endsWith('|true')) this.chips.set('job', null);
      this.chipText = key;
      this.chips.set('job', text, hurry ? 'job-hurry' : 'job');
    }
    this.pointer.update(camera, width, height, target, insets);
  }

  dispose(): void {
    this.clear();
    for (const who of this.leaving) {
      who.avatar.root.removeFromParent();
      this.labels.remove(who.bubble);
    }
    this.leaving.length = 0;
    this.marker.removeFromParent();
    this.hands.removeFromParent();
    this.labels.remove(this.icon);
  }

  private thing(geometry: BufferGeometry, at: Point): Mesh {
    const mesh = new Mesh(geometry, toyMaterial);
    mesh.position.set(at.x, 0.05, at.z);
    mesh.scale.setScalar(1.5);
    mesh.castShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  private person(who: 'child' | 'adult', at: Point, mood: string): Shown['person'] {
    const avatar = this.makePerson(who);
    if (!avatar) return null;
    avatar.root.position.set(at.x, 0, at.z);
    this.scene.add(avatar.root);
    const bubble = document.createElement('div');
    bubble.className = 'job-bubble';
    bubble.textContent = mood;
    const where = new Vector3(at.x, 2.1, at.z);
    return { avatar, bubble: this.labels.add(bubble, where), at: where };
  }
}
