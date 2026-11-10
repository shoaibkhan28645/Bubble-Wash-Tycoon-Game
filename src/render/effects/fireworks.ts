// Fireworks over Starlight Lake: rockets climb from the barge trailing
// sparks, then burst into a ball of coloured stars that drift down and fade.
// One pooled InstancedMesh, bright (unlit) so it glows against the evening.
import { Color, IcosahedronGeometry, InstancedMesh, MeshBasicMaterial, Object3D, Vector3, type Scene } from 'three';

const POOL = 420;
const COLOURS = ['#ff5fa8', '#ffd24a', '#5bbcff', '#7ee0c3', '#c9a7ff', '#ffffff', '#ff8a5c'].map((c) => new Color(c));
const TRAIL = new Color('#ffe9a8');
/** How hard the stars fall, and how fast the air slows them. */
const FALL = 2.6;
const DRAG = 1.3;

interface Spark {
  active: boolean;
  pos: Vector3;
  vel: Vector3;
  age: number;
  life: number;
  size: number;
  color: Color;
  /** A rocket on its way up: it bursts when its fuse runs out. */
  rocket: boolean;
  fuse: number;
  burst: Color;
}

export class Fireworks {
  private readonly mesh: InstancedMesh;
  private readonly sparks: Spark[] = [];
  private readonly dummy = new Object3D();
  /** A rocket burst (where), for a bang. */
  onBurst: ((at: Vector3) => void) | null = null;

  constructor(
    scene: Scene,
    /** Stars in each burst. */
    private readonly stars = 34,
  ) {
    this.mesh = new InstancedMesh(new IcosahedronGeometry(0.22, 0), new MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false }), POOL);
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'fx:fireworks';
    for (let i = 0; i < POOL; i++) this.mesh.setColorAt(i, TRAIL);
    scene.add(this.mesh);
    for (let i = 0; i < POOL; i++) {
      this.sparks.push({ active: false, pos: new Vector3(), vel: new Vector3(), age: 0, life: 1, size: 1, color: TRAIL, rocket: false, fuse: 0, burst: TRAIL });
    }
  }

  /** A rocket from `from`, bursting about `height` metres up. */
  launch(from: Vector3, height: number): void {
    const rocket = this.take();
    if (!rocket) return;
    const climb = 13 + Math.random() * 3;
    rocket.rocket = true;
    rocket.pos.copy(from);
    rocket.vel.set((Math.random() - 0.5) * 2.4, climb, (Math.random() - 0.5) * 1.6);
    rocket.fuse = height / climb;
    rocket.life = rocket.fuse + 1;
    rocket.size = 1.2;
    rocket.color = TRAIL;
    rocket.burst = COLOURS[Math.floor(Math.random() * COLOURS.length)]!;
  }

  update(dt: number): void {
    let n = 0;
    for (const s of this.sparks) {
      if (!s.active) continue;
      s.age += dt;
      if (s.rocket) {
        s.pos.addScaledVector(s.vel, dt);
        // A spark or two left behind on the way up.
        if (Math.random() < 0.6) this.spark(s.pos, new Vector3((Math.random() - 0.5) * 0.6, -1, (Math.random() - 0.5) * 0.6), TRAIL, 0.35, 0.45);
        if (s.age >= s.fuse) {
          s.active = false;
          this.burst(s.pos, s.burst);
          continue;
        }
      } else {
        if (s.age >= s.life) {
          s.active = false;
          continue;
        }
        s.vel.y -= FALL * dt;
        s.vel.multiplyScalar(Math.max(0, 1 - DRAG * dt));
        s.pos.addScaledVector(s.vel, dt);
      }
      const t = s.age / s.life;
      // The stars twinkle as they fade.
      const scale = s.rocket ? s.size : s.size * (1 - t * t) * (0.75 + 0.25 * Math.sin(s.age * 30 + s.pos.x));
      this.dummy.position.copy(s.pos);
      this.dummy.scale.setScalar(Math.max(0.001, scale));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(n, this.dummy.matrix);
      this.mesh.setColorAt(n, s.color);
      n++;
    }
    if (n === 0 && this.mesh.count === 0) return;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.visible = n > 0;
  }

  /** A ball of stars, each flying out its own way; a ring of white ones in a second colour now and then. */
  private burst(at: Vector3, color: Color): void {
    const second = Math.random() < 0.4 ? COLOURS[Math.floor(Math.random() * COLOURS.length)]! : color;
    // A bright flash at the middle as it goes off.
    this.spark(at, new Vector3(), color, 0.22, 5);
    for (let i = 0; i < this.stars; i++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const speed = 5.5 + Math.random() * 1.5;
      this.spark(at, new Vector3(r * Math.cos(a) * speed, u * speed + 1, r * Math.sin(a) * speed), i % 3 === 0 ? second : color, 1.3 + Math.random() * 0.7, 1.25);
    }
    this.onBurst?.(at);
  }

  private spark(at: Vector3, vel: Vector3, color: Color, life: number, size: number): void {
    const s = this.take();
    if (!s) return;
    s.rocket = false;
    s.pos.copy(at);
    s.vel.copy(vel);
    s.life = life;
    s.size = size;
    s.color = color;
  }

  private take(): Spark | null {
    const s = this.sparks.find((p) => !p.active);
    if (!s) return null;
    s.active = true;
    s.age = 0;
    return s;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
  }
}
