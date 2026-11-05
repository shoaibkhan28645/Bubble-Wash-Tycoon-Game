// Staff decisions, kept free of models and rendering so they can be tested.
import { TUNING, type Point } from '../core/config';
import type { GameState } from '../core/gameState';
import type { Carrier, SupplyType } from './carry';
import type { Station, StationKind } from './stations';
import type { Customer } from './customers';

/** Any station, whoever it serves (cars, or customers on foot). */
type AnyStation = Station<Customer>;
import type { Supplies } from './supplies';

/** Share of patience the station's car has left (1 = just arrived, 0 = about to leave). */
function patienceLeft(station: AnyStation): number {
  const car = station.customer;
  return car ? car.patience / car.patienceMax : 1;
}

/**
 * Which station a worker should serve. Keeps the current job until that car
 * is done; otherwise picks the waiting car with the least patience left,
 * skipping stations the player is already working.
 */
export function pickStation(
  stations: readonly AnyStation[],
  kinds: readonly StationKind[],
  current: AnyStation | null,
  playerAt: (station: AnyStation) => boolean,
): AnyStation | null {
  if (current?.needsWork) return current;
  let best: AnyStation | null = null;
  for (const station of stations) {
    if (!kinds.includes(station.kind) || !station.needsWork || playerAt(station)) continue;
    if (!best || patienceLeft(station) < patienceLeft(best)) best = station;
  }
  return best;
}

export type RunnerPlan = { kind: 'drop'; station: AnyStation } | { kind: 'shelf' } | { kind: 'home' };

/**
 * Runner: deliver what's carried to the emptiest station that has room;
 * otherwise go to the shelf if something is needed (also to swap back items
 * nobody wants); otherwise wait at home.
 */
export function planRunner(
  carrier: Carrier,
  stations: readonly AnyStation[],
  state: GameState,
  supplies: Supplies,
): RunnerPlan {
  const perItem = TUNING.stations.usesPerItem;
  const max = TUNING.stations.supplyCapacity * perItem;
  const carried = new Set(carrier.stack);
  let drop: AnyStation | null = null;
  let lowest = Infinity;
  for (const station of stations) {
    const type = station.supply as SupplyType | null;
    if (!type || !carried.has(type)) continue;
    const stock = state.supplies[`${station.id}.${type}`] ?? 0;
    if (stock + perItem <= max && stock < lowest) {
      drop = station;
      lowest = stock;
    }
  }
  if (drop) return { kind: 'drop', station: drop };
  const types = supplies.types();
  const wanted = types.some((t) => supplies.need(t, [carrier]) > 0);
  const surplus = types.some((t) => supplies.need(t, [carrier]) < 0);
  if (wanted && (!carrier.full || surplus)) return { kind: 'shelf' };
  return { kind: 'home' };
}

/** Where a worker stands beside a station: its own spot, else the side nearer the middle of the lot. */
export function sideOf(station: AnyStation, gap: number): Point {
  if (station.side) return station.side;
  const left = station.at.x <= 0 || station.kind !== 'bay';
  const x = left ? station.zone.minX + gap : station.zone.maxX - gap;
  return { x, z: station.at.z };
}
