// People: the hero (art/blender/hero.py) and the Kenney Mini Characters,
// each with its model's own animations.
import { AnimationMixer, LoopOnce, Mesh, Group, type AnimationAction, type BufferGeometry, type Object3D } from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { CHARACTERS } from '../../core/config';
import { asset } from '../assets';
import { blobShadow } from './actors';
import { box, cylinder, mergeParts, rbox, toyMaterial, type Part } from './build';
import { footfalls, pickGait, type GaitPose, type Gaits } from './gait';

/** Mini Characters are 0.8 units tall; this makes them about car-roof height. */
const PERSON_SCALE = 2;
/** The hero's tool: along the hand bone, out from the palm, and its size in the hand. */
const HAND_TOOL = [0.035, -0.03, 0.6] as const;
/** Slower than this (metres a second) and a person with gaits stands still. */
const STANDING = 0.15;
/** How quickly the body leans into a start, a stop or a turn (per second). */
const LEAN_RATE = 8;

type Pose = 'idle' | GaitPose | 'scrub';
/** What a person holds while working. */
export type Tool = 'sponge' | 'towel' | 'polisher' | 'nozzle' | 'bag';

const TOOL_PARTS: Record<Tool, Part[]> = {
  sponge: [{ geometry: rbox(0.13, 0.07, 0.09, 0.03), color: '#ffd24a' }],
  towel: [{ geometry: rbox(0.16, 0.03, 0.12, 0.012), color: '#7ee0c3' }],
  polisher: [
    { geometry: cylinder(0.08, 0.04, 12), color: '#fff3c4', y: -0.03 },
    { geometry: rbox(0.06, 0.07, 0.06, 0.02), color: '#3b4a5e', y: 0.02 },
  ],
  bag: [
    { geometry: rbox(0.2, 0.24, 0.12, 0.03), color: '#d9a866', y: -0.06 },
    { geometry: box(0.16, 0.04, 0.02), color: '#ff5fa8', y: -0.02, z: 0.065 },
  ],
  nozzle: [
    { geometry: rbox(0.06, 0.12, 0.09, 0.02), color: '#3fae5a' },
    { geometry: cylinder(0.018, 0.14, 6), color: '#3b4a5e', y: -0.04, z: 0.09, rx: Math.PI / 2 },
  ],
};
const toolGeometries = new Map<Tool, BufferGeometry>();
const GAITS = CHARACTERS.gaits as Record<string, Gaits>;

/** A person with its model's animations. */
export class PersonAvatar {
  readonly root = new Group();
  /** A foot just landed (people with gaits only: the hero). */
  onStep: ((gait: GaitPose) => void) | null = null;
  private readonly model: Object3D;
  private readonly mixer: AnimationMixer;
  private readonly actions = new Map<Pose, AnimationAction>();
  /** Ground speeds of the walk, jog and sprint clips, when the model has them. */
  private readonly gaits: Gaits | null;
  private current: AnimationAction | undefined;
  private gait: GaitPose | null = null;
  private phase = 0;
  private readonly tool: Mesh | null = null;
  private readonly gestureAction: AnimationAction | null = null;
  private gestureLeft = 0;
  private readonly lean = { forward: 0, side: 0, wantForward: 0, wantSide: 0 };
  /** Shows the tool all the time, e.g. a shopping bag being carried. */
  holding = false;

