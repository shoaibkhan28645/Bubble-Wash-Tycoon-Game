import { Vector3, type PerspectiveCamera } from 'three';

interface Label {
  el: HTMLElement;
  at: Vector3;
  visible: boolean;
  /** What's on the page now, so unchanged labels aren't touched (style writes are slow on phones). */
  shownAs: boolean | null;
  x: number;
  y: number;
  /** Kept fully on screen (sideways), e.g. the tutorial's words; its measured width, once known. */
  clamp: boolean;
  width: number | null;
}

/** Space kept between a clamped label and the screen's edge. */
const EDGE_PX = 6;

/** HTML elements pinned to 3D points (sharp text at any screen density). */
export class WorldLabels {
  private readonly layer: HTMLElement;
  private readonly labels = new Set<Label>();
  private readonly p = new Vector3();

  constructor(root: HTMLElement) {
    this.layer = document.createElement('div');
    this.layer.className = 'world-labels';
    root.appendChild(this.layer);
  }

  add(el: HTMLElement, at: Vector3, clamp = false): Label {
    const label: Label = { el, at, visible: true, shownAs: null, x: NaN, y: NaN, clamp, width: null };
    el.classList.add('world-label');
    this.layer.appendChild(el);
    this.labels.add(label);
    return label;
  }

  /** A clamped label's text changed: measure it again. */
  remeasure(label: Label): void {
    label.width = null;
    label.x = NaN;
  }

  remove(label: Label): void {
    label.el.remove();
    this.labels.delete(label);
  }

  update(camera: PerspectiveCamera, width: number, height: number): void {
    for (const label of this.labels) {
      this.p.copy(label.at).project(camera);
      const show = label.visible && this.p.z < 1;
      if (show !== label.shownAs) {
        label.el.style.display = show ? '' : 'none';
        label.shownAs = show;
      }
      if (!show) continue;
      // Half-pixel steps: smooth enough, and still labels skip the write.
      let x = Math.round((this.p.x + 1) * width) / 2;
      if (label.clamp) {
        label.width ??= label.el.offsetWidth;
        const half = label.width / 2 + EDGE_PX;
        x = Math.min(Math.max(x, half), width - half);
      }
      const y = Math.round((1 - this.p.y) * height) / 2;
      if (x === label.x && y === label.y) continue;
      label.x = x;
      label.y = y;
      label.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    }
  }
}

export type { Label };
