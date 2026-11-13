// What a rush job looks like (systems/jobs.ts has what it is): a glowing ring
// and beam of light where to go next, the things to pick up lying on the
// ground (or wandering off), what the hero's carrying held in front of them,
// the person (or calf) waiting and following once found, someone waiting at
// the other end, and what there is to work at (a dusty VIP car, the pump).
// The chip under the cash bar says what the job is, how long's left and what
// it pays; an arrow at the screen's edge points the way when it's off screen.
// A golden job glows brighter.
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

/** What the things in a job look like (by its `thing`, else its id), when the town has no model of its own. */
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
  // A paper bag with a burger on top.
  snacks: mergeParts([
    { geometry: box(0.3, 0.34, 0.2), color: '#d9b27c', y: 0.17 },
    { geometry: box(0.31, 0.04, 0.21), color: '#ff5a5f', y: 0.26 },
    { geometry: cylinder(0.13, 0.05), color: '#e0a050', y: 0.37 },
    { geometry: cylinder(0.135, 0.03), color: '#7a4a2a', y: 0.41 },
    { geometry: cylinder(0.13, 0.05), color: '#e8b060', y: 0.45 },
  ]),
  // A box of plush toys.
  prizes: mergeParts([
    { geometry: box(0.48, 0.28, 0.36), color: '#ff8fc8', y: 0.14 },
    { geometry: sphere(0.11, 8), color: '#c8915a', x: -0.12, y: 0.34 },
    { geometry: sphere(0.1, 8), color: '#7fd0ff', x: 0.1, y: 0.33, z: 0.04 },
    { geometry: sphere(0.09, 8), color: '#ffe066', x: 0.0, y: 0.35, z: -0.1 },
  ]),
  toolbox: mergeParts([
    { geometry: box(0.5, 0.24, 0.24), color: '#e8453c', y: 0.12 },
    { geometry: box(0.52, 0.04, 0.26), color: '#b8322b', y: 0.25 },
    { geometry: box(0.24, 0.1, 0.04), color: '#444a55', y: 0.31 },
    { geometry: box(0.06, 0.32, 0.06), color: '#9aa4b0', x: 0.34, y: 0.16 },
  ]),
  bucket: mergeParts([
    { geometry: cylinder(0.17, 0.3), color: '#9aa4b0', y: 0.15 },
    { geometry: cylinder(0.15, 0.02), color: '#4fb6f0', y: 0.29 },
    { geometry: box(0.36, 0.02, 0.02), color: '#6a7480', y: 0.42 },
  ]),
};
const FALLBACK = THINGS.spill!;

/** Balloons in all sorts of colours: a balloon and its string. */
const BALLOON_COLORS = ['#ff5a5f', '#ffd23a', '#4fc3f7', '#7ed957', '#c77dff'];
const BALLOONS = BALLOON_COLORS.map((color) =>
  mergeParts([
    { geometry: sphere(0.2, 10), color, y: 0.62 },
    { geometry: cylinder(0.04, 0.06, 6), color, y: 0.41 },
    { geometry: cylinder(0.006, 0.4, 3), color: '#ffffff', y: 0.2 },
  ]),
);
/** How high things float (balloons), and how big they're drawn in the hero's hands. */
const FLOAT: Record<string, number> = { balloon: 0.8 };
const HELD: Record<string, number> = { hen: 0.55 };

/** Seconds left that make the chip hurry (red, pulsing). */
const HURRY = 10;
/** Seconds the people (and a polished car) stay, happy, once it's done. */
const LINGER = 2.4;

/** Who to show for a job: a child lost, a grown-up waiting. Null if their models aren't loaded yet. */
export type MakePerson = (who: 'child' | 'adult') => PersonAvatar | null;
/**
 * A town's own model of a job's thing (a hen, a calf, a VIP car), or null to draw one here. A model's
 * `userData.progress(share)` is called as work on it goes (a car comes clean).
 */
export type MakeThing = (kind: string) => Object3D | null;

