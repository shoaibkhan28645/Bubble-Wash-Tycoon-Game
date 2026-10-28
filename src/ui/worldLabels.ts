import { Vector3, type PerspectiveCamera } from 'three';

interface Label {
  el: HTMLElement;
  at: Vector3;
  visible: boolean;
  /** What's on the page now, so unchanged labels aren't touched (style writes are slow on phones). */
  shownAs: boolean | null;
  x: number;
  y: number;
}

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

  add(el: HTMLElement, at: Vector3): Label {
    const label = { el, at, visible: true, shownAs: null, x: NaN, y: NaN };
    el.classList.add('world-label');
    this.layer.appendChild(el);
    this.labels.add(label);
    return label;
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
      const x = Math.round((this.p.x + 1) * width) / 2;
      const y = Math.round((1 - this.p.y) * height) / 2;
      if (x === label.x && y === label.y) continue;
      label.x = x;
      label.y = y;
      label.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    }
  }
}

export type { Label };
