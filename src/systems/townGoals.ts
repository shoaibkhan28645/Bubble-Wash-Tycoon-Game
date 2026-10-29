// Town goals (GDD "Town goals"): the main progress bar. Each is a building
// opened, a lifetime count or a star rating; once reached it stays reached,
// and claiming it pays gems and franchise stars. Every goal reached opens
// the road to the next town (the truck pad).
import { GOALS, type GoalDef } from '../core/config';
import type { GameState } from '../core/gameState';

/** How far along a goal is: built goals are 0 or 1. */
export function goalProgress(state: GameState, goal: GoalDef): { value: number; target: number } {
  if (goal.built) return { value: state.unlocked.includes(goal.built) ? 1 : 0, target: 1 };
  if (goal.count) return { value: Math.min(goal.goal ?? 1, state.counts[goal.count] ?? 0), target: goal.goal ?? 1 };
  return { value: Math.min(goal.stars ?? 5, state.stars), target: goal.stars ?? 5 };
}

function reached(state: GameState, goal: GoalDef): boolean {
  const { value, target } = goalProgress(state, goal);
  // Stars are a rating that can round to just under the top.
  return value >= target - 1e-6;
}

/** Marks newly reached goals as done (for good). Returns their ids. */
export function checkGoals(state: GameState): string[] {
  const done = state.goals.done;
  const fresh = GOALS.goals.filter((goal) => !done.includes(goal.id) && reached(state, goal)).map((goal) => goal.id);
  done.push(...fresh);
  return fresh;
}

/** Takes a reached goal's gems and franchise stars. Returns the gems (0 if not ready). */
export function claimGoal(state: GameState, id: string): number {
  const goal = GOALS.goals.find((g) => g.id === id);
  if (!goal || !state.goals.done.includes(id) || state.goals.claimed.includes(id)) return 0;
  state.goals.claimed.push(id);
  state.gems += goal.gems;
  state.franchiseStars += GOALS.franchiseStars;
  return goal.gems;
}

/** Every goal reached: the road to the next town opens. */
export function allGoalsDone(state: GameState): boolean {
  return GOALS.goals.every((goal) => state.goals.done.includes(goal.id));
}

/** For the goals bar: how many are reached, waiting to be claimed, and the first one still to do. */
export function goalsSummary(state: GameState): { done: number; total: number; ready: number; next: GoalDef | null } {
  const { done, claimed } = state.goals;
  return {
    done: GOALS.goals.filter((g) => done.includes(g.id)).length,
    total: GOALS.goals.length,
    ready: GOALS.goals.filter((g) => done.includes(g.id) && !claimed.includes(g.id)).length,
    next: GOALS.goals.find((g) => !done.includes(g.id)) ?? null,
  };
}
