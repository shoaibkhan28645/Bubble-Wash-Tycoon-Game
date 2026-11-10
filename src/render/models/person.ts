// People: Kenney Mini Characters, all on the same small skeleton with the
// pack's own animations.
import { AnimationMixer, LoopOnce, Mesh, Group, Vector3, type AnimationAction, type BufferGeometry, type Object3D } from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { CHARACTERS } from '../../core/config';
import { asset } from '../assets';
import { onScreen } from '../onScreen';
import { blobShadow } from './actors';
import { box, cylinder, mergeParts, rbox, sphere, toyMaterial, type Part } from './build';
import { footfalls, pickGait, type GaitPose, type Gaits } from './gait';

/** Mini Characters are 0.8 units tall; this makes them about car-roof height. */
const PERSON_SCALE = 2;
/** Where a tool sits on the right arm bone: at the end of the arm, a little in front. */
const HAND_TOOL = [-0.21, 0.03] as const;
/** Slower than this (metres a second) and a person stands still. */
const STANDING = 0.15;
/** How quickly a person's measured ground speed follows the real one (per second). */
const SPEED_SMOOTHING = 12;
/** Further than this in one frame is a jump to a new spot, not a stride. */
const TELEPORT = 1.5;
/** How quickly the body leans into a start, a stop or a turn (per second). */
const LEAN_RATE = 8;
/**
 * Someone this close to the edge of the screen (metres) counts as on it: off
 * screen a person's animation and bones are left alone, and this margin has
 * them moving again before they step into view.
 */
const VIEW_MARGIN = 2.5;
/** Animation time saved up off screen is played on, up to this much (seconds). */
const MAX_CATCH_UP = 1;

type Pose = 'idle' | GaitPose | 'scrub' | 'sit' | 'ride';
/** What a person holds while working. */
export type Tool = 'sponge' | 'towel' | 'polisher' | 'nozzle' | 'bag' | 'clipboard' | 'can' | 'soda' | 'floss' | 'plush' | 'burger' | 'wrench' | 'broom';

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
  // A brown board held flat in front of the hand, paper up (so it reads from the camera above), and a silver clip.
  clipboard: [
    { geometry: rbox(0.2, 0.025, 0.26, 0.008), color: '#b07a45', z: 0.13 },
    { geometry: box(0.16, 0.01, 0.2), color: '#ffffff', y: 0.016, z: 0.12 },
    { geometry: box(0.08, 0.02, 0.03), color: '#c9ced6', y: 0.022, z: 0.245 },
  ],
  // A green watering can hanging from the hand, its spout forward.
  can: [
    { geometry: cylinder(0.095, 0.16, 12), color: '#4fb06a', y: -0.11 },
    { geometry: cylinder(0.017, 0.2, 6), color: '#4fb06a', y: -0.08, z: 0.13, rx: Math.PI / 3 },
    { geometry: rbox(0.025, 0.08, 0.09, 0.01), color: '#3b8a52', y: -0.01 },
  ],
  // Candy floss: a pink cloud on a white stick.
  floss: [
    { geometry: cylinder(0.01, 0.2, 5), color: '#ffffff', y: 0.02 },
    { geometry: sphere(0.075, 8), color: '#ff8fc8', y: 0.15 },
    { geometry: sphere(0.05, 7), color: '#ffb0d8', x: 0.035, y: 0.19, z: 0.02 },
  ],
  // A plush prize: a little bear.
  plush: [
    { geometry: sphere(0.085, 8), color: '#c9a27a', y: 0.02 },
    { geometry: sphere(0.065, 8), color: '#c9a27a', y: 0.13 },
    { geometry: sphere(0.025, 5), color: '#c9a27a', x: 0.05, y: 0.19 },
    { geometry: sphere(0.025, 5), color: '#c9a27a', x: -0.05, y: 0.19 },
    { geometry: sphere(0.02, 5), color: '#ff5fa8', y: 0.06, z: 0.08 },
  ],
  // A burger in its paper.
  burger: [
    { geometry: cylinder(0.075, 0.035, 10), color: '#e0a25a', y: 0.0 },
    { geometry: cylinder(0.08, 0.025, 10), color: '#7a3f22', y: 0.03 },
    { geometry: sphere(0.075, 8), color: '#f0b062', y: 0.05 },
    { geometry: box(0.17, 0.06, 0.17), color: '#ffffff', y: -0.01 },
  ],
  // A big spanner.
  wrench: [
    { geometry: box(0.04, 0.26, 0.02), color: '#c9d2dc', y: 0.0 },
    { geometry: box(0.1, 0.05, 0.025), color: '#c9d2dc', y: 0.14 },
    { geometry: box(0.05, 0.08, 0.04), color: '#ff5c6c', y: -0.1 },
  ],
  // A broom, bristles down.
  broom: [
    { geometry: cylinder(0.015, 0.8, 6), color: '#c98a52', y: -0.15 },
    { geometry: box(0.2, 0.12, 0.08), color: '#ffd24a', y: -0.58 },
  ],
  // A red soda can.
  soda: [
    { geometry: cylinder(0.035, 0.1, 10), color: '#e8423f', y: -0.02 },
    { geometry: cylinder(0.036, 0.015, 10), color: '#d8dde4', y: 0.035 },
  ],
};
const toolGeometries = new Map<Tool, BufferGeometry>();
/** The ground speeds the walk and sprint clips match (characters.json). */
const GAITS = CHARACTERS.gaits as Gaits;

