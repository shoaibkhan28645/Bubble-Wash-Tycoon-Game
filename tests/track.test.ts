// The flume's and the coaster's tracks: closed loops with a frame all the
// way round, upside down only in the coaster's loop, and a lap that starts
// and ends parked in the station.
import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { STARLIGHT } from '../src/core/starlight';
import { Ride, RIDES } from '../src/systems/park';
import { Track } from '../src/render/track';

const rides = STARLIGHT.layout.rides;

function track(id: 'flume' | 'coaster'): Track {
  return new Track(rides[id]!.track!, id);
}

describe('ride tracks', () => {
  it('starts in the station, heading out along it', () => {
    for (const id of ['flume', 'coaster'] as const) {
      const t = track(id);
      const at = new Vector3();
      const turn = new Quaternion();
      t.frame(0, at, turn);
      const [x, z, h] = rides[id]!.track!.points[0]!;
      expect(at.distanceTo(new Vector3(x, h, z))).toBeLessThan(1e-3);
      const ahead = new Vector3(1, 0, 0).applyQuaternion(turn);
      const up = new Vector3(0, 1, 0).applyQuaternion(turn);
      expect(ahead.x).toBeGreaterThan(0.99);
      expect(up.y).toBeGreaterThan(0.99);
    }
  });

  it('keeps every frame square, and only the coaster goes upside down', () => {
    for (const id of ['flume', 'coaster'] as const) {
      const t = track(id);
      let lowest = 1;
      for (let i = 0; i < t.count; i++) {
        const { ahead, up } = t.sample(i);
        expect(Math.abs(ahead.length() - 1)).toBeLessThan(1e-6);
        expect(Math.abs(up.length() - 1)).toBeLessThan(1e-6);
        expect(Math.abs(ahead.dot(up))).toBeLessThan(1e-6);
        lowest = Math.min(lowest, up.y);
      }
      if (id === 'coaster') expect(lowest).toBeLessThan(-0.95);
      else expect(lowest).toBeGreaterThan(0.5);
    }
  });

  it('runs a lap from the station back to it, never going backwards', () => {
    for (const id of ['flume', 'coaster'] as const) {
      const t = track(id);
      expect(t.distanceAt(0)).toBe(0);
      expect(t.distanceAt(t.lapSeconds)).toBeCloseTo(t.length, 3);
      let last = 0;
      for (let k = 1; k <= 200; k++) {
        const s = t.distanceAt((k / 200) * t.lapSeconds);
        expect(s).toBeGreaterThanOrEqual(last);
        last = s;
      }
      // A ride's time is a fair squeeze of the track's own pace: neither a crawl nor a blur.
      const squeeze = t.lapSeconds / RIDES[id]!.seconds;
      expect(squeeze).toBeGreaterThan(0.8);
      expect(squeeze).toBeLessThan(2.5);
    }
  });

  it('hauls the coaster up its lift slowly and races it down the drop', () => {
    const t = track('coaster');
    const [from, to] = rides.coaster!.track!.lifts![0]!;
    const time = (a: number, b: number) => {
      let lo = 0;
      let hi = t.lapSeconds;
      const find = (s: number) => {
        lo = 0;
        hi = t.lapSeconds;
        for (let k = 0; k < 40; k++) {
          const mid = (lo + hi) / 2;
          if (t.distanceAt(mid) < s) lo = mid;
          else hi = mid;
        }
        return lo;
      };
      return find(b) - find(a);
    };
    const lift = t.marks[to!]! - t.marks[from!]!;
    const liftSpeed = lift / time(t.marks[from!]!, t.marks[to!]!);
    const dropSpeed = 10 / time(t.marks[to!]! + 8, t.marks[to!]! + 18);
    expect(liftSpeed).toBeLessThan(4);
    expect(dropSpeed).toBeGreaterThan(liftSpeed * 2);
  });

  it('raises riders up the stairs onto a station deck', () => {
    const ride = new Ride('coaster', RIDES.coaster!, rides.coaster!);
    const deck = rides.coaster!.deck!;
    expect(ride.heightAt({ x: 24, z: (deck.minZ + deck.maxZ) / 2 })).toBe(1);
    expect(ride.heightAt(ride.steps)).toBe(0);
    const half = ride.heightAt({ x: 24, z: deck.minZ - 0.6 });
    expect(half).toBeGreaterThan(0.3);
    expect(half).toBeLessThan(0.7);
  });
});
