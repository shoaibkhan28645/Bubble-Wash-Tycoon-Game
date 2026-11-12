// Town goals (GDD "Town goals"): the main progress bar. Each is a building
// opened, a lifetime count or a star rating; once reached it stays reached,
// and earns a franchise star on the spot (the gems wait to be claimed).
// Every goal reached puts the land for the next town up for sale.
import { town, type GoalDef } from '../core/config';
import type { GameState } from '../core/gameState';

/** The goals of the town being played. */
const goals = (): GoalDef[] => town().goals.goals;

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

/** Marks newly reached goals as done (for good), each earning its franchise star. Returns their ids. */
export function checkGoals(state: GameState): string[] {
  const done = state.goals.done;
  const fresh = goals().filter((goal) => !done.includes(goal.id) && reached(state, goal)).map((goal) => goal.id);
  done.push(...fresh);
  state.franchiseStars += fresh.length * town().goals.franchiseStars;
  return fresh;
}

/** Takes a reached goal's gems (its star came when it was reached). Returns the gems (0 if not ready). */
export function claimGoal(state: GameState, id: string): number {
  const goal = goals().find((g) => g.id === id);
  if (!goal || !state.goals.done.includes(id) || state.goals.claimed.includes(id)) return 0;
  state.goals.claimed.push(id);
  state.gems += goal.gems;
  return goal.gems;
}

/** Every goal reached: the road to the next town opens. */
export function allGoalsDone(state: GameState): boolean {
  return goals().every((goal) => state.goals.done.includes(goal.id));
}

/** For the goals bar: how many are reached, waiting to be claimed, and the first one still to do. */
export function goalsSummary(state: GameState): { done: number; total: number; ready: number; next: GoalDef | null } {
  const { done, claimed } = state.goals;
  return {
    done: goals().filter((g) => done.includes(g.id)).length,
    total: goals().length,
    ready: goals().filter((g) => done.includes(g.id) && !claimed.includes(g.id)).length,
    next: goals().find((g) => !done.includes(g.id)) ?? null,
  };
}
