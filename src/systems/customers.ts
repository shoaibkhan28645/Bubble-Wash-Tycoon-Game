// What every station needs from whoever it serves. Chapter 1's customers
// all drive (Car); later towns add customers on foot, who will implement
// the same interface with a walking body.
import type { Body, Point, StageDef } from '../core/config';
import type { Need } from './tickets';

/**
 * arriving → queued → entering → waiting (needs service) → done (service
 * finished, waiting for the next station) → entering … → leaving.
 * A customer whose patience runs out while waiting goes `angry` and leaves.
 */
export type CustomerState = 'arriving' | 'queued' | 'entering' | 'waiting' | 'done' | 'leaving' | 'angry';

export interface Customer {
  /** Driving a car or on foot: decides how it moves and which stations can take it. */
  readonly body: Body;
  state: CustomerState;
  readonly position: Point;
  /** What it came for (its ticket), in visiting order, and what it has had so far. */
  needs: Need[];
  served: Need[];
  /** Progress of the current station's job, 0..1. */
  progress: number;
  /** Seconds of patience left, and the starting amount. */
  patience: number;
  patienceMax: number;
  /** Stages it has had so far (it pays for each). */
  stages: StageDef[];
  /** Product of the quality upgrades of the stations it visited. */
  quality: number;
  /** True if the player served it by hand (not counted as automated income). */
  manual: boolean;
  /** Whether the current station's supply was used up for it. */
  supplied: boolean;
  /** A golden VIP: only the hero serves it until a manager is hired. */
  readonly vip?: boolean;
  /** Wants this need but hasn't had it yet. */
  wants(need: Need): boolean;
}
