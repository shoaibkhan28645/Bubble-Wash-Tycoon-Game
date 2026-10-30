import { Vector3, type Scene } from 'three';
import { PADS, TUNING, UPGRADES, type LocationLayout, type Point, type Rect } from '../core/config';
import type { GameState } from '../core/gameState';
import type { SoundManager } from '../audio/sound';
import type { Particles } from '../render/effects/particles';
import { PadModel } from '../render/models/padModel';
import type { UpgradePanel, UpgradeRow } from '../ui/upgradePanel';
import type { WorldLabels } from '../ui/worldLabels';
import { upgradeCost } from './economy';

const TITLES: Record<string, string> = {
  bay1: 'Hand wash bay 1',
  bay2: 'Hand wash bay 2',
  pump1: 'Fuel pumps',
  dryer: 'Dryer station',
  wax: 'Waxing station',
  soap: 'Supply shelf',
  staffRoom: 'Staff room',
  tunnel: 'Brush tunnel',
  garage: 'Detailing garage',
  mart: 'Mini-Mart',
};
/** Staff targets get their role in front of the upgrade name; the pumps (one panel for both) their number. */
const STAFF_NAMES: Record<string, string> = {
  washer: 'Washer',
  runner: 'Runner',
  dryerStaff: 'Dryer',
  attendant: 'Attendant',
  pump1: 'Pump 1',
  pump2: 'Pump 2',
};
/** The staff room opens once the register is built (minute 2). */
const STAFF_ROOM_AFTER = 'register';

/** Cost of the next level of an upgrade key like "bay1.speed". */
export function costOf(key: string, level: number): number {
  const [target, kind] = key.split('.') as [string, string];
  return upgradeCost(UPGRADES.kinds[kind]!, UPGRADES.costScale[target] ?? 1, level, UPGRADES.growth);
}

/**
 * Small upgrade pads beside each station (and the staff room). Standing on
 * one opens that station's upgrade pop-up.
 */
export class UpgradePads {
  private readonly pads = new Map<string, PadModel>();
  /** Pad the player is standing on; the pop-up only reopens after stepping off. */
  private standingOn: string | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly layout: LocationLayout,
    private readonly state: GameState,
    private readonly panel: UpgradePanel,
    private readonly labels: WorldLabels,
    private readonly sound: SoundManager,
    private readonly effects: Particles,
    private readonly onBought: () => void,
  ) {}

  /** Footprints of the visible upgrade pads, for the camera. */
  footprints(): Rect[] {
    return [...this.pads.keys()].map((id) => {
      const at = this.layout.upgradePads[id]!;
      return { minX: at.x - 1, maxX: at.x + 1, minZ: at.z - 1, maxZ: at.z + 1 };
    });
  }

  update(dt: number, player: Point): void {
    this.showAvailable();
    let on: string | null = null;
    for (const [id, pad] of this.pads) {
      const at = this.layout.upgradePads[id]!;
      const here = Math.abs(player.x - at.x) < TUNING.pads.upgradeRadius && Math.abs(player.z - at.z) < TUNING.pads.upgradeRadius;
      pad.update(dt, here);
      if (here) on = id;
    }
    if (on !== this.standingOn) {
      this.standingOn = on;
      if (on) this.panel.open(on, TITLES[on] ?? on, () => this.rows(on), () => this.state.cash);
      else this.panel.close();
    }
    this.panel.refresh();
  }

  /** Buys the next level if affordable. */
  buy(key: string): void {
    const [target, kind] = key.split('.') as [string, string];
    const def = UPGRADES.kinds[kind];
    const level = this.state.levels[key] ?? 0;
    if (!def || level >= def.max) return;
    const cost = costOf(key, level);
    if (this.state.cash < cost) return;
    this.state.cash -= cost;
    this.state.levels[key] = level + 1;
    this.sound.play('upgrade');
    const at = this.layout.upgradePads[this.panel.openId ?? ''] ?? this.layout.pads[target];
    if (at) this.effects.burst('sparkle', new Vector3(at.x, 0.6, at.z), 16, 4, 1);
    this.panel.refresh();
    this.onBought();
  }

  private rows(panelId: string): UpgradeRow[] {
    const keys = UPGRADES.panels[panelId] ?? [];
    return keys
      .filter((key) => this.targetExists(key.split('.')[0]!))
      .map((key) => {
        const [target, kind] = key.split('.') as [string, string];
        const def = UPGRADES.kinds[kind]!;
        const level = this.state.levels[key] ?? 0;
        const staff = STAFF_NAMES[target];
        return {
          key,
          title: staff ? `${staff}: ${def.name}` : def.name,
          effect: def.effect,
          level,
          max: def.max,
          cost: costOf(key, level),
        };
      });
  }

  private targetExists(target: string): boolean {
    return target === 'player' || this.state.unlocked.includes(target);
  }

  /** Shows a pad once its station is built (the staff room after the register), none until the second bay (one thing at a time). */
  private showAvailable(): void {
    if (!this.state.unlocked.includes(TUNING.onboarding.upgradesAfter)) return;
    for (const id of Object.keys(this.layout.upgradePads)) {
      if (this.pads.has(id)) continue;
      const needs = id === 'staffRoom' ? STAFF_ROOM_AFTER : id;
      if (!this.state.unlocked.includes(needs) || !PADS.some((p) => p.id === needs)) continue;
      const at = this.layout.upgradePads[id]!;
      const pad = new PadModel(1.5, 0x6cc4ff);
      pad.group.position.set(at.x, 0, at.z);
      this.scene.add(pad.group);
      const icon = document.createElement('div');
      icon.className = 'upgrade-icon';
      icon.textContent = id === 'staffRoom' ? '⬆ Staff room' : '⬆';
      this.labels.add(icon, new Vector3(at.x, 0.3, at.z + 1));
      this.pads.set(id, pad);
    }
  }
}
