// A boardwalk town (Chapter 2, Beach Boardwalk): no cars. Tourists walk up
// to kiosks along the boardwalk; the hero serves them from behind the
// counter until staff take over. The shared pieces (the player, pads, cash
// piles, upgrades, staff, the camera, the side bar, the hero's career and
// the town's story) are the same as in the car wash town.
import { Vector3, type Object3D } from 'three';
import { Loop } from './loop';
import { GameClock } from './clock';
import { CHARACTERS, TUNING, UPGRADES, fixedSolids, type Rect } from './config';
import type { Game } from './game';
import type { GameState } from './gameState';
import type { Lifecycle } from './lifecycle';
import type { SaveManager } from './save';
import type { BoardwalkTown } from './towns';
import { createMeta } from './meta';
import { createTown } from './town';
import { createPress } from './press';
import { createHero } from './hero';
import { createStoryline } from './storyline';
import { LotView, SIDE_BAR_PX } from './view';
import * as platform from '../platform/youtube';
import type { SoundManager } from '../audio/sound';
import type { Stage } from '../render/stage';
import { withShadows } from '../render/stage';
import { CameraRig } from '../render/cameraRig';
import { Particles } from '../render/effects/particles';
import { beachGround } from '../render/beach';
import { loadPeople } from '../render/assets';
import { blobShadows } from '../render/models/actors';
import { BOARDWALK_SOLIDS, boardwalkPadModel } from '../render/models/boardwalk';
import { PersonAvatar } from '../render/models/person';
import { ConstructionSites } from '../render/models/site';
import { unlockedSum } from '../systems/arrivals';
import { perk } from '../systems/career';
import { CashSystem } from '../systems/cash';
import { takeFinished } from '../systems/construction';
import { levelFactor, levelStep, nextStars, ticketPay, tipFor } from '../systems/economy';
import { Input } from '../systems/input';
import { IncomeTracker } from '../systems/offline';
import { PadSystem } from '../systems/pads';
import { Player } from '../systems/player';
import { StaffSystem } from '../systems/staff';
import { insideRect } from '../systems/stations';
import type { Paid } from '../systems/till';
import { UpgradePads } from '../systems/upgrades';
import { WalkUps, type ServedTourist, type Tourist, type WalkUpCounter } from '../systems/walkups';
import { Floaters } from '../ui/carBubbles';
import { EdgePointer } from '../ui/edgePointer';
import { GuideHand, type GuideStep } from '../systems/guide';
import { showEndScreen } from '../ui/endScreen';
import { openEmpireMap } from '../ui/empireMap';
import { Hud } from '../ui/hud';
import { t } from '../ui/strings';
import { UpgradePanel } from '../ui/upgradePanel';
import { WorldLabels } from '../ui/worldLabels';

/** A new building grows into place over this long. */
const REVEAL_SECONDS = 0.6;
/** Upgrade pads appear once the beach has some shade (one thing at a time). */
const UPGRADES_AFTER = 'parasols';

