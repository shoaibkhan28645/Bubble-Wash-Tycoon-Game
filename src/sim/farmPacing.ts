// The pacing simulator for a farm town (Chapter 2, Willowbrook): a quick
// model of the farm's economy, played by a bot that buys every pad in order
// as soon as it can afford it. Like the car wash town's simulator
// (pacing.ts), it reports the minute each pad is bought next to the minute
// the design wants (pads.json `targetMinute`, from the Willowbrook strategy's
// section 7), so prices can be tuned in seconds, not play-throughs.
//
// It is a model, not the game. Goods are made at the rates the data gives
// (crops, hens, cows, the bakery), moved as fast as the people and machines
// built can move them, and sold to villagers (one of everything per
// basket) at the stand and the market, with the rest going out in vans at
// order prices. Upgrades, the day's specials and the hero driving the
// tractor are left out, so a real player is usually a little faster. The
// helpers' rates come from the game itself, played hands off for several
// minutes at four stages of the farm; the model comes within about 10% of
// what each earned.
import { CROPS, GOODS, TUNING, type PadDef } from '../core/config';
import type { TownDef } from '../core/towns';
import { ANIMALS } from '../systems/animals';
import { VANS } from '../systems/deliveries';
import { spawnSeconds } from '../systems/economy';

export interface FarmPacingOptions {
  /** Star rating held (sets how often villagers come). */
  stars: number;
  /** Goods a minute the hero moves on his own (pick or pack, carry, hand over), all chains together, when not serving. */
  heroPerMinute: number;
  /** Simulated seconds per step, and the longest run. */
  step: number;
  maxMinutes: number;
}

export const FARM_PACING: FarmPacingOptions = { stars: 4, heroPerMinute: 16, step: 1, maxMinutes: 240 };

/** Goods a minute each helper moves (round trips with a full back, less breaks), measured in play. */
const HELPERS = { farmhand: 18, pickup: 20, tractordriver: 4, eggcollector: 6, milker: 6, baker: 6 };
/** Serving takes this share of the hero's time at each counter nobody else serves (a basket sells several goods at once). */
const SERVING = 0.25;
/** Villagers served quickly tip. */
const TIP = 1 + TUNING.customers.tipBonus;
/** A van spends this long waiting for its load, besides its trip (measured: the helpers fill it as goods are made). */
const LOADING_SECONDS = 120;
/** Without a delivery driver, the hero sends a van only so often (he's busy). */
const HERO_VAN_SHARE = 0.4;
/** Long builds the player waits out away from the game. */
const AWAY_AFTER_SECONDS = 15 * 60;

export interface FarmPadTiming {
  id: string;
  name: string;
  cost: number;
  targetMinute: number;
  boughtMinute: number | null;
}

type Goods = Record<string, number>;

/** What the farm does a second with what's built: goods made, moved to where they sell, sold at the counters and in vans, and the cash. */
export interface FarmFlows {
  made: Goods;
  moved: Goods;
  shop: Goods;
  vans: Goods;
  perSecond: number;
}

/** Cash per second the farm makes with what's built. */
export function farmIncomePerSecond(pads: readonly PadDef[], unlocked: ReadonlySet<string>, opts: FarmPacingOptions = FARM_PACING): number {
  return farmFlows(pads, unlocked, opts).perSecond;
}

