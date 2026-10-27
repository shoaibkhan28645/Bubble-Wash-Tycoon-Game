import type { Mesh, Scene } from 'three';
import type { LocationLayout, Rect } from '../core/config';
import { bayModel, hoseModel, registerModel, shelfModel } from '../render/models/props';

const REVEAL_SECONDS = 0.45;

/** Footprints (half width, half depth) of props the player can't walk through. */
const SOLID: Record<string, [number, number]> = {
  hose: [0.45, 0.45],
  register: [1, 0.45],
  soap: [1.1, 0.4],
};

interface Building {
  id: string;
  mesh: Mesh;
  age: number;
}

/** The things unlock pads build, with a springy pop-in when they appear. */
export class Buildings {
  private readonly built: Building[] = [];
  private readonly solids: Rect[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly layout: LocationLayout,
  ) {}

  /** Shows the model for a pad id (no-op for pads without a model, e.g. staff). */
  show(id: string, animate: boolean): void {
    const mesh = this.model(id);
    const at = this.layout.pads[id];
    if (!mesh || !at) return;
    mesh.position.set(at.x, 0, at.z);
    this.scene.add(mesh);
    this.built.push({ id, mesh, age: animate ? 0 : REVEAL_SECONDS });
    if (!animate) mesh.scale.setScalar(1);
    const solid = SOLID[id];
    if (solid) this.solids.push({ minX: at.x - solid[0], maxX: at.x + solid[0], minZ: at.z - solid[1], maxZ: at.z + solid[1] });
  }

  obstacles(): readonly Rect[] {
    return this.solids;
  }

  update(dt: number): void {
    for (const b of this.built) {
      if (b.age >= REVEAL_SECONDS) continue;
      b.age = Math.min(REVEAL_SECONDS, b.age + dt);
      b.mesh.scale.setScalar(easeOutBack(b.age / REVEAL_SECONDS));
    }
  }

  private model(id: string): Mesh | null {
    if (id.startsWith('bay')) return bayModel(this.layout.bay.width, this.layout.bay.length);
    if (id === 'hose') return hoseModel();
    if (id === 'register') return registerModel();
    if (id === 'soap') return shelfModel();
    return null;
  }
}

function easeOutBack(t: number): number {
  const c = 1.9;
  const u = t - 1;
  return Math.max(0.001, 1 + (c + 1) * u * u * u + c * u * u);
}
