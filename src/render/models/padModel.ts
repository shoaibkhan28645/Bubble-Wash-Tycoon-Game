import { Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import { box, mergeParts } from './build';

const SIZE = 2.3;
const DASHES = 5;

const outlineGeometry = (() => {
  const parts = [];
  const dash = SIZE / (DASHES * 2 - 1);
  for (let i = 0; i < DASHES; i++) {
    const offset = -SIZE / 2 + dash / 2 + i * dash * 2;
    for (const side of [-1, 1]) {
      parts.push({ geometry: box(dash, 0.04, 0.14), color: '#ffffff', x: offset, y: 0.03, z: (side * SIZE) / 2 });
      parts.push({ geometry: box(0.14, 0.04, dash), color: '#ffffff', x: (side * SIZE) / 2, y: 0.03, z: offset });
    }
  }
  return mergeParts(parts);
})();
const plane = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

/**
 * Dashed pad on the ground. Unlock pads: the mint fill grows left to right as
 * cash drains in. Upgrade pads: smaller, with a coloured tint and no fill.
 */
export class PadModel {
  readonly group = new Group();
  private readonly base: Mesh;
  private readonly fill: Mesh;
  private readonly baseMaterial = new MeshBasicMaterial({ color: 0x3a3f4a, transparent: true, opacity: 0.25, depthWrite: false });
  private readonly fillMaterial = new MeshBasicMaterial({ color: 0x7ee0c3 });
  private readonly outline = new Mesh(outlineGeometry, new MeshBasicMaterial({ vertexColors: true }));
  private time = 0;
  private tinted = false;

  constructor(size = SIZE, tint?: number) {
    this.group.scale.setScalar(size / SIZE);
    if (tint !== undefined) {
      this.baseMaterial.color.setHex(tint);
      this.baseMaterial.opacity = 0.45;
      this.tinted = true;
    }
    this.base = new Mesh(plane, this.baseMaterial);
    this.base.scale.set(SIZE, 1, SIZE);
    this.base.position.y = 0.02;
    this.fill = new Mesh(plane, this.fillMaterial);
    this.fill.position.y = 0.025;
    this.base.receiveShadow = this.fill.receiveShadow = true;
    this.group.add(this.base, this.fill, this.outline);
    this.setProgress(0);
  }

  setProgress(fraction: number): void {
    const inner = SIZE - 0.3;
    const f = Math.min(1, Math.max(0, fraction));
    this.fill.visible = f > 0;
    this.fill.scale.set(Math.max(0.001, inner * f), 1, inner);
    this.fill.position.x = -inner / 2 + (inner * f) / 2;
  }

  /** Gentle pulse so the pad reads as "stand here". */
  update(dt: number, active: boolean): void {
    this.time += dt;
    const pulse = active ? 1.06 : 1 + Math.sin(this.time * 4) * 0.03;
    this.outline.scale.set(pulse, 1, pulse);
    this.baseMaterial.opacity = this.tinted ? (active ? 0.7 : 0.45) : active ? 0.4 : 0.25;
  }

  dispose(): void {
    this.baseMaterial.dispose();
    this.fillMaterial.dispose();
    (this.outline.material as MeshBasicMaterial).dispose();
  }
}