export function farmFlows(pads: readonly PadDef[], unlocked: ReadonlySet<string>, opts: FarmPacingOptions = FARM_PACING): FarmFlows {
  const built = (id: string) => unlocked.has(id);
  const effects = pads.filter((p) => built(p.id)).map((p) => p.effects);
  const sum = (pick: (e: PadDef['effects']) => number | undefined) => effects.reduce((s, e) => s + (pick(e) ?? 0), 0);
  const has = (pick: (e: PadDef['effects']) => unknown) => effects.some((e) => !!pick(e));
  const staff = new Set(effects.map((e) => e.staff).filter(Boolean));
  const machine = new Set(effects.map((e) => e.machine).filter(Boolean));

  // Made, per second: crops from their plots (the well speeds them), the animals (faster fed), the combine's extra corn.
  const speed = 1 + sum((e) => e.growBonus);
  const made: Goods = {};
  for (const pad of pads) {
    if (!built(pad.id) || !pad.effects.field) continue;
    const crop = pad.effects.field;
    const plots = 6;
    made[crop] = (made[crop] ?? 0) + (plots * speed) / CROPS[crop]!.growSeconds;
  }
  if (machine.has('combine')) made.corn = (made.corn ?? 0) * TUNING.machines.combine.yield;
  const fed = has((e) => e.feeder);
  for (const pad of pads) {
    if (!built(pad.id) || !pad.effects.pen) continue;
    const def = ANIMALS[pad.effects.pen];
    made[def.good] = (made[def.good] ?? 0) + (def.count / def.every / def.perPack) * (fed ? def.fedSpeed : 1);
  }
  // Feed: without the feed truck, a share of the corn goes to the animals.
  if (fed && !machine.has('feedTruck')) {
    const feedPerSecond = Object.entries(made).reduce((s, [good, n]) => {
      const kind = good === 'eggs' ? 'hens' : good === 'milk' ? 'cows' : null;
      return kind ? s + n * ANIMALS[kind].perPack * ANIMALS[kind].feedEach : s;
    }, 0);
    made.corn = Math.max(0, (made.corn ?? 0) - feedPerSecond / TUNING.feed.perCrate);
  }

  // Moved, per second: who carries each chain.
  const crops = ['veg', 'corn', 'apple'].filter((g) => made[g]);
  const helpers: Record<string, number> = {
    crops: (staff.has('farmhand') ? (machine.has('pickup') ? HELPERS.pickup : HELPERS.farmhand) : 0) + (machine.has('tractorDriver') ? HELPERS.tractordriver : 0),
    eggs: staff.has('eggcollector') ? HELPERS.eggcollector : 0,
    milk: staff.has('milker') ? HELPERS.milker : 0,
    baked: staff.has('baker') ? HELPERS.baker : 0,
  };
  // The hero works the chains the helpers can't keep up with (all of them, at first), sharing out his time.
  const bakes = built('bakery') ? (60 / TUNING.bakery.seconds) * 2 : 0;
  const output: Record<string, number> = { crops: crops.reduce((s, g) => s + made[g]! * 60, 0), eggs: (made.eggs ?? 0) * 60, milk: (made.milk ?? 0) * 60, baked: bakes };
  // Serving takes the hero's time too, at the stand until there's a stand helper, and at the market until its staff come.
  const market = has((e) => e.counter === 'stall');
  const serving = (staff.has('standhand') ? 0 : SERVING) + (market && !staff.has('marketstaff') ? SERVING : 0);
  // Shared out evenly, smallest need first: what one chain can't use goes to the others.
  let spare = opts.heroPerMinute * Math.max(0, 1 - serving);
  const hero: Record<string, number> = {};
  const short = Object.keys(output)
    .map((c) => ({ c, need: output[c]! - helpers[c]! }))
    .filter((s) => s.need > 0)
    .sort((a, b) => a.need - b.need);
  short.forEach(({ c, need }, i) => {
    hero[c] = Math.min(need, spare / (short.length - i));
    spare -= hero[c];
  });
  const movers = (chain: string) => (helpers[chain]! + (hero[chain] ?? 0)) / 60;

  // The bakery turns corn (and apples) into bread and pies, a batch every few seconds.
  const moved: Goods = {};
  const cropShare = movers('crops') / Math.max(1e-9, crops.reduce((s, g) => s + made[g]!, 0));
  for (const g of crops) moved[g] = Math.min(made[g]!, made[g]! * Math.min(1, cropShare));
  for (const g of ['eggs', 'milk']) if (made[g]) moved[g] = Math.min(made[g]!, movers(g));
  if (built('bakery')) {
    const batches = Math.min(1 / TUNING.bakery.seconds, moved.corn ?? 0);
    const pies = Math.min(batches, moved.apple ?? 0);
    moved.corn = (moved.corn ?? 0) - batches;
    moved.apple = (moved.apple ?? 0) - pies;
    moved.pie = Math.min(pies, movers('baked'));
    moved.bread = Math.min((batches - pies) * 2, Math.max(0, movers('baked') - moved.pie));
  }

  // Sold: every villager fills a basket with one of each good stocked; the market's shoppers pay more.
  const villagers = 1 / spawnSeconds(TUNING.villagers.spawnSeconds, opts.stars, TUNING.stars.arrivalPerStar, sum((e) => e.arrivalBonus));
  // Villagers go to the shorter line: half of them shop at the market once there is one.
  const marketShare = market ? 0.5 : 0;
  const shopPrice = (1 + sum((e) => e.payBonus)) * (1 + marketShare * (TUNING.market.premium - 1)) * TIP;
  const vanPrice = (1 + sum((e) => e.payBonus)) * TUNING.deliveries.premium;
  const auto = has((e) => e.driver);
  // The vans go first (they pay more, and the helpers fill a waiting van before the stand): each carries so many
  // goods a second on average, one order at a time, the best paying goods it carries first.
  const price = (good: string) => GOODS[good]!.price;
  const left: Goods = { ...moved };
  const vans: Goods = {};
  for (const pad of pads) {
    if (!built(pad.id) || !pad.effects.van) continue;
    const van = VANS[pad.id];
    if (!van) continue;
    const [low, high] = van.load;
    let room = ((low + high) / 2 / (van.trip + LOADING_SECONDS)) * (auto ? 1 : HERO_VAN_SHARE);
    for (const good of [...van.goods].sort((a, b) => price(b) - price(a))) {
      const n = Math.min(room, left[good] ?? 0);
      if (n <= 0) continue;
      vans[good] = (vans[good] ?? 0) + n;
      left[good]! -= n;
      room -= n;
    }
  }
  let perSecond = 0;
  const shop: Goods = {};
  for (const [good, n] of Object.entries(left)) {
    shop[good] = Math.max(0, Math.min(n, villagers));
    perSecond += shop[good] * price(good) * shopPrice + (vans[good] ?? 0) * price(good) * vanPrice;
  }
  return { made, moved, shop, vans, perSecond };
}

