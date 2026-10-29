import { Vector3, type PerspectiveCamera } from 'three';
import type { Point } from '../core/config';

/** Keeps clear of the screen edges, the cash bar and the side buttons (CSS pixels). */
const MARGIN = 34;

/**
 * With the camera following the player, the next thing to do can be off
 * screen. This arrow sits at the screen's edge and points the way to it.
 */
export class EdgePointer {
  private readonly el: HTMLElement;
  private readonly p = new Vector3();
  private shown = '';

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'edge-pointer';
    this.el.setAttribute('aria-hidden', 'true');
    const arrow = document.createElement('span');
    arrow.textContent = '➜';
    this.el.appendChild(arrow);
    root.appendChild(this.el);
  }

  /** `insets`: the top and right strips taken by the HUD and side buttons. */
  update(camera: PerspectiveCamera, width: number, height: number, target: Point | null, insets: { top: number; right: number }): void {
    let key = 'hidden';
    let x = 0;
    let y = 0;
    let angle = 0;
    if (target) {
      this.p.set(target.x, 0.5, target.z).project(camera);
      // Behind the camera, the projection flips: point the other way.
      const flip = this.p.z > 1 ? -1 : 1;
      const sx = ((this.p.x * flip + 1) * width) / 2;
      const sy = ((1 - this.p.y * flip) * height) / 2;
      const left = MARGIN;
      const right = width - insets.right - MARGIN;
      const top = insets.top + MARGIN;
      const bottom = height - MARGIN;
      // On screen (clear of the HUD and the side buttons): no arrow needed.
      const inside = flip > 0 && sx > 0 && sx < width - insets.right && sy > insets.top && sy < height;
      if (!inside) {
        const cx = (left + right) / 2;
        const cy = (top + bottom) / 2;
        const dx = sx - cx;
        const dy = sy - cy;
        // Along the line from the middle towards the target, to where it meets the edge.
        const t = Math.min(dx ? (dx > 0 ? right - cx : left - cx) / dx : Infinity, dy ? (dy > 0 ? bottom - cy : top - cy) / dy : Infinity);
        x = Math.round(cx + dx * t);
        y = Math.round(cy + dy * t);
        angle = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
        key = `${x},${y},${angle}`;
      }
    }
    if (key === this.shown) return;
    this.shown = key;
    this.el.hidden = key === 'hidden';
    if (!this.el.hidden) this.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${angle}deg)`;
  }
}
