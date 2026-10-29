import { Group, type Object3D, type Scene } from 'three';
import type { LocationLayout, Rect } from '../core/config';
import { benchModel, hoseModel, registerModel, shelfModel, signModel, truckModel, vendingModel } from '../render/models/props';
import { dispenserModel, forecourtModel, laneSide } from '../render/models/fuel';
import { martModel, MART_TILL_Z } from '../render/models/mart';
import { DryerModel } from '../render/models/dryer';
import { detailingModel } from '../render/models/detailing';
import { WaxModel } from '../render/models/wax';
import { washBayModel } from '../render/models/washBay';
import { TunnelModel } from '../render/models/tunnel';
import { withShadows } from '../render/stage';

const REVEAL_SECONDS = 0.45;

/** A wash bay's walls (art/blender/wash_bay.py, in the game's axes). */
const BAY_WALLS: [number, number, number?, number?][] = [
  [0.2, 2.48, -2.0, 0.1],
  [0.2, 2.48, 2.0, 0.1],
  [0.22, 0.42, -1.95, 1.55],
];

/**
 * What the player can't walk through, per building: boxes of half width,
 * half depth and an offset from where it's built (the Mini-Mart is the shop
 * and its till out front).
 */
export const SOLID: Record<string, [number, number, number?, number?][]> = {
  // Hand wash bays: the two side walls (cars and people go in and out at the ends) and the coin panel.
  bay1: BAY_WALLS,
  bay2: BAY_WALLS,
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
  // The pump island and the price sign by the road.
  // The dryer's blower towers, its towel rack and laundry basket.
  dryer: [
    [0.38, 0.85, -1.95, 0],
    [0.38, 0.85, 1.95, 0],
    [0.25, 0.4, -2.65, 1.25],
    [0.27, 0.27, -2.65, 0.35],
  ],
  // The wax station's towers and its cart.
  wax: [
    [0.36, 0.66, -1.95, 0],
    [0.36, 0.66, 1.95, 0],
    [0.32, 0.42, -2.6, 1.2],
  ],
  // The detailing garage's walls, and its tool chest, tyre stack and vacuum outside.
  garage: [
    [0.14, 2.05, -2.0, 0],
    [0.14, 2.05, 2.0, 0],
    [0.27, 0.42, -2.55, -0.5],
    [0.4, 0.4, -2.55, 1.3],
    [0.3, 0.3, 2.55, 1.3],
  ],
  pump1: [
    [1.7, 0.5],
    [0.35, 0.25, -5.9, 4.6],
  ],
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
  /** The dryer, once built (its fan spins). */
  dryer: DryerModel | null = null;
  /** The wax station, once built (its pads spin). */
  wax: WaxModel | null = null;

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

  /**
   * `busy`: a car in the tunnel (its brushes spin fast), at the dryer (its
   * fan blasts), at the wax station (its pads buff). Returns true while a
   * building is popping in.
   */
  update(dt: number, busy: { tunnel: boolean; dryer: boolean; wax: boolean } = { tunnel: false, dryer: false, wax: false }): boolean {
    this.tunnel?.update(dt, busy.tunnel);
    this.dryer?.update(dt, busy.dryer);
    this.wax?.update(dt, busy.wax);
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
    if (id === 'dryer') {
      this.dryer = new DryerModel();
      return this.dryer.root;
    }
    if (id === 'wax') {
      this.wax = new WaxModel();
      return this.wax.root;
    }
    if (id === 'vending') return vendingModel();
    if (id === 'sign') return signModel();
    if (id === 'garage') return detailingModel();
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
