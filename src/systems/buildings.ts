import { Group, type Object3D, type Scene } from 'three';
import type { LocationLayout, Rect } from '../core/config';
import { benchModel, hoseModel, registerModel, shelfModel, signModel, truckModel, vendingModel } from '../render/models/props';
import { dispenserModel, forecourtModel, laneSide } from '../render/models/fuel';
import { martModel, MART_TILL_Z } from '../render/models/mart';
import { dryerModel, garageModel, waxModel } from '../render/models/stations';
import { washBayModel } from '../render/models/washBay';
import { TunnelModel } from '../render/models/tunnel';
import { withShadows } from '../render/stage';

const REVEAL_SECONDS = 0.45;

/**
 * What the player can't walk through, per building: boxes of half width,
 * half depth and an offset from where it's built (the Mini-Mart is the shop
 * and its till out front).
 */
export const SOLID: Record<string, [number, number, number?, number?][]> = {
  hose: [[0.45, 0.45]],
  register: [[1, 0.45]],
  soap: [[1.1, 0.4]],
  bench: [[1.1, 0.35]],
  vending: [[0.65, 0.45]],
  sign: [[0.35, 0.35]],
  // The tunnel, its water tank and its control box.
  tunnel: [
    [2.1, 4.3],
    [0.5, 0.5, 2.62, 2.6],
    [0.3, 0.45, -2.42, -1.6],
  ],
  truck: [[2.2, 1.1]],
  pump1: [[1.7, 0.5]],
  mart: [
    [2.45, 1.85],
    [1.15, 0.35, 0, MART_TILL_Z],
  ],
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
    const at = this.layout.buildAt[id] ?? this.layout.pads[id];
    if (!mesh || !at) return;
    mesh.position.set(at.x, 0, at.z);
    mesh.name = `building:${id}`;
    this.scene.add(withShadows(mesh));
    this.built.push({ id, mesh, age: animate ? 0 : REVEAL_SECONDS });
    if (!animate) mesh.scale.setScalar(1);
    for (const [hw, hd, dx = 0, dz = 0] of SOLID[id] ?? []) {
      this.solids.push({ minX: at.x + dx - hw, maxX: at.x + dx + hw, minZ: at.z + dz - hd, maxZ: at.z + dz + hd });
    }
  }

  obstacles(): readonly Rect[] {
    return this.solids;
  }

  /** `tunnelBusy`: a car is in the tunnel, so the brushes spin fast. Returns true while a building is popping in. */
  update(dt: number, tunnelBusy = false): boolean {
    this.tunnel?.update(dt, tunnelBusy);
    let growing = false;
    for (const b of this.built) {
      if (b.age >= REVEAL_SECONDS) continue;
      b.age = Math.min(REVEAL_SECONDS, b.age + dt);
      b.mesh.scale.setScalar(easeOutBack(b.age / REVEAL_SECONDS));
      growing = true;
    }
    return growing;
  }

  private model(id: string): Object3D | null {
    if (id.startsWith('bay')) return washBayModel(`BAY ${id.slice(3)}`);
    if (id === 'hose') return hoseModel();
    if (id === 'register') return registerModel();
    if (id === 'soap') return shelfModel();
    if (id === 'bench') return benchModel();
    if (id === 'pump1') return forecourtModel(this.layout, id);
    if (id === 'pump2') return dispenserModel(laneSide(this.layout, id));
    if (id === 'mart') return martModel();
    const { width, length } = this.layout.station;
    if (id === 'dryer') return dryerModel(width, length);
    if (id === 'wax') return waxModel(width, length);
    if (id === 'vending') return vendingModel();
    if (id === 'sign') return signModel();
    if (id === 'garage') return garageModel(this.layout.garage.width, this.layout.garage.length);
    if (id === 'tunnel') {
      this.tunnel = new TunnelModel();
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
