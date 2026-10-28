// Which cars may use which wash lane, and how the valet rebalances lines.
import type { Car } from './cars';

/** A wash lane cars queue for: a hand-wash bay or the brush tunnel. */
export interface Lane {
  /** 'bay' or 'tunnel'. */
  kind: string;
  queue: Car[];
  /** Ready to take a car right now with nobody waiting (an empty bay, a tunnel with room). */
  readonly idle: boolean;
}

/**
 * Swamp mud needs the pre-soak only the tunnel has; the golden VIP is
 * washed by hand in a bay; everything else can go anywhere.
 */
export function canUse(car: { def: { dirt: string }; vip: boolean }, lane: Pick<Lane, 'kind'>): boolean {
  if (car.def.dirt === 'swamp') return lane.kind === 'tunnel';
  if (car.vip) return lane.kind === 'bay';
  return true;
}

/**
 * Valet: if a lane sits idle while another has cars waiting, move the car
 * that has waited longest (the front of the longest line) over to it.
 */
export function pickRebalance<L extends Lane>(lanes: readonly L[]): { car: Car; from: L; to: L } | null {
  const sources = [...lanes].filter((l) => l.queue.length > 0).sort((a, b) => b.queue.length - a.queue.length);
  for (const to of lanes) {
    if (!to.idle || to.queue.length > 0) continue;
    for (const from of sources) {
      if (from === to) continue;
      const car = from.queue[0]!;
      if (car.state === 'queued' && canUse(car, to)) return { car, from, to };
    }
  }
  return null;
}

/**
 * The station a car goes to after `from` (dryer, then wax, then the garage
 * if it asked for detailing), or undefined to pay and leave. `from` may be a
 * bay or the tunnel, which aren't in the list, so everything is next. The
 * tunnel has its own blowers, so its cars skip the dryer.
 */
export function nextStop<S extends { kind: string }>(finishing: readonly S[], from: S, wantsDetail: boolean): S | undefined {
  const start = finishing.indexOf(from) + 1;
  return finishing
    .slice(start)
    .find((s) => (s.kind !== 'garage' || wantsDetail) && (s.kind !== 'dryer' || from.kind !== 'tunnel'));
}
