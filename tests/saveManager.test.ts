import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/gameState';
import { AUTOSAVE_SECONDS, SaveManager } from '../src/core/save';

function setup(enabled = true) {
  const writes: string[] = [];
  let release: (() => void) | null = null;
  let hold = false;
  const write = (data: string) => {
    writes.push(data);
    if (!hold) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => (release = () => resolve(true)));
  };
  const state = newGame();
  const saves = new SaveManager(state, write, enabled, () => 1000);
  return {
    state,
    saves,
    writes,
    holdWrites: () => (hold = true),
    finishWrite: () => {
      hold = false;
      release?.();
    },
  };
}

describe('SaveManager', () => {
  it('autosaves every 30 seconds of game time', async () => {
    const { saves, writes } = setup();
    saves.update(AUTOSAVE_SECONDS - 0.1);
    expect(writes).toHaveLength(0);
    saves.update(0.2);
    await Promise.resolve();
    expect(writes).toHaveLength(1);
    saves.update(AUTOSAVE_SECONDS - 0.1);
    expect(writes).toHaveLength(1);
  });

  it('stamps savedAt with the wall clock', async () => {
    const { saves, writes, state } = setup();
    await saves.saveNow();
    expect(state.savedAt).toBe(1000);
    expect(JSON.parse(writes[0]!).savedAt).toBe(1000);
  });

  it('a manual save resets the autosave timer', async () => {
    const { saves, writes } = setup();
    saves.update(AUTOSAVE_SECONDS - 1);
    await saves.saveNow();
    saves.update(2);
    expect(writes).toHaveLength(1);
  });

  it('collapses saves requested during a write into one more, with the latest data', async () => {
    const { saves, writes, state, holdWrites, finishWrite } = setup();
    holdWrites();
    const first = saves.saveNow();
    state.cash = 10;
    void saves.saveNow();
    state.cash = 20;
    const third = saves.saveNow();
    expect(writes).toHaveLength(1);
    finishWrite();
    await Promise.all([first, third]);
    expect(writes).toHaveLength(2);
    expect(JSON.parse(writes[1]!).cash).toBe(20);
  });

  it('never writes when loading failed', async () => {
    const { saves, writes } = setup(false);
    await saves.saveNow();
    saves.update(AUTOSAVE_SECONDS * 3);
    expect(writes).toHaveLength(0);
  });
});
