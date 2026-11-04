import { Vector3 } from 'three';
import { stationDef, type Point, type Rect, type StationDef, type StationType } from '../core/config';
import type { Label, WorldLabels } from '../ui/worldLabels';
import type { Car } from './cars';
import type { Customer } from './customers';

/** A key of src/data/stations.json: bay, tunnel, dryer, wax, garage, pump, counter… */
export type StationKind = string;

/**
 * Over an arch (the bays), over the customer as a gauge (the pumps), or
 * beside the station on the left (the dryer and wax are stacked down one
 * lane, so their rings sit clear of each other).
 */
function ringSpot(ring: StationDef['ring'], at: Point, width: number): Vector3 {
  if (ring === 'arch') return new Vector3(at.x, 3.4, at.z);
  if (ring === 'gauge') return new Vector3(at.x, 1.9, at.z);
  return new Vector3(at.x - width / 2 - 0.8, 1.8, at.z);
}

/** Where a worker stands to work a station, from its spot and its definition's offset (null: beside its zone). */
export function workSpot(def: StationDef, at: Point): Point | null {
  const spot = def.workSpot;
  if (!spot) return null;
  const x = spot.mirror && at.x <= 0 ? -spot.x : spot.x;
  return { x: at.x + x, z: at.z + spot.z };
}
// Progress ring: track plus a fill whose dash length follows --p (0..100).
const RING_SVG = `<svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="14" class="ring-track"/><circle cx="18" cy="18" r="14" class="ring-fill" pathLength="100"/></svg>`;

/**
 * A place where customers get one kind of service, one at a time: a
 * hand-wash bay or a fuel pump (each with a line of waiting cars), the
 * dryer, the waxing station. What it does comes from its kind's entry in
 * stations.json; `C` is who it serves (Chapter 1: cars).
 */
export class Station<C extends Customer = Car> {
  /** The customer being served here, or on the way in. */
  customer: C | null = null;
  /** Lanes only: customers waiting in line, front first. */
  readonly queue: C[] = [];
  /** This kind's definition (stations.json). */
  readonly def: StationDef;
  /** Where a worker must stand to work here. */
  readonly zone: Rect;
  /** Supply this station uses up per car (soap, towel, wax), or null. */
  supply: string | null = null;
  /** Where a worker stands to work here, if not beside the zone's edge (at the pump, by the island). */
  side: Point | null = null;
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
    this.def = stationDef(kind);
    this.zone = {
      minX: at.x - size.width / 2 - padding,
      maxX: at.x + size.width / 2 + padding,
      minZ: at.z - size.length / 2 - padding,
      maxZ: at.z + size.length / 2 + padding,
    };
    if (!labels) return;
    this.ring = document.createElement('div');
    this.ring.className = 'wash-ring';
    this.ring.dataset.kind = kind;
    this.ring.innerHTML = RING_SVG;
    this.label = labels.add(this.ring, ringSpot(this.def.ring, at, size.width));
    this.label.visible = false;
  }

  /** Which of the five station types it is (service point, till…). */
  get type(): StationType {
    return this.def.type;
  }

  /** Free to take the next customer (a bay with nobody in it). */
  get idle(): boolean {
    return !this.customer;
  }

  /** A customer here who still needs this station's service. */
  get needsWork(): boolean {
    return this.customer?.state === 'waiting';
  }

  /** Moves the progress ring (e.g. so side-by-side pumps' rings don't overlap). */
  moveRing(x: number, y: number, z: number): void {
    this.label?.at.set(x, y, z);
  }

  /** Shows the progress ring (and an "empty supply" warning, or that the driver is losing patience) over the station. */
  showProgress(visible: boolean, fraction: number, outOfSupply: boolean, hurry = false): void {
    if (!this.label || !this.ring) return;
    this.label.visible = visible;
    this.ring.style.setProperty('--p', `${Math.round(fraction * 100)}`);
    this.ring.classList.toggle('ring-empty', outOfSupply);
    this.ring.classList.toggle('ring-hurry', hurry);
    if (outOfSupply) this.ring.dataset.supply = this.supply ?? '';
  }
}

export function insideRect(p: Point, rect: Rect): boolean {
  return p.x >= rect.minX && p.x <= rect.maxX && p.z >= rect.minZ && p.z <= rect.maxZ;
}