/** Plays the farm's pads in order and returns when each was bought, plus the income per minute at the end. */
export function simulateFarmPacing(
  town: TownDef,
  options: Partial<FarmPacingOptions> = {},
): { pads: FarmPadTiming[]; finalIncomePerMinute: number; awayMinutes: number } {
  const opts = { ...FARM_PACING, ...options };
  const unlocked = new Set<string>();
  const finishing = new Map<string, number>();
  const bought = new Map<string, number>();
  let cash = 0;
  let income = 0;
  let incomeFor = -1;
  let awaySeconds = 0;
  for (let t = 0; t <= opts.maxMinutes * 60; t += opts.step) {
    for (const [id, at] of finishing) {
      if (at > t) continue;
      unlocked.add(id);
      finishing.delete(id);
    }
    for (;;) {
      const next = town.pads.find((p) => !unlocked.has(p.id) && !finishing.has(p.id) && !bought.has(p.id));
      if (!next || cash < next.cost) break;
      cash -= next.cost;
      bought.set(next.id, t);
      if (next.buildSeconds) finishing.set(next.id, t + next.buildSeconds);
      else unlocked.add(next.id);
    }
    if (bought.size === town.pads.length) break;
    // Income only changes when something new opens.
    if (unlocked.size !== incomeFor) {
      income = farmIncomePerSecond(town.pads, unlocked, opts);
      incomeFor = unlocked.size;
    }
    // Waiting on a long build (the landmark's hours): the player comes back when it's done, and the farm earned
    // offline meanwhile (at the manager's full rate, once there is one).
    if (finishing.size > 0) {
      const wait = Math.max(...finishing.values()) - t;
      if (wait > AWAY_AFTER_SECONDS) {
        const rules = TUNING.offline;
        const rate = unlocked.has('manager') ? rules.managerRate : rules.rate;
        cash += income * rate * Math.min(wait, (rules.capHours[0] ?? 0) * 3600);
        awaySeconds += wait;
        for (const [id] of finishing) unlocked.add(id);
        finishing.clear();
        continue;
      }
    }
    cash += income * opts.step;
  }
  const pads = town.pads.map((p) => ({
    id: p.id,
    name: p.name,
    cost: p.cost,
    targetMinute: p.targetMinute,
    boughtMinute: bought.has(p.id) ? Math.round((bought.get(p.id)! / 60) * 10) / 10 : null,
  }));
  return { pads, finalIncomePerMinute: Math.round(income * 60), awayMinutes: Math.round(awaySeconds / 60) };
}
