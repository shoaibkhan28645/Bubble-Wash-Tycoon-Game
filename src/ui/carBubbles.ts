import { Vector3 } from 'three';
import { TUNING } from '../core/config';
import type { Car } from '../systems/cars';
import type { Label, WorldLabels } from './worldLabels';

const BUBBLE_HEIGHT = 2.6;

/** Mood from the share of patience left (GDD: happy, waiting, grumpy). */
export type Mood = 'happy' | 'waiting' | 'grumpy' | 'angry';
const FACES: Record<Mood, string> = { happy: '😊', waiting: '😐', grumpy: '😠', angry: '😡' };

/** Emoji bubble with a patience bar, floating over a car. */
export class CarBubble {
  readonly at = new Vector3();
  private readonly el: HTMLElement;
  private readonly face: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly label: Label;
  private shown = '';
  private fillShown = -1;

  constructor(labels: WorldLabels) {
    this.el = document.createElement('div');
    this.el.className = 'car-bubble';
    this.face = document.createElement('span');
    this.face.className = 'car-face';
    const bar = document.createElement('span');
    bar.className = 'patience-bar';
    this.fill = document.createElement('span');
    this.fill.className = 'patience-fill';
    bar.appendChild(this.fill);
    this.el.append(this.face, bar);
    this.label = labels.add(this.el, this.at);
    this.label.visible = false;
  }

  /** `badge`: a crown for the golden VIP, a star for the Car of the Day. */
  show(x: number, y: number, z: number, patienceLeft: number, mood: Mood, badge: '' | 'vip' | 'special' = ''): void {
    const vip = badge !== '';
    this.at.set(x, y, z);
    this.label.visible = true;
    const fill = Math.round(Math.max(0, Math.min(1, patienceLeft)) * 100);
    if (fill !== this.fillShown) {
      this.fill.style.transform = `scaleX(${fill / 100})`;
      this.fillShown = fill;
    }
    // Bubbles are reused with pooled cars, so the VIP flag is part of what's cached.
    const key = `${mood}:${badge}`;
    if (key !== this.shown) {
      this.face.textContent = badge === 'vip' ? '👑' : badge === 'special' ? '🌟' : FACES[mood];
      this.el.dataset.mood = mood;
      // Golden VIP: crown and a gold bubble.
      if (vip) this.el.dataset.vip = '';
      else delete this.el.dataset.vip;
      this.shown = key;
    }
  }

  hide(): void {
    this.label.visible = false;
  }
}

/** One bubble per car (reused with the pooled cars), shown while the car waits. */
export class CarMoods {
  private readonly bubbles = new Map<Car, CarBubble>();
  private readonly shown = new Set<Car>();

  constructor(private readonly labels: WorldLabels) {}

  /** Shows bubbles for these cars and hides every other one. Station cars get theirs beside them. */
  update(waiting: { car: Car; beside: boolean }[]): void {
    const now = new Set<Car>();
    for (const { car, beside } of waiting) {
      let bubble = this.bubbles.get(car);
      if (!bubble) {
        bubble = new CarBubble(this.labels);
        this.bubbles.set(car, bubble);
      }
      const left = car.patience / car.patienceMax;
      const rules = TUNING.customers;
      const mood: Mood = left > rules.moodHappy ? 'happy' : left > rules.moodGrumpy ? 'waiting' : 'grumpy';
      const p = car.position;
      bubble.show(beside ? p.x + car.def.size[0] / 2 + 0.9 : p.x, BUBBLE_HEIGHT, p.z, left, mood, car.vip ? 'vip' : car.special ? 'special' : '');
      now.add(car);
    }
    for (const car of this.shown) if (!now.has(car)) this.hide(car);
    this.shown.clear();
    for (const car of now) this.shown.add(car);
  }

  hide(car: Car): void {
    this.bubbles.get(car)?.hide();
  }
}

/** "+$15" and "+$3 tip" texts that float up and fade. */
export class Floaters {
  private readonly items: { label: Label; at: Vector3; age: number }[] = [];
  private static readonly LIFE = 1.1;

  constructor(private readonly labels: WorldLabels) {}

  show(text: string, at: Vector3, kind: 'cash' | 'tip' | 'star' = 'cash'): void {
    const el = document.createElement('div');
    el.className = `floater floater-${kind}`;
    el.textContent = text;
    const pos = at.clone();
    this.items.push({ label: this.labels.add(el, pos), at: pos, age: 0 });
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i]!;
      item.age += dt;
      item.at.y += dt * 1.6;
      item.label.el.style.opacity = String(Math.max(0, 1 - (item.age / Floaters.LIFE) ** 2));
      if (item.age >= Floaters.LIFE) {
        this.labels.remove(item.label);
        this.items.splice(i, 1);
      }
    }
  }
}
