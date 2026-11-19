// The tester build (`npm run zip:test`, Vite's `tester` mode): outside YouTube
// it keeps progress between visits, shows its build number, and has the
// tester panel (money, gems, a trip to any town, an hour away, a fresh start).
// TESTER is a constant Vite fixes at build time, so in every other build the
// tester code is dropped and none of it ships to YouTube.

export const TESTER = import.meta.env.MODE === 'tester';

/** "Test build 412 · 18 Nov", set by scripts/build-test.mjs; empty in every other build. */
export const BUILD_LABEL: string = TESTER ? String(import.meta.env.VITE_BUILD_LABEL ?? 'Test build') : '';

/** Where the tester build keeps its save in the browser (apart from the dev server's). Named for the game's
 * first title, so testers keep their progress. */
export const TESTER_SAVE_KEY = 'main-street-mogul-test-save';

/** Set by the panel's "an hour away" button: how far back the next start dates the last save. */
const AWAY_KEY = 'main-street-mogul-test-away';

/** Asks the next start to count this long away (ms). */
export function setAwayShift(ms: number): void {
  try {
    window.localStorage.setItem(AWAY_KEY, String(ms));
  } catch {
    // Storage blocked: the shortcut does nothing.
  }
}

/** The time away the panel asked for, used once (0 when none). */
export function takeAwayShift(): number {
  try {
    const ms = Number(window.localStorage.getItem(AWAY_KEY) ?? 0);
    window.localStorage.removeItem(AWAY_KEY);
    return Number.isFinite(ms) && ms > 0 ? ms : 0;
  } catch {
    return 0;
  }
}

/**
 * The "Add money" amount: enough for the next five builds in this town (the
 * cheapest one not yet built, five times), and never under 1,000. With
 * everything built, five times the dearest build.
 */
export function testerCash(pads: readonly { id: string; cost: number }[], built: readonly string[]): number {
  const left = pads.filter((p) => !built.includes(p.id)).map((p) => p.cost);
  const base = left.length ? Math.min(...left) : Math.max(0, ...pads.map((p) => p.cost));
  return Math.max(1000, Math.round(base * 5));
}
