import { describe, expect, it } from 'vitest';
import { PROGRESS_STEPS, padStep, reportProgress } from '../src/systems/progress';
import { loadTown, townIds } from '../src/core/towns';

describe('progress steps for the stats', () => {
  it('marks the first town pads, each land for the next town and the end', () => {
    expect(padStep('roadside', 'register')).toBe('first_build');
    expect(padStep('roadside', 'washer')).toBe('first_helper');
    expect(padStep('roadside', 'mart')).toBe('mini_mart');
    expect(padStep('roadside', 'bay2')).toBeNull();
    // Another town's pad of the same name is no step.
    expect(padStep('willowbrook', 'register')).toBeNull();
    expect(padStep('roadside', 'farmland', { travel: 'willowbrook' })).toBe('town_willowbrook');
    expect(padStep('skyport', 'skyqueen', { endOfContent: true })).toBe('game_finished');
    expect(padStep('roadside', 'x', { travel: 'nowhere' })).toBeNull();
  });

  it('sends a fixed step id with its place in the game', () => {
    const sent: unknown[] = [];
    reportProgress('first_helper', (name, data) => void sent.push([name, data]));
    reportProgress(null, (name, data) => void sent.push([name, data]));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual(['progression_completed', expect.objectContaining({ step_id: 'first_helper', step_index: 4 })]);
  });

  it("every town's pads exist for the steps that name them, and every travel has a step", async () => {
    const roadside = await loadTown('roadside');
    for (const id of ['register', 'washer', 'mart']) expect(roadside.pads.some((p) => p.id === id)).toBe(true);
    for (const id of townIds()) {
      const town = await loadTown(id);
      for (const pad of town.pads) {
        if (pad.effects.travel) expect(PROGRESS_STEPS).toContain(`town_${pad.effects.travel}`);
      }
    }
  });
});