/** A person with its model's animations. */
export class PersonAvatar {
  readonly root = new Group();
  /** A foot just landed. */
  onStep: ((gait: GaitPose) => void) | null = null;
  private readonly model: Object3D;
  private readonly shadow: Object3D;
  private readonly mixer: AnimationMixer;
  private readonly actions = new Map<Pose, AnimationAction>();
  private readonly last = new Vector3();
  private placed = false;
  private measured = 0;
  private current: AnimationAction | undefined;
  private gait: GaitPose | null = null;
  private phase = 0;
  private tool: Mesh | null = null;
  private readonly hand: Object3D | null = null;
  private readonly gestureAction: AnimationAction | null = null;
  private readonly waveAction: AnimationAction | null = null;
  private gestureLeft = 0;
  private readonly lean = { forward: 0, side: 0, wantForward: 0, wantSide: 0 };
  private readonly seenAt = new Vector3();
  /** Animation time not yet played while off screen. */
  private offScreen = 0;
  /** Shows the tool all the time, e.g. a shopping bag being carried. */
  holding = false;
  /** Sitting down (on a bench): the sit pose, whatever the speed says. */
  seated = false;
  /** Sitting on a ride (a carousel horse, a teacup): hands forward, holding on. */
  riding = false;

  constructor(character: string, tool: Tool | null = null) {
    const { scene, animations } = asset(`person:${character}`);
    const model = cloneSkinned(scene);
    model.scale.setScalar(PERSON_SCALE);
    this.model = model;
    // People keep their soft blob shadow: real ones would draw every
    // animated character a second time each frame.
    this.root.name = 'person';
    this.shadow = blobShadow(1.2, 1.2);
    this.root.add(model, this.shadow);
    this.mixer = new AnimationMixer(model);
    const clips: Record<Pose, string> = { idle: 'idle', walk: 'walk', jog: 'jog', sprint: 'sprint', scrub: 'interact-right', sit: 'sit', ride: 'drive' };
    for (const [pose, name] of Object.entries(clips) as [Pose, string][]) {
      const clip = animations.find((a) => a.name === name);
      if (clip) this.actions.set(pose, this.mixer.clipAction(clip));
    }
    // A tool in the right hand, shown while working.
    this.hand = model.getObjectByName('arm-right') ?? null;
    if (tool) this.holdTool(tool);
    const pick = animations.find((a) => a.name === 'pick-up');
    if (pick) this.gestureAction = this.mixer.clipAction(pick).setLoop(LoopOnce, 1);
    const yes = animations.find((a) => a.name === 'emote-yes');
    if (yes) this.waveAction = this.mixer.clipAction(yes).setLoop(LoopOnce, 1);
    this.play('idle');
  }

