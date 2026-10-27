// Offline earnings (GDD): only staffed or automatic stations earn while the
// player is away, at 50% of their rate (100% with the manager), capped.

export interface OfflineRules {
  rate: number;
  managerRate: number;
  /** Cap in hours by manager "offline hours" level: 2, then 4, 6, 8. */
  capHours: number[];
  minAwaySeconds: number;
}

/**
 * Cash earned while away. Time away is clamped between zero and the cap, so
 * winding the device clock back gives nothing and forward gives at most the cap.
 */
export function offlineEarnings(
  incomePerMinute: number,
  savedAt: number,
  now: number,
  rules: OfflineRules,
  hasManager: boolean,
  capLevel: number,
): { seconds: number; cash: number } {
  if (savedAt <= 0 || !(incomePerMinute > 0)) return { seconds: 0, cash: 0 };
  const capSeconds = (rules.capHours[Math.min(capLevel, rules.capHours.length - 1)] ?? 0) * 3600;
  const away = Math.min(capSeconds, Math.max(0, (now - savedAt) / 1000));
  if (!(away >= rules.minAwaySeconds)) return { seconds: 0, cash: 0 };
  const efficiency = hasManager ? rules.managerRate : rules.rate;
  return { seconds: away, cash: Math.floor((incomePerMinute * away * efficiency) / 60) };
}

/**
 * Rolling average of the income earned by automated stations only (cars
 * nobody had to work on by hand), per minute of play.
 */
export class IncomeTracker {
  private readonly events: { at: number; amount: number }[] = [];

  constructor(
    private readonly windowSeconds: number,
    /** Last saved rate, used until enough play time has passed to measure. */
    private fallbackPerMinute = 0,
  ) {}

  add(at: number, amount: number): void {
    this.events.push({ at, amount });
  }

  /** Income per minute over the window ending at `now` (game-clock seconds). */
  perMinute(now: number): number {
    while (this.events.length > 0 && this.events[0]!.at < now - this.windowSeconds) this.events.shift();
    if (now < this.windowSeconds) {
      // Not enough play yet this session: blend the saved rate with what we've seen.
      const seen = now > 0 ? (this.sum() * 60) / now : 0;
      const weight = now / this.windowSeconds;
      return this.fallbackPerMinute * (1 - weight) + seen * weight;
    }
    return (this.sum() * 60) / this.windowSeconds;
  }

  private sum(): number {
    return this.events.reduce((total, e) => total + e.amount, 0);
  }
}
