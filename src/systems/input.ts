import type { Lifecycle } from '../core/lifecycle';

/** Joystick drag (CSS px) for full speed. */
const JOYSTICK_RADIUS = 56;
const DEAD_ZONE = 0.12;

const KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

export interface MoveInput {
  /** Screen right = world +x. */
  x: number;
  /** Screen down = world +z. */
  z: number;
}

/**
 * Floating joystick (touch or mouse drag anywhere) plus WASD / arrow keys.
 * Ignored while paused.
 */
export class Input {
  private readonly held = new Set<string>();
  private pointerId: number | null = null;
  private readonly origin = { x: 0, y: 0 };
  private readonly drag = { x: 0, y: 0 };
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;

  constructor(root: HTMLElement, private readonly lifecycle: Lifecycle) {
    this.base = document.createElement('div');
    this.base.className = 'joystick';
    this.knob = document.createElement('div');
    this.knob.className = 'joystick-knob';
    this.base.appendChild(this.knob);
    root.appendChild(this.base);

    root.addEventListener('pointerdown', (e) => {
      if (this.lifecycle.paused || this.pointerId !== null || e.button > 0) return;
      this.pointerId = e.pointerId;
      root.setPointerCapture(e.pointerId);
      this.origin.x = e.clientX;
      this.origin.y = e.clientY;
      this.drag.x = this.drag.y = 0;
      this.base.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      this.base.classList.add('joystick-on');
      this.moveKnob();
    });
    root.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.pointerId) return;
      this.drag.x = e.clientX - this.origin.x;
      this.drag.y = e.clientY - this.origin.y;
      this.moveKnob();
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.pointerId) this.releasePointer();
    };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);

    window.addEventListener('keydown', (e) => {
      if (KEYS[e.code] && !this.lifecycle.paused) {
        this.held.add(e.code);
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.reset());
    lifecycle.onPause(() => this.reset());
  }

  /** Movement this frame, length 0..1. */
  read(): MoveInput {
    let x = 0;
    let z = 0;
    for (const code of this.held) {
      const dir = KEYS[code];
      if (dir) {
        x += dir[0];
        z += dir[1];
      }
    }
    const keyLength = Math.hypot(x, z);
    if (keyLength > 0) return { x: x / keyLength, z: z / keyLength };

    if (this.pointerId === null) return { x: 0, z: 0 };
    const length = Math.hypot(this.drag.x, this.drag.y);
    const strength = Math.min(1, length / JOYSTICK_RADIUS);
    if (strength < DEAD_ZONE || length === 0) return { x: 0, z: 0 };
    return { x: (this.drag.x / length) * strength, z: (this.drag.y / length) * strength };
  }

  private moveKnob(): void {
    const length = Math.hypot(this.drag.x, this.drag.y);
    const scale = length > JOYSTICK_RADIUS ? JOYSTICK_RADIUS / length : 1;
    this.knob.style.transform = `translate(${this.drag.x * scale}px, ${this.drag.y * scale}px)`;
  }

  private releasePointer(): void {
    this.pointerId = null;
    this.drag.x = this.drag.y = 0;
    this.base.classList.remove('joystick-on');
  }

  private reset(): void {
    this.held.clear();
    this.releasePointer();
  }
}
