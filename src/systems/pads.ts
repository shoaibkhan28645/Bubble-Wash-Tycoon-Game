import { Vector3, type Scene } from 'three';
import { PADS, type LocationLayout, type PadDef, type Point, type Rect, type Tuning } from '../core/config';
import type { GameState } from '../core/gameState';
import type { Particles } from '../render/effects/particles';
import type { SoundManager } from '../audio/sound';
import { PadModel } from '../render/models/padModel';
import type { Label, WorldLabels } from '../ui/worldLabels';
import { formatCash, padDrain } from './economy';

const COIN_SECONDS = 0.07;
/** GDD minute 10: the big tunnel pad is shown early, locked, as the next big goal (once the dryer exists). */
const PREVIEW = { pad: 'tunnel', after: 'dryer' };
const DRAIN_SOUND_SECONDS = 0.09;

interface ActivePad {
  def: PadDef;
  at: Point;
  model: PadModel;
  label: Label;
  price: HTMLElement;
}

/**
 * Unlock pads, shown one at a time in the GDD's order. Standing on the pad
 * drains cash into it; partial payments are kept (and saved).
 */
export class PadSystem {
  private current: ActivePad | null = null;
  private preview: { model: PadModel; label: Label } | null = null;
  private waitTimer = 0;
  private coinTimer = 0;
  private soundTimer = 0;

  constructor(
    private readonly scene: Scene,
    private readonly layout: LocationLayout,
    private readonly tuning: Tuning['pads'],
    private readonly state: GameState,
    private readonly effects: Particles,
    private readonly sound: SoundManager,
    private readonly labels: WorldLabels,
    private readonly onBuilt: (id: string) => void,
  ) {}

  /** The pad on show now, for the camera to keep in view. */
  get footprint(): Rect | null {
    if (!this.current) return null;
    const { x, z } = this.current.at;
    return { minX: x - 1.5, maxX: x + 1.5, minZ: z - 1.5, maxZ: z + 1.5 };
  }

  /** The pad being paid for now, and what's still owed (for the tutorial hand). */
  get next(): { at: Point; owed: number } | null {
    if (!this.current) return null;
    return { at: this.current.at, owed: this.current.def.cost - (this.state.padPaid[this.current.def.id] ?? 0) };
  }

  /** Next pad in order that isn't built and has a place on this lot. */
  private nextPad(): PadDef | undefined {
    return PADS.find((pad) => !this.state.unlocked.includes(pad.id) && this.layout.pads[pad.id]);
  }

  update(dt: number, player: Point): void {
    this.updatePreview(dt);
    if (!this.current) {
      this.waitTimer -= dt;
      // GDD 0:40: the first pad glows only after the first car's cash is collected.
      const firstPadWaits = this.state.unlocked.length === 1 && !this.state.flags.includes('collected');
      if (this.waitTimer <= 0 && !firstPadWaits) this.showNext();
      return;
    }
    const pad = this.current;
    const paid = this.state.padPaid[pad.def.id] ?? 0;
    const standing = Math.abs(player.x - pad.at.x) < this.tuning.radius && Math.abs(player.z - pad.at.z) < this.tuning.radius;
    pad.model.update(dt, standing);
    if (!standing) return;

    const amount = padDrain(pad.def.cost, paid, this.state.cash, dt, this.tuning);
    if (amount > 0) {
      this.state.cash -= amount;
      this.state.padPaid[pad.def.id] = paid + amount;
      this.refresh();
      this.feedback(dt, player, pad.at);
    }
    if (paid + amount >= pad.def.cost) this.build();
  }

  /** Shows the locked tunnel pad as a goal until it's the next one to buy. */
  private updatePreview(dt: number): void {
    const def = PADS.find((p) => p.id === PREVIEW.pad);
    const at = this.layout.pads[PREVIEW.pad];
    const want =
      !!def &&
      !!at &&
      this.state.unlocked.includes(PREVIEW.after) &&
      !this.state.unlocked.includes(PREVIEW.pad) &&
      this.current?.def.id !== PREVIEW.pad;
    if (want && !this.preview && def && at) {
      const model = new PadModel(2.3, 0x9aa3ad);
      model.group.position.set(at.x, 0, at.z);
      this.scene.add(model.group);
      const el = document.createElement('div');
      el.className = 'pad-label pad-locked';
      const price = document.createElement('span');
      price.className = 'pad-price';
      price.textContent = `🔒 ${formatCash(def.cost)}`;
      const name = document.createElement('span');
      name.className = 'pad-name';
      name.textContent = def.name;
      el.append(price, name);
      this.preview = { model, label: this.labels.add(el, new Vector3(at.x, 0.2, at.z + 1.6)) };
    } else if (!want && this.preview) {
      this.scene.remove(this.preview.model.group);
      this.preview.model.dispose();
      this.labels.remove(this.preview.label);
      this.preview = null;
    }
    this.preview?.model.update(dt, false);
  }

  private showNext(): void {
    const def = this.nextPad();
    if (!def) return;
    const at = this.layout.pads[def.id]!;
    if (def.cost <= 0) {
      this.current = null;
      this.complete(def, at);
      return;
    }
    const model = new PadModel();
    model.group.position.set(at.x, 0, at.z);
    this.scene.add(model.group);
    const price = document.createElement('div');
    price.className = 'pad-label';
    const amount = document.createElement('span');
    amount.className = 'pad-price';
    const name = document.createElement('span');
    name.className = 'pad-name';
    name.textContent = def.name;
    price.append(amount, name);
    const label = this.labels.add(price, new Vector3(at.x, 0.2, at.z + 1.6));
    this.current = { def, at, model, label, price };
    this.refresh();
  }

  private refresh(): void {
    const pad = this.current;
    if (!pad) return;
    const paid = this.state.padPaid[pad.def.id] ?? 0;
    pad.model.setProgress(paid / pad.def.cost);
    pad.price.querySelector('.pad-price')!.textContent = formatCash(Math.ceil(pad.def.cost - paid));
  }

  private feedback(dt: number, player: Point, at: Point): void {
    this.coinTimer -= dt;
    if (this.coinTimer <= 0) {
      this.effects.fly('bill', new Vector3(player.x, 1.2, player.z), new Vector3(at.x, 0.1, at.z), 0.3);
      this.coinTimer = COIN_SECONDS;
    }
    this.soundTimer -= dt;
    if (this.soundTimer <= 0) {
      this.sound.play('drain');
      this.soundTimer = DRAIN_SOUND_SECONDS;
    }
  }

  private build(): void {
    const pad = this.current;
    if (!pad) return;
    this.scene.remove(pad.model.group);
    pad.model.dispose();
    this.labels.remove(pad.label);
    this.current = null;
    this.complete(pad.def, pad.at);
  }

  private complete(def: PadDef, at: Point): void {
    this.state.unlocked.push(def.id);
    delete this.state.padPaid[def.id];
    if (def.cost > 0) {
      this.effects.burst('sparkle', new Vector3(at.x, 0.5, at.z), 28, 6, 1.5);
      this.sound.play('build');
    }
    this.waitTimer = this.tuning.revealDelay;
    this.onBuilt(def.id);
  }
}