  /** Puts `tool` in the right hand (shown while working, or while `holding`): a visitor's candy floss, then a prize. */
  holdTool(tool: Tool): void {
    if (!this.hand) return;
    let geometry = toolGeometries.get(tool);
    if (!geometry) {
      geometry = mergeParts(TOOL_PARTS[tool]);
      toolGeometries.set(tool, geometry);
    }
    if (this.tool) {
      this.tool.geometry = geometry;
      return;
    }
    this.tool = new Mesh(geometry, toyMaterial);
    this.tool.position.set(0, HAND_TOOL[0], HAND_TOOL[1]);
    this.tool.visible = false;
    this.hand.add(this.tool);
  }

  /** Bend down and pick something up (cash, supplies); walking cancels it. */
  pickUp(): void {
    this.gesture(this.gestureAction);
  }

  /** A big happy nod and wave (the mascot greeting a queue); walking cancels it. */
  wave(): void {
    this.gesture(this.waveAction);
  }

  private gesture(action: AnimationAction | null): void {
    if (!action || this.gestureLeft > 0) return;
    this.current?.fadeOut(0.1);
    action.reset().fadeIn(0.1).play();
    this.current = action;
    this.gait = null;
    this.gestureLeft = action.getClip().duration;
  }

  /** The soft shadow under the feet: off while up on a ride's seat (it would float in the air). */
  showShadow(on: boolean): void {
    this.shadow.visible = on;
  }

  /** Tilts the whole body (radians): forward into a start, back into a stop, sideways into a turn. */
  setLean(forward: number, side: number): void {
    this.lean.wantForward = forward;
    this.lean.wantSide = side;
  }

  /**
   * Picks walk, jog or sprint from the ground really covered (metres a
   * second; measured from the person's own movement unless given) and plays
   * it at the matching rate, so the feet don't skid. Scrubbing shows when standing still.
   */
  update(dt: number, scrubbing = false, groundSpeed?: number): void {
    // A child (drawn smaller) takes shorter strides: the walk plays faster for the ground covered.
    const speed = (groundSpeed ?? this.measure(dt)) / this.root.scale.x;
    const moving = speed > STANDING && !this.seated;
    this.gestureLeft -= dt;
    if (this.seated) {
      this.gestureLeft = 0;
      this.gait = null;
      this.play(this.riding && this.actions.has('ride') ? 'ride' : 'sit');
      if (this.current) this.current.timeScale = 1;
    } else if (this.gestureLeft <= 0 || moving) {
      this.gestureLeft = 0;
      if (moving) {
        const { pose, rate } = pickGait(GAITS, speed, this.gait);
        this.play(pose);
        this.gait = pose;
        if (this.current) this.current.timeScale = rate;
      } else {
        // Standing (or pushing against a wall): no running on the spot.
        this.gait = null;
        this.play(scrubbing ? 'scrub' : 'idle');
        if (this.current) this.current.timeScale = 1;
      }
    }
    if (this.tool) this.tool.visible = this.holding || (scrubbing && !moving);
    // Off screen: no animating, and the skeleton's bones aren't worked out each frame (a big
    // share of a busy town's frame on a phone). The walk carries on from where it would be.
    // The body is hidden meanwhile: left as it was, it stayed drawn where the person walked off
    // screen, and showed there (stuck, then gone) when the camera came round.
    this.seenAt.setFromMatrixPosition(this.root.matrixWorld);
    const seen = onScreen(this.seenAt, VIEW_MARGIN);
    this.model.matrixWorldAutoUpdate = seen;
    this.model.visible = seen;
    if (!seen) {
      this.offScreen = Math.min(MAX_CATCH_UP, this.offScreen + dt);
      return;
    }
    this.mixer.update(dt + this.offScreen);
    this.offScreen = 0;
    this.countSteps();
    const lean = this.lean;
    const k = Math.min(1, dt * LEAN_RATE);
    lean.forward += (lean.wantForward - lean.forward) * k;
    lean.side += (lean.wantSide - lean.side) * k;
    this.model.rotation.set(lean.forward, 0, lean.side);
  }

  /** Metres a second the person has moved lately (smoothed; a jump to a new spot doesn't count). */
  private measure(dt: number): number {
    const at = this.root.position;
    if (this.placed && dt > 0) {
      const moved = at.distanceTo(this.last);
      const now = moved > TELEPORT ? 0 : moved / dt;
      this.measured += (now - this.measured) * Math.min(1, dt * SPEED_SMOOTHING);
    }
    this.last.copy(at);
    this.placed = true;
    return this.measured;
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
