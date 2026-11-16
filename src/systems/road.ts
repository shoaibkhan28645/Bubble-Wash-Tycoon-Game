// The road in front of Skyport's terminal (Chapter 4): two lanes, the one by the kerb westbound and the far
// one eastbound. Everything on it keeps its distance from whatever's ahead of it in its lane (a taxi waits
// behind the shuttle at its stop), something turning round across both lanes holds up both, and a car pulled
// into the limousine's bay by the kerb is passed with a swing out. Pure logic: the game moves the vehicles.

/** Where something is on the road: the westbound lane, the eastbound one, across both (turning round), or pulled into the bay. */
export type Lane = 'west' | 'east' | 'both' | 'bay';

export interface RoadUser {
  /** Along the road (its middle). */
  x: number;
  /** Half its length (plus whatever it sweeps, turning round). */
  half: number;
  lane: Lane;
  /** How fast it's going (a vehicle waiting behind another doesn't hold up its turning round). */
  speed?: number;
}

/** The gap kept to whatever's ahead. */
const GAP = 1.5;

const westward = (u: RoadUser): boolean => u.lane === 'west' || u.lane === 'both';
const eastward = (u: RoadUser): boolean => u.lane === 'east' || u.lane === 'both';

/** The furthest west a westbound vehicle may get: short of the back of whatever's ahead (west) of it in its lane. */
export function westLimit(users: readonly RoadUser[], self: RoadUser): number {
  let limit = -Infinity;
  for (const u of users) if (u !== self && westward(u) && u.x < self.x) limit = Math.max(limit, u.x + u.half + self.half + GAP);
  return limit;
}

/** The furthest east an eastbound vehicle may get: short of the back of whatever's ahead (east) of it in its lane. */
export function eastLimit(users: readonly RoadUser[], self: RoadUser): number {
  let limit = Infinity;
  for (const u of users) if (u !== self && eastward(u) && u.x > self.x) limit = Math.min(limit, u.x - u.half - self.half - GAP);
  return limit;
}

/** How far (0–1) a westbound vehicle swings out towards the middle of the road to pass something in the bay. */
export function swingOut(users: readonly RoadUser[], self: RoadUser): number {
  let out = 0;
  for (const u of users) {
    if (u === self || u.lane !== 'bay') continue;
    out = Math.max(out, Math.min(1, (u.half + self.half + 5 - Math.abs(self.x - u.x)) / 3));
  }
  return out;
}

/**
 * Whether a vehicle may turn round across both lanes now: nothing alongside it in either lane, nothing coming
 * its way at speed within `reach` (whatever's waiting behind it waits on), nothing else turning beside it.
 */
export function mayTurn(users: readonly RoadUser[], self: RoadUser, reach = 14): boolean {
  return users.every((u) => {
    if (u === self) return true;
    const near = u.half + self.half;
    if (u.lane === 'both') return Math.abs(u.x - self.x) > near + GAP + 2;
    if (u.lane === 'bay') return true;
    // How far it is from coming alongside, heading this way (westbound from the east, eastbound from the west).
    const ahead = u.lane === 'west' ? u.x - self.x : self.x - u.x;
    if (ahead < -near) return true;
    if (ahead <= near) return false;
    return ahead > near + reach || (u.speed ?? 0) < 3;
  });
}

/** Eases a vehicle's speed towards `wanted` (it can always stop): its speed this step. */
export function ease(speed: number, wanted: number, dt: number, accel = 9): number {
  return Math.max(0, Math.min(wanted, speed + accel * dt));
}
