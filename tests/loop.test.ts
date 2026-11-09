import { afterEach, describe, expect, it } from 'vitest';
import { Loop } from '../src/core/loop';

/** A stand-in for the browser's frames: run() plays the next one at `at` ms. */
function fakeFrames(): { run: (at: number) => void; pending: () => number; restore: () => void } {
  const g = globalThis as unknown as { requestAnimationFrame?: unknown; cancelAnimationFrame?: unknown };
  const saved = { raf: g.requestAnimationFrame, caf: g.cancelAnimationFrame };
  let queue: { id: number; cb: (t: number) => void }[] = [];
  let next = 1;
  g.requestAnimationFrame = (cb: (t: number) => void) => {
    queue.push({ id: next, cb });
    return next++;
  };
  g.cancelAnimationFrame = (id: number) => void (queue = queue.filter((f) => f.id !== id));
  return {
    run(at) {
      const now = queue;
      queue = [];
      for (const f of now) f.cb(at);
    },
    pending: () => queue.length,
    restore() {
      g.requestAnimationFrame = saved.raf;
      g.cancelAnimationFrame = saved.caf;
    },
  };
}

describe('the game loop', () => {
  let frames: ReturnType<typeof fakeFrames>;
  afterEach(() => frames.restore());

  it('carries on after a frame that throws, reporting each new error once', () => {
    frames = fakeFrames();
    const reported: unknown[] = [];
    let ticks = 0;
    const loop = new Loop(() => {
      ticks++;
      if (ticks === 2 || ticks === 3) throw new Error('no words for unit_apple');
    }, (error) => reported.push(error));
    loop.start();
    for (let i = 1; i <= 6; i++) frames.run(i * 16);
    expect(ticks).toBe(6);
    expect(loop.errors).toBe(2);
    expect(loop.lastError).toBe('no words for unit_apple');
    expect(reported).toHaveLength(1);
    // Stopped mid-way, it asks for no more frames.
    loop.stop();
    expect(frames.pending()).toBe(0);
  });
});
