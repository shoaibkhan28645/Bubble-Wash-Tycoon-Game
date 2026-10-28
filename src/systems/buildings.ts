import { Group, type Object3D, type Scene } from 'three';
import type { LocationLayout, Rect } from '../core/config';
import { bayModel } from '../render/models/bay';
import { benchModel, dryerModel, hoseModel, registerModel, shelfModel, waxModel } from '../render/models/props';
import { withShadows } from '../render/stage';
import { garageModel, signModel, TunnelModel, truckModel, vendingModel } from '../render/models/bigProps';

const REVEAL_SECONDS = 0.45;

/** Footprints (half width, half depth) of props the player can't walk through. */
export const SOLID: Record<string, [number, number]> = {
  hose: [0.45, 0.45],
  register: [1, 0.45],
  soap: [1.1, 0.4],
  bench: [1.1, 0.35],
  vending: [0.65, 0.45],
  sign: [1.3, 0.35],
  tunnel: [1.8, 4.2],
  truck: [2.2, 1.1],
};

interface Building {
  id: string;
  mesh: Object3D;
  age: number;
}

/** The things unlock pads build, with a springy pop-in when they appear. */
export class Buildings {
  private readonly built: Building[] = [];
  private readonly solids: Rect[] = [];
  /** The brush tunnel, once built (its brushes animate). */
  tunnel: TunnelModel | null = null;

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
    this.scene.add(withShadows(mesh));
    this.built.push({ id, mesh, age: animate ? 0 : REVEAL_SECONDS });
    if (!animate) mesh.scale.setScalar(1);
    const solid = SOLID[id];
    if (solid) this.solids.push({ minX: at.x - solid[0], maxX: at.x + solid[0], minZ: at.z - solid[1], maxZ: at.z + solid[1] });
  }

  obstacles(): readonly Rect[] {
    return this.solids;
  }

  /** `tunnelBusy`: a car is in the tunnel, so the brushes spin fast. */
  update(dt: number, tunnelBusy = false): void {
    this.tunnel?.update(dt, tunnelBusy);
    for (const b of this.built) {
      if (b.age >= REVEAL_SECONDS) continue;
      b.age = Math.min(REVEAL_SECONDS, b.age + dt);
      b.mesh.scale.setScalar(easeOutBack(b.age / REVEAL_SECONDS));
    }
  }

  private model(id: string): Object3D | null {
    if (id.startsWith('bay')) return bayModel(this.layout.bay.width, this.layout.bay.length, `BAY ${id.slice(3)}`);
    if (id === 'hose') return hoseModel();
    if (id === 'register') return registerModel();
    if (id === 'soap') return shelfModel();
    if (id === 'bench') return benchModel();
    const { width, length } = this.layout.station;
    if (id === 'dryer') return dryerModel(width, length);
    if (id === 'wax') return waxModel(width, length);
    if (id === 'vending') return vendingModel();
    if (id === 'sign') return signModel();
    if (id === 'garage') return garageModel(this.layout.garage.width, this.layout.garage.length);
    if (id === 'tunnel') {
      this.tunnel = new TunnelModel(this.layout.tunnel.width, this.layout.tunnel.length);
      return this.tunnel.root;
    }
    if (id === 'truck') {
      // Wrapped so the pop-in animation doesn't overwrite the truck's own scale.
      const group = new Group();
      group.add(truckModel());
      return group;
    }
    return null;
  }
}

function easeOutBack(t: number): number {
  const c = 1.9;
  const u = t - 1;
  return Math.max(0.001, 1 + (c + 1) * u * u * u + c * u * u);
}
