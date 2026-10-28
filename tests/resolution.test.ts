import { describe, expect, it } from 'vitest';
import { AdaptiveResolution } from '../src/render/resolution';

/** Feeds `seconds` of frames at a steady rate. */
function run(res: AdaptiveResolution, fps: number, seconds: number): void {
  for (let t = 0; t < seconds; t += 1 / fps) res.tick(1 / fps);
}

describe('adaptive resolution', () => {
  it('leaves a fast game alone', () => {
    const res = new AdaptiveResolution(() => {});
    run(res, 60, 30);
    expect(res.scale).toBe(1);
  });

  it('keeps stepping down while each step makes the game faster', () => {
    const res = new AdaptiveResolution(() => {});
    run(res, 30, 7.5); // warm-up, then one slow window: first step down
    expect(res.scale).toBe(0.85);
    run(res, 40, 3.1); // helped, still slow: another step
    expect(res.scale).toBe(0.7);
    run(res, 58, 3.1); // helped and fast now: stays
    run(res, 58, 10);
    expect(res.scale).toBe(0.7);
  });

  it('undoes a step that did not help, and stops trying', () => {
    const changes: number[] = [];
    const res = new AdaptiveResolution((s) => changes.push(s));
    run(res, 40, 7.5);
    run(res, 41, 3.1); // no real gain: back to full and done
    expect(res.scale).toBe(1);
    run(res, 30, 20);
    expect(res.scale).toBe(1);
    expect(changes).toEqual([0.85, 1]);
  });

  it('ignores long gaps from pauses', () => {
    const res = new AdaptiveResolution(() => {});
    for (let i = 0; i < 100; i++) res.tick(2);
    expect(res.scale).toBe(1);
  });
});
