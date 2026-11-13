// A cow's model, posed: puts each joint where the cow's motion says
// (systems/cows.ts). The model names its joints (art/blender/farm.py, cow()):
// <model>_neck with <model>_head on it (and on that the jaw, eyes and ears),
// <model>_leg_* each with a <model>_shin_* at the knee, <model>_tail with
// <model>_tail_tip, and <model>_mesh, the body (which swells as she breathes).
import type { Object3D } from 'three';
import type { CowPose } from '../../systems/cows';

const LEGS = ['fl', 'fr', 'bl', 'br'];

export class CowRig {
  private readonly legs: { thigh: Object3D; shin: Object3D }[];
  private readonly neck?: Object3D;
  private readonly head?: Object3D;
  private readonly jaw?: Object3D;
  private readonly eyes?: Object3D;
  private readonly ears: (Object3D | undefined)[];
  private readonly tail?: Object3D;
  private readonly tip?: Object3D;
  private readonly body?: Object3D;
  private readonly jawX: number;

  constructor(
    readonly model: Object3D,
    name: string,
  ) {
    const part = (id: string) => model.getObjectByName(`${name}_${id}`) ?? undefined;
    // Turned first, then tipped and rolled about her own axes.
    model.rotation.order = 'YXZ';
    this.legs = LEGS.flatMap((leg) => {
      const thigh = part(`leg_${leg}`);
      const shin = part(`shin_${leg}`);
      if (!thigh || !shin) return [];
      // Out to the side at the hip first, then swung.
      thigh.rotation.order = 'ZXY';
      return [{ thigh, shin }];
    });
    this.neck = part('neck');
    this.head = part('head');
    this.jaw = part('jaw');
    this.eyes = part('eyes');
    this.ears = [part('ear_l'), part('ear_r')];
    this.tail = part('tail');
    this.tip = part('tail_tip');
    this.body = part('mesh');
    for (const joint of [this.neck, this.head]) if (joint) joint.rotation.order = 'YXZ';
    this.jawX = this.jaw?.position.x ?? 0;
  }

  apply(pose: CowPose): void {
    const { model } = this;
    model.position.set(pose.x, pose.y, pose.z);
    model.rotation.set(pose.pitch, pose.heading, pose.roll);
    this.legs.forEach(({ thigh, shin }, i) => {
      const leg = pose.legs[i]!;
      thigh.rotation.z = leg.abduct;
      thigh.rotation.x = leg.hip;
      shin.rotation.x = leg.knee;
    });
    this.neck?.rotation.set(pose.neckPitch, pose.neckYaw, 0);
    this.head?.rotation.set(pose.headPitch, pose.headYaw, pose.headRoll);
    if (this.jaw) {
      this.jaw.rotation.x = pose.jawOpen;
      this.jaw.position.x = this.jawX + pose.jawSlide;
    }
    // Lids: her eyes close from top and bottom.
    if (this.eyes) this.eyes.scale.y = 1 - 0.92 * pose.blink;
    this.ears.forEach((ear, i) => {
      if (!ear) return;
      // The left ear lies out to her left (-x in the model): down is the other way round for each.
      const side = i === 0 ? 1 : -1;
      ear.rotation.z = side * pose.ears[i]!;
      ear.rotation.y = side * pose.earsTurn;
    });
    if (this.tail) {
      this.tail.rotation.z = pose.tail;
      this.tail.rotation.x = pose.tailLift;
    }
    if (this.tip) this.tip.rotation.z = pose.tailTip;
    if (this.body) this.body.scale.set(1 + 0.014 * pose.breath, 1 + 0.006 * pose.breath, 1);
  }
}