  constructor(character: string, tool: Tool | null = null) {
    const { scene, animations } = asset(`person:${character}`);
    const model = cloneSkinned(scene);
    model.scale.setScalar(PERSON_SCALE);
    this.model = model;
    this.gaits = GAITS[character] ?? null;
    // People keep their soft blob shadow: real ones would draw every
    // animated character a second time each frame.
    this.root.name = 'person';
    this.root.add(model, blobShadow(1.2, 1.2));
    this.mixer = new AnimationMixer(model);
    const clips: Record<Pose, string> = { idle: 'idle', walk: 'walk', jog: 'jog', sprint: 'sprint', scrub: 'interact-right' };
    for (const [pose, name] of Object.entries(clips) as [Pose, string][]) {
      const clip = animations.find((a) => a.name === name);
      if (clip) this.actions.set(pose, this.mixer.clipAction(clip));
    }
    // A tool in the right hand, shown while working (the hero has a hand
    // bone; Kenney people hold it at the end of the arm).
    const palm = model.getObjectByName('hand-right');
    const hand = palm ?? model.getObjectByName('arm-right');
    if (tool && hand) {
      let geometry = toolGeometries.get(tool);
      if (!geometry) {
        geometry = mergeParts(TOOL_PARTS[tool]);
        toolGeometries.set(tool, geometry);
      }
      this.tool = new Mesh(geometry, toyMaterial);
      if (palm) {
        this.tool.position.set(0, HAND_TOOL[0], HAND_TOOL[1]);
        this.tool.scale.setScalar(HAND_TOOL[2]);
      } else {
        this.tool.position.set(0, -0.21, 0.03);
      }
      this.tool.visible = false;
      hand.add(this.tool);
    }
    const pick = animations.find((a) => a.name === 'pick-up');
    if (pick) this.gestureAction = this.mixer.clipAction(pick).setLoop(LoopOnce, 1);
    this.play('idle');
  }

  /** Bend down and pick something up (cash, supplies); walking cancels it. */
  pickUp(): void {
    if (!this.gestureAction || this.gestureLeft > 0) return;
    this.current?.fadeOut(0.1);
    this.gestureAction.reset().fadeIn(0.1).play();
    this.current = this.gestureAction;
    this.gait = null;
    this.gestureLeft = this.gestureAction.getClip().duration;
  }

  /** Tilts the whole body (radians): forward into a start, back into a stop, sideways into a turn. */
  setLean(forward: number, side: number): void {
    this.lean.wantForward = forward;
    this.lean.wantSide = side;
  }

  /**
   * speed: 0 idle, up to 1 full speed. groundSpeed: metres a second really
   * covered; a person with gaits picks walk, jog or sprint from it and plays
   * it at the matching rate, so its feet don't skid. Scrubbing shows when standing still.
   */
  update(dt: number, speed: number, scrubbing: boolean, groundSpeed?: number): void {
    const paced = this.gaits && groundSpeed !== undefined;
    const moving = paced ? groundSpeed > STANDING : speed > 0.05;
    this.gestureLeft -= dt;
    if (this.gestureLeft <= 0 || moving) {
      this.gestureLeft = 0;
      if (moving && paced) {
        const { pose, rate } = pickGait(this.gaits!, groundSpeed, this.gait);
        this.play(pose);
        this.gait = pose;
        if (this.current) this.current.timeScale = rate;
      } else {
        this.gait = null;
        // Paced people stand their ground against a wall instead of running on the spot.
        const pose: Pose = !moving ? (scrubbing ? 'scrub' : 'idle') : speed > 0.75 ? 'sprint' : 'walk';
        this.play(pose);
        if (this.current) this.current.timeScale = 1;
      }
    }
    if (this.tool) this.tool.visible = this.holding || (scrubbing && !moving);
    this.mixer.update(dt);
    this.countSteps();
    const lean = this.lean;
    const k = Math.min(1, dt * LEAN_RATE);
    lean.forward += (lean.wantForward - lean.forward) * k;
    lean.side += (lean.wantSide - lean.side) * k;
    this.model.rotation.set(lean.forward, 0, lean.side);
  }

  private countSteps(): void {
    const action = this.current;
    if (!this.gait || !action) return;
    const length = action.getClip().duration;
    const phase = (action.time % length) / length;
    if (footfalls(this.phase, phase) > 0) this.onStep?.(this.gait);
    this.phase = phase;
  }

  private play(pose: Pose): void {
    const next = this.actions.get(pose);
    if (!next || next === this.current) return;
    // From one gait to another, the feet carry on where they were.
    const from = this.current;
    const inStride = this.gait !== null && from !== undefined && (pose === 'walk' || pose === 'jog' || pose === 'sprint');
    next.reset();
    if (inStride) next.time = this.phase * next.getClip().duration;
    else this.phase = 0;
    next.fadeIn(0.15).play();
    from?.fadeOut(0.15);
    this.current = next;
  }
}
