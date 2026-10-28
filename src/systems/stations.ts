import { Vector3 } from 'three';
import type { Point, Rect } from '../core/config';
import type { Label, WorldLabels } from '../ui/worldLabels';
import type { Car } from './cars';

export type StationKind = 'bay' | 'dryer' | 'wax' | 'garage' | 'tunnel';

/**
 * Bays: the ring floats above the arch. Dryer and wax are stacked down one
 * lane, so their rings sit beside them on the left, clear of each other.
 */
function ringSpot(kind: StationKind, at: Point, width: number): Vector3 {
  return kind === 'bay' ? new Vector3(at.x, 3.4, at.z) : new Vector3(at.x - width / 2 - 0.8, 1.8, at.z);
}
// Progress ring: track plus a fill whose dash length follows --p (0..100).
const RING_SVG = `<svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="14" class="ring-track"/><circle cx="18" cy="18" r="14" class="ring-fill" pathLength="100"/></svg>`;

/**
 * A place where cars get one kind of service: a hand-wash bay (with a line
 * of waiting cars), the dryer, or the waxing station. One car at a time.
 */
export class Station {
  /** The car parked here, or driving in. */
  car: Car | null = null;
  /** Bays only: cars waiting in line, front first. */
  readonly queue: Car[] = [];
  /** Where a worker must stand to work here. */
  readonly zone: Rect;
  /** Supply this station uses up per car (soap, towel, wax), or null. */
  supply: string | null = null;
  private readonly ring: HTMLElement | null = null;
  private readonly label: Label | null = null;

  constructor(
    readonly id: string,
    readonly kind: StationKind,
    readonly at: Point,
    size: { width: number; length: number },
    padding: number,
    /** Null in tests (no page to draw on). */
    labels: WorldLabels | null,
  ) {
    this.zone = {
      minX: at.x - size.width / 2 - padding,
      maxX: at.x + size.width / 2 + padding,
      minZ: at.z - size.length / 2 - padding,
      maxZ: at.z + size.length / 2 + padding,
    };
    if (!labels) return;
    this.ring = document.createElement('div');
    this.ring.className = 'wash-ring';
    this.ring.innerHTML = RING_SVG;
    this.label = labels.add(this.ring, ringSpot(kind, at, size.width));
    this.label.visible = false;
  }

  /** Free to take the next car (a bay with nobody in it). */
  get idle(): boolean {
    return !this.car;
  }

  /** A car parked here that still needs this station's service. */
  get needsWork(): boolean {
    return this.car?.state === 'waiting';
  }

  /** Shows the progress ring (and an "empty supply" warning) over the station. */
  showProgress(visible: boolean, fraction: number, outOfSupply: boolean): void {
    if (!this.label || !this.ring) return;
    this.label.visible = visible;
    this.ring.style.setProperty('--p', `${Math.round(fraction * 100)}`);
    this.ring.classList.toggle('ring-empty', outOfSupply);
    if (outOfSupply) this.ring.dataset.supply = this.supply ?? '';
  }
}

export function insideRect(p: Point, rect: Rect): boolean {
  return p.x >= rect.minX && p.x <= rect.maxX && p.z >= rect.minZ && p.z <= rect.maxZ;
}
