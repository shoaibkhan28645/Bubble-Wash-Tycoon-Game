// Fleet contracts (GDD "New: contracts board"): three big jobs at a time,
// each a number of one task before its timer runs out, for cash or gems.
// A finished one waits on the board to be claimed; once claimed or run out,
// its slot gets a new contract a few minutes later. Pure functions over
// GameState, with wall-clock times (contracts keep running while away).
import { CONTRACTS, type ContractDef } from '../core/config';
import type { Contract, GameState } from '../core/gameState';

export function contractDef(kind: string): ContractDef | undefined {
  return CONTRACTS.kinds.find((def) => def.id === kind);
}

const emptySlot = (endsAt: number): Contract => ({ kind: '', goal: 0, progress: 0, endsAt, cash: 0, gems: 0 });

/** Two significant figures, so rewards read nicely ($1,300, not $1,314). */
function roundNice(n: number): number {
  if (n < 10) return Math.max(1, Math.round(n));
  const step = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / step) * step;
}

/** A new contract from those this lot can do and that aren't on the board already; null if there's none. */
export function dealContract(state: GameState, now: number, rand: () => number): Contract | null {
  const onBoard = new Set(state.contracts.slots.map((slot) => slot.kind));
  const pool = CONTRACTS.kinds.filter((def) => !onBoard.has(def.id) && (!def.requires || state.unlocked.includes(def.requires)));
  const def = pool[Math.floor(rand() * pool.length)];
  if (!def) return null;
  const built = Math.max(0, state.unlocked.length - 1);
  return {
    kind: def.id,
    goal: def.goal,
    progress: 0,
    endsAt: now + def.minutes * 60_000,
    cash: def.cash ? roundNice(def.goal * def.cash * CONTRACTS.cashGrowth ** built) : 0,
    gems: def.gems ?? 0,
  };
}

/** Finished: waiting on the board to be claimed (it no longer runs out). */
export function contractDone(contract: Contract): boolean {
  return contract.kind !== '' && contract.progress >= contract.goal;
}

/**
 * Brings the board up to date: fills its slots, deals new contracts where a
 * slot's wait is over, and clears ones whose time ran out unfinished.
 * Returns true if anything changed. Does nothing until the board is built.
 */
export function refreshBoard(state: GameState, now: number, rand: () => number = Math.random): boolean {
  if (!state.unlocked.includes('board')) return false;
  const slots = state.contracts.slots;
  let changed = false;
  while (slots.length < CONTRACTS.slots) {
    slots.push(emptySlot(0));
    changed = true;
  }
  slots.forEach((slot, i) => {
    if (slot.kind && !contractDone(slot) && slot.endsAt <= now) {
      slots[i] = emptySlot(now + CONTRACTS.refillMinutes * 60_000);
      changed = true;
    } else if (!slot.kind && slot.endsAt <= now) {
      const next = dealContract(state, now, rand);
      if (next) {
        slots[i] = next;
        changed = true;
      }
    }
  });
  return changed;
}

/** Counts a finished task (e.g. "wash:suv") towards running contracts. Returns the slots this just finished. */
export function countTask(state: GameState, task: string, now: number, amount = 1): number[] {
  const finished: number[] = [];
  state.contracts.slots.forEach((slot, i) => {
    if (!slot.kind || contractDone(slot) || slot.endsAt <= now || contractDef(slot.kind)?.task !== task) return;
    slot.progress = Math.min(slot.goal, slot.progress + amount);
    if (contractDone(slot)) finished.push(i);
  });
  return finished;
}

/** The once-a-day ad that doubles a contract's reward is still unused today. */
export function canDouble(state: GameState, today: string): boolean {
  return state.contracts.doubledDate !== today;
}

/**
 * Takes a finished contract's reward (doubled by the day's ad), counts it
 * for the town goals and leaves the slot waiting for a new one.
 */
export function claimContract(state: GameState, i: number, now: number, doubled = false, today = ''): { cash: number; gems: number } {
  const slot = state.contracts.slots[i];
  if (!slot || !contractDone(slot)) return { cash: 0, gems: 0 };
  const times = doubled ? 2 : 1;
  const reward = { cash: slot.cash * times, gems: slot.gems * times };
  state.cash += reward.cash;
  state.gems += reward.gems;
  if (doubled) state.contracts.doubledDate = today;
  state.counts.contract = (state.counts.contract ?? 0) + 1;
  state.contracts.slots[i] = emptySlot(now + CONTRACTS.refillMinutes * 60_000);
  return reward;
}

/** Finished contracts waiting to be claimed (the board's badge). */
export function readyCount(state: GameState): number {
  return state.contracts.slots.filter(contractDone).length;
}

/** What a paid car counts for: its washes by type, fuel, snacks, combos, wax and detailing. */
export function tasksFor(car: { def: { id: string }; served: readonly string[]; stages: readonly { id: string }[] }): string[] {
  const tasks: string[] = [];
  if (car.served.includes('wash')) tasks.push('wash', `wash:${car.def.id}`);
  if (car.served.includes('fuel')) tasks.push('fuel');
  if (car.served.includes('snack')) tasks.push('snack');
  if (car.served.length > 1) tasks.push('combo');
  if (car.stages.some((s) => s.id === 'wax')) tasks.push('wax');
  if (car.stages.some((s) => s.id === 'detail')) tasks.push('detail');
  return tasks;
}