export function createBoardwalkGame(
  container: HTMLElement,
  stage: Stage,
  state: GameState,
  lifecycle: Lifecycle,
  saves: SaveManager,
  sound: SoundManager,
  travelTo: (id: string) => Promise<void>,
  current: BoardwalkTown,
): Game {
  const { layout } = current;
  // Everything this town puts on the page goes in here, so leaving the town removes it all at once.
  const root = document.createElement('div');
  root.className = 'game-root';
  container.prepend(root);
  const cleanups: (() => void)[] = [];
  stage.shadowArea({ ...layout.lot, minZ: layout.walk.minZ });
  const clock = new GameClock();
  const tickers: ((dt: number) => void)[] = [];
  const rig = new CameraRig(stage.camera);
  const labels = new WorldLabels(root);
  const hud = new Hud(root, state.cash);
  const input = new Input(root, lifecycle);
  const effects = new Particles(stage.scene);
  blobShadows.attach(stage.scene);
  const ground = beachGround(layout);
  stage.scene.add(ground.group);

  const level = (key: string) => state.levels[key] ?? 0;
  const player = new Player(stage.scene, layout.playerStart, TUNING.player, () => 1 + levelStep(UPGRADES.kinds.walk, level('player.walk')) + perk(state, 'walk'));
  player.onFootstep(() => sound.play('step'));
  const cash = new CashSystem(stage.scene, layout, TUNING.cash, state, effects, sound);
  const floaters = new Floaters(labels);
  const income = new IncomeTracker(TUNING.offline.incomeWindowSeconds, state.autoRate);
  const flag = (name: string): void => {
    if (state.flags.includes(name)) return;
    state.flags.push(name);
    void saves.saveNow();
  };

  // The buildings: each pad's model grows into place, and what's solid about it stops the player.
  const solids: Rect[] = [];
  const growing: { mesh: Object3D; age: number }[] = [];
  const showBuilding = (id: string, animate: boolean): void => {
    const at = layout.buildAt[id] ?? layout.pads[id];
    const mesh = boardwalkPadModel(id);
    if (!mesh || !at) return;
    mesh.position.set(at.x, 0, at.z);
    stage.scene.add(withShadows(mesh));
    if (animate) {
      mesh.scale.setScalar(0.001);
      growing.push({ mesh, age: 0 });
    }
    for (const [hw, hd, dx = 0, dz = 0] of BOARDWALK_SOLIDS[id] ?? []) {
      solids.push({ minX: at.x + dx - hw, maxX: at.x + dx + hw, minZ: at.z + dz - hd, maxZ: at.z + dz + hd });
    }
    stage.refreshShadows();
  };

  // Tourists: drawn once their models load (they're not in the first download).
  let made = 0;
  let peopleReady = false;
  const makeAvatar = () => {
    if (!peopleReady) return null;
    const avatar = new PersonAvatar(CHARACTERS.tourists[made++ % CHARACTERS.tourists.length]!, 'bag');
    stage.scene.add(avatar.root);
    return avatar;
  };
  const onPaid = (paid: Paid): void => {
    if (paid.automated) income.add(clock.now, paid.amount);
    else flag(`served:${current.id}`);
    meta.onPaid(paid);
    town.onPaid(paid);
  };
  const onServed = ({ tourist, counter }: ServedTourist): void => {
    const quality = levelFactor(UPGRADES.kinds.quality, level(`${counter.id}.quality`));
    const bonus = 1 + unlockedSum(state, (e) => e.payBonus);
    const pay = Math.round(ticketPay({ basePay: tourist.basePay }, [], tourist.served, quality) * bonus);
    const tip = tipFor(pay, tourist.patience / tourist.patienceMax, TUNING.customers);
    cash.add(counter.id, pay + tip);
    const at = layout.piles[counter.id] ?? counter.at;
    floaters.show(`+$${pay}`, new Vector3(at.x, 1.2, at.z), 'cash');
    if (tip > 0) floaters.show(`+$${tip} tip`, new Vector3(at.x + 0.6, 1.9, at.z), 'tip');
    state.stars = nextStars(state.stars, tip > 0 ? 'happy' : 'okay', TUNING.stars);
    sound.play('ching');
    onPaid({ amount: pay + tip, tip, automated: !tourist.manual, at });
  };
  const onGaveUp = (tourist: Tourist): void => {
    state.stars = nextStars(state.stars, 'angry', TUNING.stars);
    floaters.show('😠', new Vector3(tourist.at.x, 2.2, tourist.at.z), 'star');
    sound.play('pop');
  };
  const walkups = new WalkUps(
    layout,
    state,
    TUNING.tourists as { spawnSeconds: number; patience: number; walkSpeed: number; pay: [number, number] },
    () => unlockedSum(state, (e) => e.arrivalBonus),
    () => unlockedSum(state, (e) => e.patienceBonus),
    makeAvatar,
    onServed,
    onGaveUp,
  );
  loadPeople(CHARACTERS.tourists)
    .then(() => {
      peopleReady = walkups.open = true;
      if (!state.flags.includes(`served:${current.id}`)) walkups.parkFirst();
    })
    .catch((error) => platform.logWarning(error));

  const staff = new StaffSystem(stage.scene, layout, state, labels, cash);
  const addBuilt = (id: string, animate: boolean): void => {
    showBuilding(id, animate);
    const kind = current.pads.find((p) => p.id === id)?.effects.counter;
    if (kind) walkups.addCounter(id, kind, labels);
    staff.hire(id);
  };
  for (const id of state.unlocked) addBuilt(id, false);

  const sites = new ConstructionSites(stage.scene, labels, layout);
  for (const id of Object.keys(state.building)) sites.show(id);
  const pads = new PadSystem(
    stage.scene,
    layout,
    TUNING.pads,
    state,
    effects,
    sound,
    labels,
    (id) => {
      addBuilt(id, true);
      view.refit();
      void saves.saveNow();
      const effects = current.pads.find((p) => p.id === id)?.effects;
      if (effects?.endOfContent) {
        flag(`ended:${current.id}`);
        showEndScreen(root, () => meta.screenClosed(), { title: t('endTitleBeach'), body: t('endBodyBeach') });
      }
    },
    (id) => {
      sites.show(id);
      view.refit();
      void saves.saveNow();
    },
  );
  const finishBuilds = (): void => {
    for (const id of takeFinished(state, Date.now())) {
      sites.remove(id);
      pads.finishConstruction(id);
    }
  };

  const panel = new UpgradePanel(root, (key) => upgrades.buy(key), () => {});
  const upgrades = new UpgradePads(
    stage.scene,
    layout,
    state,
    panel,
    labels,
    sound,
    effects,
    () => {
      meta.onUpgrade();
      void saves.saveNow();
    },
    UPGRADES_AFTER,
  );

  const view = new LotView(stage, rig, layout, state, () => [...(pads.footprint ? [pads.footprint] : []), ...upgrades.footprints()]);
  view.fitScreen();
  // Builds the free first kiosk before the first frame.
  pads.update(0, player.position);
  view.refit(player.position);
  stage.onResize(() => {
    view.fitScreen();
    rig.snap(player.position);
  });

  /** How hard each counter is worked this frame: the hero behind it, or a worker (the faster counts), sped up by its upgrade. */
  const work = (counter: WalkUpCounter): { rate: number; byPlayer: boolean } => {
    const byStaff = staff.rateFor(counter);
    const byPlayer = insideRect(player.position, counter.zone) ? 1 : 0;
    const speed = levelFactor(UPGRADES.kinds.speed, level(`${counter.id}.speed`));
    return { rate: Math.max(byStaff, byPlayer) / speed, byPlayer: byPlayer > 0 && byPlayer >= byStaff };
  };
  const pointer = new EdgePointer(root);
  // A pointing hand for a newcomer to the boardwalk: behind the counter to serve the first tourist,
  // then to their cash, then to the next pad, until the first scooper is hired.
  const hand = new GuideHand(labels);
  const servedFlag = `served:${current.id}`;
  const guide = (): GuideStep | null => {
    if (state.unlocked.includes('scooper')) return null;
    const waiting = walkups.counters.find((c) => c.front);
    if (!state.flags.includes(servedFlag)) return waiting ? { at: waiting.at, text: 'guideServe' } : null;
    const pile = cash.fullestPile();
    if (pile) return { at: pile.at, text: 'guideCash' };
    const next = pads.next;
    return next && state.cash >= next.owed ? { at: next.at, text: 'guideBuild' } : null;
  };
  const meta = createMeta({ root, state, saves, sound, traffic: null, pads, supplies: null, setBoost: (m) => (walkups.boost = m) });
  const town = createTown({
    root,
    scene: stage.scene,
    layout,
    state,
    labels,
    sound,
    save: () => void saves.saveNow(),
    rewarded: (id) => meta.rewarded(id),
  });
  const press = createPress(root, sound, () => meta.screenClosed());
  const empireMap = (): void => openEmpireMap({ root, state, sound, town: current, travel: (id) => travelTo(id) });
  const hero = createHero({ root, state, town: current, sound, press, flag, save: () => saves.saveNow(), onChipTap: empireMap });
  const storyline = createStoryline({ state, town: current, press, arrivals: walkups, flag });

  let rateTimer = 0;
  let buildTimer = 0;
  const fixed = fixedSolids(layout);
  const loop = new Loop((dt) => {
    clock.advance(dt);
    state.playSeconds += dt;
    player.update(dt, input.read(), [...solids, ...fixed], view.walkable);
    pads.update(dt, player.position);
    upgrades.update(dt, player.position);
    staff.update(dt, walkups.counters, null, solids, (counter) => insideRect(player.position, counter.zone), null, []);
    player.scrubbing = walkups.update(dt, work);
    if (cash.update(player.position)) flag('collected');
    floaters.update(dt);
    buildTimer -= dt;
    if (buildTimer <= 0) {
      buildTimer = 0.5;
      finishBuilds();
    }
    sites.update(state, Date.now());
    rateTimer += dt;
    if (rateTimer >= 5) {
      rateTimer = 0;
      state.autoRate = income.perMinute(clock.now);
    }
    for (const g of [...growing]) {
      g.age = Math.min(REVEAL_SECONDS, g.age + dt);
      const k = g.age / REVEAL_SECONDS - 1;
      g.mesh.scale.setScalar(Math.max(0.001, 1 + 2.9 * k * k * k + 1.9 * k * k));
      if (g.age >= REVEAL_SECONDS) growing.splice(growing.indexOf(g), 1);
    }
    if (growing.length > 0) stage.refreshShadows();
    ground.update(dt);
    effects.update(dt);
    saves.update(dt);
    meta.update(dt);
    storyline.update(dt);
    hero.update(dt);
    press.update(dt);
    town.update(dt, player.position);
    view.update(dt, player.position);
    blobShadows.update();
    stage.render();
    labels.update(stage.camera, stage.size.width, stage.size.height);
    const step = guide();
    hand.point(step);
    const next = pads.next;
    const goal = step?.at ?? (next && state.cash >= next.owed ? next.at : null);
    pointer.update(stage.camera, stage.size.width, stage.size.height, goal, { top: view.topInset, right: SIDE_BAR_PX });
    hud.update(dt, state.cash, state.stars, state.gems);
    for (const ticker of tickers) ticker(dt);
  });

  // Any tap or key unlocks audio (browsers need a gesture first).
  const unlockAudio = (): void => {
    if (!lifecycle.paused) sound.unlock();
  };
  root.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
  cleanups.push(() => window.removeEventListener('keydown', unlockAudio));
  cleanups.push(
    lifecycle.onPause(() => {
      loop.stop();
      root.classList.add('is-paused');
      sound.setPaused(true);
      void saves.saveNow();
    }),
    lifecycle.onResume(() => {
      root.classList.remove('is-paused');
      sound.setPaused(false);
      loop.start();
    }),
  );

  return {
    stage,
    clock,
    player,
    traffic: null,
    staff,
    welcomeBack: (earned) => meta.welcomeBack(earned),
    get frameMs() {
      return loop.busyMs;
    },
    renderOnce() {
      stage.renderer.compile(stage.scene, stage.camera);
      blobShadows.update();
      stage.render();
      labels.update(stage.camera, stage.size.width, stage.size.height);
    },
    start() {
      if (!lifecycle.paused) loop.start();
    },
    addTicker: (ticker) => void tickers.push(ticker),
    dispose() {
      loop.stop();
      for (const cleanup of cleanups) cleanup();
      input.dispose();
      panel.dispose();
      stage.reset();
      blobShadows.detach();
      tickers.length = 0;
      root.remove();
    },
  };
}
