import { BoxGeometry, InstancedMesh, MeshLambertMaterial, Object3D, Vector3, type Scene } from 'three';
import type { GameState } from '../core/gameState';
import type { LocationLayout, Point, Tuning } from '../core/config';
import type { Particles } from '../render/effects/particles';
import type { SoundManager } from '../audio/sound';
import { blobShadow } from '../render/models/actors';

const MAX_BILLS = 32;
const COLUMNS = [
  [-0.24, -0.15],
  [0.24, -0.15],
  [-0.24, 0.15],
  [0.24, 0.15],
] as const;

const billGeometry = new BoxGeometry(0.44, 0.1, 0.26);
const billMaterial = new MeshLambertMaterial({ color: 0x5cc45c });

interface Pile {
  id: string;
  at: Point;
  mesh: InstancedMesh;
  shown: number;
}

/**
 * Physical cash piles. Washes drop money on a pile (capped until a cashier
 * is hired); walking over a pile vacuums it into the player's cash.
 */
export class CashSystem {
  private readonly piles = new Map<string, Pile>();
  private readonly dummy = new Object3D();

  constructor(
    private readonly scene: Scene,
    private readonly layout: LocationLayout,
    private readonly tuning: Tuning['cash'],
    private readonly state: GameState,
    private readonly effects: Particles,
    private readonly sound: SoundManager,
  ) {
    for (const id of Object.keys(state.piles)) this.refresh(this.pile(id));
  }

  /** Adds pay to a pile; anything over the cap is lost (the pile looks full). */
  add(pileId: string, amount: number): void {
    const current = this.state.piles[pileId] ?? 0;
    this.state.piles[pileId] = Math.min(this.tuning.pileCap, current + amount);
    this.refresh(this.pile(pileId));
  }

  update(player: Point): void {
    for (const pile of this.piles.values()) {
      const amount = this.state.piles[pile.id] ?? 0;
      if (amount <= 0) continue;
      if (Math.hypot(player.x - pile.at.x, player.z - pile.at.z) > this.tuning.collectRadius) continue;
      this.state.cash += amount;
      delete this.state.piles[pile.id];
      const from = new Vector3(pile.at.x, 0.4, pile.at.z);
      const to = new Vector3(player.x, 1.2, player.z);
      for (let i = 0; i < Math.min(8, pile.shown); i++) {
        from.y = 0.2 + i * 0.1;
        this.effects.fly('bill', from, to, 0.25 + i * 0.03);
      }
      this.sound.play('coin');
      this.refresh(pile);
    }
  }

  private pile(id: string): Pile {
    let pile = this.piles.get(id);
    if (pile) return pile;
    const at = this.layout.piles[id] ?? { x: 0, z: 0 };
    const mesh = new InstancedMesh(billGeometry, billMaterial, MAX_BILLS);
    mesh.position.set(at.x, 0, at.z);
    mesh.count = 0;
    mesh.add(blobShadow(1.3, 1));
    this.scene.add(mesh);
    pile = { id, at, mesh, shown: 0 };
    this.piles.set(id, pile);
    return pile;
  }

  private refresh(pile: Pile): void {
    const amount = this.state.piles[pile.id] ?? 0;
    const bills = amount <= 0 ? 0 : Math.max(1, Math.ceil((amount / this.tuning.pileCap) * MAX_BILLS));
    for (let i = pile.shown; i < bills; i++) {
      const [x, z] = COLUMNS[i % COLUMNS.length]!;
      this.dummy.position.set(x, 0.05 + Math.floor(i / COLUMNS.length) * 0.11, z);
      this.dummy.rotation.set(0, Math.sin(i * 12.9898) * 0.25, 0);
      this.dummy.updateMatrix();
      pile.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    pile.mesh.count = bills;
    pile.mesh.instanceMatrix.needsUpdate = true;
    pile.mesh.children[0]!.visible = bills > 0;
    pile.shown = bills;
  }
}
