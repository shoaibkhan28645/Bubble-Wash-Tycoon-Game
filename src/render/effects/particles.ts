import {
  BoxGeometry,
  BufferGeometry,
  Color,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  OctahedronGeometry,
  Scene,
  SphereGeometry,
  Vector3,
} from 'three';

export type ParticleKind = 'sparkle' | 'bubble' | 'bill';

interface Particle {
  active: boolean;
  /** Ballistic (velocity + gravity) or fly (arc from → to). */
  fly: boolean;
  pos: Vector3;
  vel: Vector3;
  from: Vector3;
  to: Vector3;
  age: number;
  life: number;
  size: number;
  spin: number;
}

const GRAVITY: Record<ParticleKind, number> = { sparkle: -9, bubble: 1.2, bill: -12 };
const POOL = 96;

/** Pooled particles drawn as one InstancedMesh per kind. */
export class Particles {
  private readonly pools = new Map<ParticleKind, { mesh: InstancedMesh; items: Particle[] }>();
  private readonly dummy = new Object3D();

  constructor(scene: Scene) {
    this.addKind(scene, 'sparkle', new OctahedronGeometry(0.14), new MeshBasicMaterial({ color: 0xfff6b0 }));
    this.addKind(scene, 'bubble', new SphereGeometry(0.16, 8, 6), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
    this.addKind(scene, 'bill', new BoxGeometry(0.42, 0.06, 0.24), new MeshBasicMaterial({ color: 0x5cc45c }));
  }

  /** Particles flung outward from a point. */
  burst(kind: ParticleKind, at: Vector3, count: number, speed = 4, spread = 0.4): void {
    for (let i = 0; i < count; i++) {
      const p = this.take(kind);
      if (!p) return;
      p.fly = false;
      p.pos.set(at.x + (Math.random() - 0.5) * spread, at.y, at.z + (Math.random() - 0.5) * spread);
      const angle = Math.random() * Math.PI * 2;
      const out = speed * (0.3 + Math.random() * 0.7);
      p.vel.set(Math.cos(angle) * out, speed * (0.6 + Math.random() * 0.8), Math.sin(angle) * out);
      p.life = kind === 'bubble' ? 0.9 + Math.random() * 0.6 : 0.6 + Math.random() * 0.4;
      p.size = kind === 'bubble' ? 0.6 + Math.random() * 0.9 : 0.7 + Math.random() * 0.6;
    }
  }

  /** One particle arcing from a point to another (coins into a pad, bills to the player). */
  fly(kind: ParticleKind, from: Vector3, to: Vector3, duration = 0.45): void {
    const p = this.take(kind);
    if (!p) return;
    p.fly = true;
    p.from.copy(from);
    p.to.copy(to);
    p.pos.copy(from);
    p.life = duration;
    p.size = 1;
  }

  update(dt: number): void {
    for (const [kind, pool] of this.pools) {
      let n = 0;
      for (const p of pool.items) {
        if (!p.active) continue;
        p.age += dt;
        if (p.age >= p.life) {
          p.active = false;
          continue;
        }
        const t = p.age / p.life;
        if (p.fly) {
          p.pos.lerpVectors(p.from, p.to, t);
          p.pos.y += Math.sin(t * Math.PI) * 1.2;
        } else {
          p.vel.y += GRAVITY[kind] * dt;
          if (kind === 'bubble') p.vel.multiplyScalar(1 - dt * 2.5);
          p.pos.addScaledVector(p.vel, dt);
        }
        const scale = p.size * (p.fly ? 1 : 1 - t * t);
        this.dummy.position.copy(p.pos);
        this.dummy.rotation.set(p.spin * p.age, p.spin * p.age * 0.7, 0);
        this.dummy.scale.setScalar(Math.max(0.001, scale));
        this.dummy.updateMatrix();
        pool.mesh.setMatrixAt(n++, this.dummy.matrix);
      }
      pool.mesh.count = n;
      pool.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private addKind(scene: Scene, kind: ParticleKind, geometry: BufferGeometry, material: MeshBasicMaterial): void {
    const mesh = new InstancedMesh(geometry, material, POOL);
    mesh.count = 0;
    mesh.frustumCulled = false;
    if (kind === 'sparkle') {
      const tints = [0xfff6b0, 0xffffff, 0xffd85c, 0xbfe9ff];
      for (let i = 0; i < POOL; i++) mesh.setColorAt(i, new Color(tints[i % tints.length]));
    }
    scene.add(mesh);
    const items = Array.from({ length: POOL }, () => ({
      active: false,
      fly: false,
      pos: new Vector3(),
      vel: new Vector3(),
      from: new Vector3(),
      to: new Vector3(),
      age: 0,
      life: 1,
      size: 1,
      spin: 0,
    }));
    this.pools.set(kind, { mesh, items });
  }

  private take(kind: ParticleKind): Particle | null {
    const p = this.pools.get(kind)?.items.find((item) => !item.active);
    if (!p) return null;
    p.active = true;
    p.age = 0;
    p.spin = (Math.random() - 0.5) * 12;
    return p;
  }
}