/** Someone about in a job: a person, or an animal trotting along. */
interface Figure {
  readonly root: Object3D;
  update(dt: number): void;
  wave(): void;
}

/** An animal model following the hero: it bobs and rocks as it trots, and hops for joy. */
class Critter implements Figure {
  readonly root = new Group();
  private readonly last = new Vector3();
  private time = Math.random() * 10;
  private hop = 0;

  constructor(private readonly body: Object3D) {
    this.root.add(body);
  }

  update(dt: number): void {
    this.time += dt;
    const speed = this.root.position.distanceTo(this.last) / Math.max(dt, 1e-3);
    this.last.copy(this.root.position);
    const trot = speed > 0.3 ? 1 : 0;
    this.hop = Math.max(0, this.hop - dt);
    const jump = this.hop > 0 ? Math.sin((this.hop / 0.5) * Math.PI) * 0.35 : 0;
    this.body.position.y = trot * Math.abs(Math.sin(this.time * 10)) * 0.08 + jump;
    this.body.rotation.x = trot * Math.sin(this.time * 10) * 0.07;
  }

  wave(): void {
    this.hop = 0.5;
  }
}

interface Who {
  figure: Figure;
  bubble: Label;
  at: Vector3;
}

interface Shown {
  job: Job;
  /** What its things are (a model's name). */
  kind: string;
  /** Things on the ground (by the point they lie at: an item, where to fetch from, what to work at). */
  things: Map<Point, Object3D>;
  held: Object3D[];
  person: Who | null;
  waiting: Who | null;
  label: string;
}

