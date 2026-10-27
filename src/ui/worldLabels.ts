import { Vector3, type PerspectiveCamera } from 'three';

interface Label {
  el: HTMLElement;
  at: Vector3;
  visible: boolean;
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
    const label = { el, at, visible: true };
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
      label.el.style.display = show ? '' : 'none';
      if (!show) continue;
      const x = (this.p.x + 1) * 0.5 * width;
      const y = (1 - this.p.y) * 0.5 * height;
      label.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    }
  }
}

export type { Label };
