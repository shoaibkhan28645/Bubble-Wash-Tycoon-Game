// The cows' motion (systems/cows.ts): grounded (planted hooves don't slide, legs reach them), smooth (speed and
// turning ease, joints don't jump) and lively (they graze, chew, look, moo, lie down, come to see the hero, eat).
import { describe, expect, it } from 'vitest';
import { COW, Cow, Herd, type CowAct } from '../src/systems/cows';

const RUN = { minX: -7.2, maxX: -0.1, minZ: 10.4, maxZ: 19.2 };
const TROUGH = { x: -3.4, z: 15.6 };
const DT = 1 / 60;

function seeded(seed: number): () => number {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

function herd(count: number, seed = 5): { herd: Herd; moos: Cow[] } {
  const moos: Cow[] = [];
  const h = new Herd(RUN, TROUGH, seeded(seed), (cow) => moos.push(cow));
  for (let i = 0; i < count; i++) h.add();
  return { herd: h, moos };
}

/** How far apart two cows' bodies are: each 1.6 m long and 0.84 m wide, so a line 0.76 m long down her middle (0.42 m round it). */
function apart(a: Cow, b: Cow): number {
  const ends = (c: Cow) => [-0.38, -0.19, 0, 0.19, 0.38].map((k) => ({ x: c.x + Math.sin(c.heading) * k, z: c.z + Math.cos(c.heading) * k }));
  let least = Infinity;
  for (const p of ends(a)) for (const q of ends(b)) least = Math.min(least, Math.hypot(p.x - q.x, p.z - q.z));
  return least;
}

/** How far a point is from the line down a cow's back. */
function fromBack(p: { x: number; z: number }, cow: Cow): number {
  let least = Infinity;
  for (let k = -0.38; k < 0.4; k += 0.19) least = Math.min(least, Math.hypot(p.x - cow.x - Math.sin(cow.heading) * k, p.z - cow.z - Math.cos(cow.heading) * k));
  return least;
}

describe('the cows', () => {
  it('keep every planted hoof exactly where it is, and reach it with the leg (ten minutes, three cows)', () => {
    const { herd: h } = herd(3);
    let frames = 0;
    let overstretched = 0;
    const last = h.cows.map((c) => c.feet.map((f) => ({ x: f.x, z: f.z, down: !f.swing })));
    for (let t = 0; t < 600; t += DT) {
      h.update(DT, t % 120 > 90, t % 200 > 150 ? { x: -9, z: 13 } : null);
      h.cows.forEach((cow, c) => {
        cow.feet.forEach((foot, i) => {
          const was = last[c]![i]!;
          // Down last frame and still down: not a hair's breadth of slide.
          if (was.down && !foot.swing) {
            expect(foot.x).toBe(was.x);
            expect(foot.z).toBe(was.z);
          }
          expect(foot.lift).toBeGreaterThanOrEqual(0);
          last[c]![i] = { x: foot.x, z: foot.z, down: !foot.swing };
          frames++;
          if (cow.stretch[i]! > 0.01) overstretched++;
        });
      });
    }
    // The leg all but always reaches the hoof (so it's drawn where it's planted).
    expect(overstretched / frames).toBeLessThan(0.002);
  }, 30000);

  it('stay in the pasture, off the trough and clear of each other', () => {
    for (const seed of [3, 11, 29]) {
      const { herd: h } = herd(3, seed);
      let closest = Infinity;
      let nearTrough = Infinity;
      let touched = 0;
      let headIn = 0;
      for (let t = 0; t < 400; t += DT) {
        h.update(DT, t % 100 > 60, t % 150 > 100 ? { x: -4, z: 20.4 } : null);
        for (const cow of h.cows) {
          expect(cow.x).toBeGreaterThan(RUN.minX + 0.6);
          expect(cow.x).toBeLessThan(RUN.maxX - 0.6);
          expect(cow.z).toBeGreaterThan(RUN.minZ + 0.6);
          expect(cow.z).toBeLessThan(RUN.maxZ - 0.6);
          nearTrough = Math.min(nearTrough, Math.hypot(cow.x - TROUGH.x, cow.z - TROUGH.z));
          for (const other of h.cows) {
            if (other === cow) continue;
            closest = Math.min(closest, Math.hypot(cow.x - other.x, cow.z - other.z));
            if (apart(cow, other) < 0.78) touched++;
            // Her head isn't in another cow's side either: she carries it round (her neck, and her nose).
            const turned = cow.heading + cow.pose.neckYaw + cow.pose.headYaw * 0.6;
            for (const along of [0.35, 0.75]) {
              const head = { x: cow.x + Math.sin(cow.heading) * 0.62 + Math.sin(turned) * along, z: cow.z + Math.cos(cow.heading) * 0.62 + Math.cos(turned) * along };
              if (fromBack(head, other) < 0.4) headIn++;
            }
          }
        }
      }
      // Bodies are 0.84 m wide and stand side by side at the trough at the closest.
      expect(closest, `seed ${seed}`).toBeGreaterThan(1.0);
      expect(touched, `seed ${seed}: frames with two bodies overlapping`).toBe(0);
      // (A moment now and then, as one turns past another, before her head's round.)
      expect(headIn / (400 * 60 * 6 * 2), `seed ${seed}: share of the time a head is in another cow`).toBeLessThan(0.01);
      expect(nearTrough, `seed ${seed}`).toBeGreaterThan(0.95);
    }
  }, 20000);

  it('move smoothly: speed and turning ease, and no joint jumps from one frame to the next', () => {
    const { herd: h } = herd(2, 17);
    const before = h.cows.map((c) => ({ speed: c.speed, turning: c.turning, pose: structuredClone(c.pose) }));
    let fastest = 0;
    for (let t = 0; t < 300; t += DT) {
      h.update(DT, t % 90 > 60, t % 120 > 80 ? { x: -9, z: 12 } : null);
      h.cows.forEach((cow, c) => {
        const was = before[c]!;
        fastest = Math.max(fastest, cow.speed);
        expect(Math.abs(cow.speed - was.speed)).toBeLessThanOrEqual(0.9 * DT + 1e-4);
        expect(Math.abs(cow.turning - was.turning)).toBeLessThanOrEqual(3.5 * DT + 1e-9);
        const p = cow.pose;
        // Head, neck and body: a few degrees a frame at the very most.
        for (const key of ['neckPitch', 'neckYaw', 'headPitch', 'headYaw', 'headRoll', 'pitch', 'roll'] as const) {
          expect(Math.abs(p[key] - was.pose[key]), `${key} at ${t.toFixed(2)}s (${cow.act})`).toBeLessThan(0.09);
        }
        expect(Math.abs(p.y - was.pose.y)).toBeLessThan(0.02);
        p.legs.forEach((leg, i) => {
          expect(Math.abs(leg.hip - was.pose.legs[i]!.hip), `hip ${i} at ${t.toFixed(2)}s (${cow.act})`).toBeLessThan(0.2);
          expect(Math.abs(leg.knee - was.pose.legs[i]!.knee), `knee ${i} at ${t.toFixed(2)}s (${cow.act})`).toBeLessThan(0.3);
        });
        before[c] = { speed: cow.speed, turning: cow.turning, pose: structuredClone(p) };
      });
    }
    expect(fastest).toBeGreaterThan(0.45);
    expect(fastest).toBeLessThanOrEqual(0.55 + 1e-9);
  }, 30000);

  it('lead a full life: graze, chew, look about, moo, lie down and get up, and eat at the trough when it is full', () => {
    const { herd: h, moos } = herd(3, 7);
    const seen = new Set<CowAct>();
    let lowest = 0;
    let grazedLow = 0;
    for (let t = 0; t < 900; t += DT) {
      h.update(DT, t % 200 > 120, null);
      for (const cow of h.cows) {
        seen.add(cow.act);
        lowest = Math.min(lowest, cow.pose.y);
        // Grazing, her neck and head are right down.
        if (cow.act === 'graze' && cow.actTime > 2 && cow.speed === 0) grazedLow = Math.max(grazedLow, cow.pose.neckPitch + cow.pose.headPitch);
      }
    }
    for (const act of ['walk', 'graze', 'chew', 'look', 'moo', 'lieDown', 'lying', 'getUp', 'eat'] as const) expect(seen, act).toContain(act);
    expect(moos.length).toBeGreaterThan(0);
    // Lying, her body is right down; standing, her legs are all but straight.
    expect(lowest).toBeLessThan(-0.45);
    expect(grazedLow).toBeGreaterThan(0.8);
    for (const cow of h.cows) if (!cow.down && cow.speed === 0) expect(cow.pose.y).toBeGreaterThan(-0.2);
  }, 30000);

  it('keep moving about, even three to a small pasture: nobody is hemmed in for long', () => {
    for (const seed of [3, 11, 29]) {
      const { herd: h } = herd(3, seed);
      const walked = h.cows.map(() => 0);
      const stayed = h.cows.map(() => 0);
      const longest = h.cows.map(() => 0);
      const at = h.cows.map((c) => ({ x: c.x, z: c.z }));
      let ate = 0;
      for (let t = 0; t < 600; t += DT) {
        h.update(DT, t % 100 > 60, null);
        h.cows.forEach((cow, i) => {
          walked[i]! += Math.abs(cow.speed) * DT;
          if (cow.act === 'eat') ate += DT;
          if (Math.hypot(cow.x - at[i]!.x, cow.z - at[i]!.z) > 0.6) {
            at[i] = { x: cow.x, z: cow.z };
            stayed[i] = 0;
          } else stayed[i]! += DT;
          longest[i] = Math.max(longest[i]!, stayed[i]!);
        });
      }
      h.cows.forEach((_, i) => {
        expect(walked[i], `seed ${seed}, cow ${i}: metres walked in ten minutes`).toBeGreaterThan(15);
        expect(longest[i], `seed ${seed}, cow ${i}: longest in one place`).toBeLessThan(240);
      });
      // And they get to the trough when it's filled.
      expect(ate, `seed ${seed}: seconds at the trough`).toBeGreaterThan(30);
    }
  }, 60000);

  it('puts her mouth on the grass when she grazes', () => {
    const cow = new Cow({ x: -4, z: 12.5 }, 0.4, seeded(3));
    const pasture = { run: RUN, trough: TROUGH, fed: false, hero: null, others: [cow] };
    // Straight to grazing where she stands.
    (cow as unknown as { begin(act: CowAct, seconds: number): void }).begin('graze', 60);
    for (let t = 0; t < 4; t += DT) cow.update(DT, pasture);
    // Where her mouth is, from her joints: shoulders, neck, head (in her own frame, then the ground's).
    const p = cow.pose;
    const neckUp = Math.atan2(COW.neck.y, COW.neck.z) - p.neckPitch;
    const headUp = Math.atan2(COW.mouth.y, COW.mouth.z) - p.neckPitch - p.headPitch;
    const neck = Math.hypot(COW.neck.y, COW.neck.z);
    const head = Math.hypot(COW.mouth.y, COW.mouth.z);
    const localY = COW.shoulder.y + Math.sin(neckUp) * neck + Math.sin(headUp) * head;
    const localZ = COW.shoulder.z + Math.cos(neckUp) * neck + Math.cos(headUp) * head;
    const height = p.y + localY * Math.cos(p.pitch) - localZ * Math.sin(p.pitch);
    expect(height).toBeLessThan(0.2);
    expect(height).toBeGreaterThan(-0.05);
  });

  it('looks up when the hero comes by, and often walks over to the fence nearest them', () => {
    let came = 0;
    let watched = 0;
    for (const seed of [2, 4, 6, 8, 10, 12]) {
      const { herd: h } = herd(1, seed);
      const cow = h.cows[0]!;
      const hero = { x: RUN.minX - 1.2, z: 13.5 };
      for (let t = 0; t < 30; t += DT) h.update(DT, false, null);
      let sawGreet = false;
      for (let t = 0; t < 40; t += DT) {
        h.update(DT, false, hero);
        if (cow.act === 'greet') {
          sawGreet = true;
          // Looking at the hero: her head's turned their way.
          if (cow.actTime > 1.5) {
            const off = Math.atan2(hero.x - cow.x, hero.z - cow.z) - cow.heading;
            const want = Math.atan2(Math.sin(off), Math.cos(off));
            if (Math.abs(want) < 1.2) expect(Math.abs(cow.pose.neckYaw + cow.pose.headYaw - want)).toBeLessThan(0.5);
          }
          if (cow.x < RUN.minX + 1.2) came++;
        }
      }
      if (sawGreet) watched++;
    }
    expect(watched).toBeGreaterThanOrEqual(5);
    expect(came).toBeGreaterThan(0);
  });
});