export class JobView {
  private readonly ring: Mesh<RingGeometry, MeshBasicMaterial>;
  private readonly beam: Mesh<CylinderGeometry, MeshBasicMaterial>;
  private readonly marker = new Group();
  private readonly icon: Label;
  private readonly iconAt = new Vector3();
  private readonly hands = new Group();
  private readonly pointer: EdgePointer;
  private shown: Shown | null = null;
  /** People (and things) that have finished, staying a moment before they go. */
  private readonly leaving: { root: Object3D; bubble: Label | null; left: number; tick: (dt: number) => void }[] = [];
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
    private readonly makeThing: MakeThing = () => null,
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
    const { def } = job;
    const kind = def.thing ?? def.id;
    const things = new Map<Point, Object3D>();
    switch (def.pattern) {
      case 'collect':
        job.items.forEach((p, i) => things.set(p, this.thing(kind, p, i)));
        break;
      case 'deliver':
      case 'work':
        things.set(job.from, this.thing(kind, job.from, 0));
        break;
    }
    const who = def.who ?? 'child';
    const person = def.pattern === 'escort' ? this.figure(who, job.from, who === 'child' ? '😢' : who === 'calf' ? '🐮❓' : '🤔') : null;
    const waits = def.waiting ?? 'adult';
    const waiting =
      job.to && (def.pattern === 'deliver' || def.pattern === 'escort') && waits !== 'none'
        ? this.figure(waits, job.to, def.pattern === 'escort' ? '😟' : `${def.icon}❓`)
        : null;
    // A golden job glows brighter.
    this.ring.material.color.setHex(job.golden ? 0xfff09a : 0xffc23a);
    this.beam.material.color.setHex(job.golden ? 0xffe680 : 0xffd24a);
    this.beam.material.opacity = job.golden ? 0.34 : 0.22;
    // Somewhere to work: the ring goes round all of it (a car), as far as the hero can work from.
    const around = def.pattern === 'work' ? Math.max(1, def.reach ?? 1) : 1;
    this.ring.scale.set(around, 1, around);
    this.beam.scale.set(around, 1, around);
    this.shown = { job, kind, things, held: [], person, waiting, label: '' };
  }

  /** Something was picked up (or fetched): it goes from the ground into the hero's hands. */
  picked(at: Point): void {
    const shown = this.shown;
    if (!shown) return;
    const mesh = shown.things.get(at);
    if (!mesh) return;
    shown.things.delete(at);
    this.scene.remove(mesh);
    const scale = HELD[shown.kind] ?? 1;
    mesh.scale.multiplyScalar(scale);
    mesh.position.set(0, shown.held.length * 0.3 * Math.max(scale, 0.8), 0);
    mesh.rotation.set(0, (shown.held.length % 2) * 0.4, 0);
    this.hands.add(mesh);
    shown.held.push(mesh);
  }

  /** It's done: the people are happy (and a polished car gleams), and go after a moment. */
  done(): void {
    const shown = this.shown;
    if (!shown) return;
    for (const who of [shown.person, shown.waiting]) {
      if (!who) continue;
      who.bubble.el.textContent = '😊❤️';
      who.figure.wave();
      this.leaving.push({ root: who.figure.root, bubble: who.bubble, left: LINGER, tick: (dt) => who.figure.update(dt) });
      if (who === shown.person) shown.person = null;
      else shown.waiting = null;
    }
    if (shown.job.def.pattern === 'work') {
      for (const [p, mesh] of shown.things) {
        (mesh.userData.progress as ((share: number) => void) | undefined)?.(1);
        this.leaving.push({ root: mesh, bubble: null, left: LINGER, tick: () => {} });
        shown.things.delete(p);
      }
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
    for (const m of [...shown.things.values(), ...shown.held]) m.removeFromParent();
    for (const who of [shown.person, shown.waiting]) {
      if (!who) continue;
      who.figure.root.removeFromParent();
      this.labels.remove(who.bubble);
    }
  }

  update(dt: number, board: JobBoard, hero: Point, streak: number, camera: PerspectiveCamera, width: number, height: number, insets: { top: number; right: number }): void {
    this.time += dt;
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const gone = this.leaving[i]!;
      gone.left -= dt;
      gone.tick(dt);
      if (gone.left > 0) continue;
      gone.root.removeFromParent();
      if (gone.bubble) this.labels.remove(gone.bubble);
      this.leaving.splice(i, 1);
    }
    const shown = this.shown;
    const job = board.active;
    if (!shown || !job || job !== shown.job) {
      if (shown) this.clear();
      this.pointer.update(camera, width, height, null, insets);
      return;
    }
    const { def } = job;
    // Where to go next: the ring, the beam and the icon over it.
    const target = board.target(hero);
    this.marker.visible = !!target;
    this.icon.visible = !!target;
    if (target) {
      this.marker.position.set(target.x, 0, target.z);
      const pulse = 1 + Math.sin(this.time * 5) * 0.08;
      const around = def.pattern === 'work' ? Math.max(1, def.reach ?? 1) : 1;
      this.ring.scale.set(around * pulse, 1, around * pulse);
      this.ring.rotation.y = this.time * 0.8;
      this.iconAt.set(target.x, 2.6 + Math.sin(this.time * 3) * 0.12, target.z);
    }
    // The icon over it: how far the work's got, while it's being done.
    const label = def.pattern === 'work' && job.held > 0 ? `${def.icon} ${Math.floor(job.progress * 100)}%` : `${job.golden ? '🌟' : ''}${def.icon}`;
    if (label !== shown.label) {
      shown.label = label;
      this.icon.el.textContent = label;
    }
    // The things on the ground: wandering ones go where they've got to (facing their way, bobbing as they
    // go); the rest bob and turn so they catch the eye. Something being worked at comes good as it goes.
    const lift = FLOAT[shown.kind] ?? 0.05;
    let i = 0;
    for (const [p, m] of shown.things) {
      if (def.pattern === 'work') {
        (m.userData.progress as ((share: number) => void) | undefined)?.(job.progress);
        continue;
      }
      if (def.wander) {
        m.position.set(p.x, lift + Math.abs(Math.sin(this.time * 9 + i)) * 0.06, p.z);
        m.rotation.y = (p as Point & { heading?: number }).heading ?? 0;
        if (lift > 0.5) m.rotation.z = Math.sin(this.time * 1.7 + i) * 0.12;
      } else {
        m.position.y = lift + Math.abs(Math.sin(this.time * 3 + i)) * 0.12;
        m.rotation.y = this.time * 1.5 + i;
      }
      i++;
    }
    // The lost one: waiting, then following the hero, walking as they go.
    if (shown.person && job.person) {
      const { figure, at } = shown.person;
      const root = figure.root;
      const dx = job.person.x - root.position.x;
      const dz = job.person.z - root.position.z;
      if (Math.hypot(dx, dz) > 1e-3) root.rotation.y = Math.atan2(dx, dz);
      else if (!job.following) root.rotation.y = Math.atan2(hero.x - job.person.x, hero.z - job.person.z);
      root.position.set(job.person.x, 0, job.person.z);
      figure.update(dt);
      at.set(job.person.x, 2.1, job.person.z);
      if (job.following) shown.person.bubble.el.textContent = def.who === 'calf' ? '🐮' : '🙂';
    }
    if (shown.waiting) {
      const { figure } = shown.waiting;
      const look = shown.person && job.person ? job.person : hero;
      figure.root.rotation.y = Math.atan2(look.x - figure.root.position.x, look.z - figure.root.position.z);
      figure.update(dt);
    }
    // The chip: what, how long, what it pays (and the streak, how many picked up, how far the work's got).
    const count = def.pattern === 'collect' ? ` ${job.carried}/${def.count ?? 1}` : def.pattern === 'work' && job.held > 0 ? ` ${Math.floor(job.progress * 100)}%` : '';
    const bonus = streak > 0 && job.multiplier > 1 ? ` 🔥×${job.multiplier}` : '';
    const text = `${job.golden ? '🌟' : '⚡'} ${t(def.title as StringKey)}${count} · ${formatClock(Math.max(0, job.left))} · +${formatCash(job.pay)}${bonus}`;
    const look = job.left <= HURRY ? 'job-hurry' : job.golden ? 'job-gold' : 'job';
    const key = `${text}|${look}`;
    if (key !== this.chipText) {
      if (look !== this.chipText.split('|')[1]) this.chips.set('job', null);
      this.chipText = key;
      this.chips.set('job', text, look);
    }
    this.pointer.update(camera, width, height, target, insets);
  }

  dispose(): void {
    this.clear();
    for (const gone of this.leaving) {
      gone.root.removeFromParent();
      if (gone.bubble) this.labels.remove(gone.bubble);
    }
    this.leaving.length = 0;
    this.marker.removeFromParent();
    this.hands.removeFromParent();
    this.labels.remove(this.icon);
  }

  /** One of a job's things, put down at a spot: the town's own model if it has one, else one drawn here. */
  private thing(kind: string, at: Point & { face?: number }, i: number): Object3D {
    const model = this.makeThing(kind);
    const mesh = model ?? new Mesh(kind === 'balloon' ? BALLOONS[i % BALLOONS.length]! : (THINGS[kind] ?? FALLBACK), toyMaterial);
    if (!model) {
      mesh.scale.setScalar(1.5);
      mesh.castShadow = true;
    }
    mesh.position.set(at.x, FLOAT[kind] ?? 0.05, at.z);
    mesh.rotation.y = at.face ?? 0;
    this.scene.add(mesh);
    return mesh;
  }

  /** Someone in the job: a person (if their models are loaded), or an animal. */
  private figure(who: 'child' | 'adult' | 'calf', at: Point, mood: string): Who | null {
    let figure: Figure | null = null;
    if (who === 'calf') {
      const body = this.makeThing('calf');
      if (body) figure = new Critter(body);
    } else figure = this.makePerson(who);
    if (!figure) return null;
    figure.root.position.set(at.x, 0, at.z);
    this.scene.add(figure.root);
    const bubble = document.createElement('div');
    bubble.className = 'job-bubble';
    bubble.textContent = mood;
    const where = new Vector3(at.x, 2.1, at.z);
    return { figure, bubble: this.labels.add(bubble, where), at: where };
  }
}
