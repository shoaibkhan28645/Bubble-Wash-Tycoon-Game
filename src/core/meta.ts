// Everything around the core loop: rewarded boosts, the daily calendar and
// missions, the Car of the Day, and the ads that go with screen changes.
import { Vector3 } from 'three';
import * as platform from '../platform/youtube';
import { ADS, CHARACTERS, DAILY, padById, type CarDef } from './config';
import type { GameState } from './gameState';
import type { SaveManager } from './save';
import type { SoundManager } from '../audio/sound';
import { hasModel, loadModel, specialCarFile } from '../render/assets';
import type { Particles } from '../render/effects/particles';
import { setBrand } from '../render/brand';
import { HeroPreview, type PreviewTarget } from '../render/heroPreview';
import { thumbnailsFor } from '../render/thumbnails';
import { PersonAvatar } from '../render/models/person';
import type { Stage } from '../render/stage';
import type { TownDecor } from '../render/townDecor';
import { Ads } from '../systems/ads';
import { finishGems, formatClock, halveBuild, secondsLeft, soonestBuild } from '../systems/construction';
import { money } from '../systems/economy';
import { addProgress, carOfDay, claimable, claimCalendar, claimMission, daysToGift, localDate, rollDay, type MissionKind, type MissionTown } from '../systems/daily';
import { sideButtonOpen, tutorialActive } from '../systems/guide';
import type { PadSystem } from '../systems/pads';
import type { Player } from '../systems/player';
import type { Supplies } from '../systems/supplies';
import type { Paid, Traffic } from '../systems/traffic';
import { brandColours, claimAdGems, claimGift, collectEarned, featuredAffordable, lookWith, owns, rollFeatured, shopItem, shownTitle, townDecor, type Slot } from '../systems/wardrobe';
import { showCalendar, showMissions } from '../ui/dailyPanels';
import { offer, setUiSound, toast } from '../ui/dialog';
import type { Hud } from '../ui/hud';
import type { WorldLabels } from '../ui/worldLabels';
import { openShop, type BoostView, type ShopTab } from '../ui/shopPanel';
import { SideBar, type SideAction } from '../ui/sideBar';
import { t } from '../ui/strings';
import { showWelcomeBack } from '../ui/welcomeBack';

/** Check the date this often, so missions roll over at local midnight. */
const DATE_CHECK_SECONDS = 20;
/** How high over the hero's feet their title tag floats (metres: above the tallest hat). */
const TITLE_HEIGHT = 3.1;
/** Earned things (a rank, a finished town, a prize ribbon) are looked for this often. */
const EARN_CHECK_SECONDS = 2;
/** The refill offer stays up this long after a station runs dry, so it doesn't vanish under a finger. */
const REFILL_LINGER_SECONDS = 4;

export interface Meta {
  update(dt: number): void;
  /** A car paid (or a snack was sold): counts towards missions. */
  onPaid(paid: Paid): void;
  onUpgrade(): void;
  /** Something a town's own missions count (a full ride, a fix…). */
  count(kind: MissionKind, amount?: number): void;
  /** Offline earnings screen (already banked), with Collect 2×; an interstitial may follow. */
  welcomeBack(earned: { cash: number; seconds: number }): void;
  /** A screen was closed (end of content): an interstitial may play. */
  screenClosed(): void;
  /** Plays a rewarded ad for a button the player tapped; true if watched to the end. */
  rewarded(rewardId: string): Promise<boolean>;
  /** Offers to double a golden rush job's pay (an ad, or gems): true if the player earned it. */
  doubleJob(pay: number): Promise<boolean>;
  /** Opens the boutique (the hero's looks, and the gem boosts). */
  openShop(tab?: ShopTab): void;
}

/** Where the stand-in for the staff (the brand's close-up) may stand, beside the hero (metres east and south of them). */
const STAND_IN_SPOTS: readonly (readonly [number, number])[] = [
  [1.3, 0.4],
  [-1.3, 0.4],
  [1.1, 1.3],
  [-1.1, 1.3],
  [0, 1.6],
  [1.4, -0.9],
  [-1.4, -0.9],
];
/** And which way they may face (the close-up stands in front of them): towards the game camera first. */
const STAND_IN_YAWS = [0, 0.8, -0.8, Math.PI / 2, -Math.PI / 2, Math.PI];

export function createMeta(deps: {
  root: HTMLElement;
  state: GameState;
  saves: SaveManager;
  sound: SoundManager;
  /** The car wash town's cars (the VIP convoy, the Car of the Day); null in a town without cars. */
  traffic: Traffic | null;
  pads: PadSystem;
  /** Station supplies (the instant refill); null in a town without them. */
  supplies: Supplies | null;
  /** Sets how much faster everyone works (the rewarded speed boost). */
  setBoost: (multiplier: number) => void;
  /** The kind of town, for its own daily missions (the car wash's when not given). */
  town?: MissionTown;
  /** The park's rides: how many have broken down, and fixing them all (the rewarded fix). */
  rides?: { broken: () => number; fixAll: () => void };
  /** The park's prize shelf: how many plush toys it has (-1 before there's a ring toss), and opening it. */
  shelf?: { count: () => number; open: () => void };
  /** The airport's control tower (once it's built): its button's badge, and opening its flight cards. */
  tower?: { badge: () => string | null; open: () => void };
  /**
   * What the hero's carrying on their back (not a rush job's things): how many, and putting it all down (back
   * where it came from, where that matters).
   */
  discard?: { count: () => number; drop: () => void };
  /**
   * The boutique's things: the hero (dressed from it), the HUD (its gem counter opens it), the stage (it
   * draws the close-up), the effects (the trail) and the town's decorations.
   */
  hero: { player: Player; hud: Hud; stage: Stage; effects: Particles; decor: TownDecor; labels: WorldLabels };
}): Meta {
  const { root, state, saves, sound, traffic, pads, supplies } = deps;
  const town = deps.town ?? 'carWash';
  const ads = new Ads(platform, () => state.playSeconds);
  // The speed boost, in words for this town: what it speeds up here (the car wash's washes, the farm's and the
  // park's counters, the airport's whole crew).
  const speedTitle = t(town === 'carWash' ? 'speedTitle' : `speedTitle_${town}`);
  const speedBody = t(town === 'carWash' ? 'speedBody' : `speedBody_${town}`);
  let today = localDate(new Date());
  rollDay(state, today, town);
  let dateTimer = 0;
  let sessionSeconds = 0;
  let convoyReadyAt = 0;
  let calendarShown = false;
  let dayCarLoading = false;
  let dialogOpen = false;
  let refillUntil = 0;

  const save = () => void saves.saveNow();
  setUiSound((name) => sound.play(name));

  /** Pays for a reward with a rewarded ad or gems, as the player chose: how it was earned, or null. */
  const earn = async (rewardId: string, icon: string, title: string, body: string, gems: number, noAd = false): Promise<'ad' | 'gems' | null> => {
    if (dialogOpen || ads.busy) return null;
    dialogOpen = true;
    const choice = await offer(root, { icon, title, body, gems, haveGems: state.gems, noAd });
    dialogOpen = false;
    if (choice === 'gems' && state.gems >= gems) {
      state.gems -= gems;
      return 'gems';
    }
    if (choice !== 'ad') return null;
    const ok = await ads.rewarded(rewardId);
    if (!ok) toast(root, t('adFailed'));
    return ok ? 'ad' : null;
  };

  const rewards: Record<Exclude<SideAction, 'calendar' | 'missions' | 'shelf' | 'shop' | 'tower' | 'discard'>, () => Promise<void>> = {
    fix: async () => {
      const rides = deps.rides;
      if (!rides || rides.broken() === 0) return;
      if (!(await earn('fix-rides', '🔧', t('fixTitle'), t('fixBody'), ADS.fixRides.gems))) return;
      rides.fixAll();
      sound.play('reward');
      save();
    },
    speed: async () => {
      if (state.boostSeconds > 0) return;
      if (!(await earn('speed-boost', '⚡', speedTitle, speedBody, ADS.speedBoost.gems))) return;
      state.boostSeconds = ADS.speedBoost.seconds;
      sound.play('reward');
      save();
    },
    convoy: async () => {
      if (!traffic || sessionSeconds < convoyReadyAt) return;
      if (!(await earn('vip-convoy', '👑', t('convoyTitle'), t('convoyBody'), ADS.convoy.gems))) return;
      traffic.arrivals.callConvoy(ADS.convoy.cars);
      convoyReadyAt = sessionSeconds + ADS.convoy.cooldownSeconds;
      save();
    },
    refill: async () => {
      if (!supplies) return;
      if (!(await earn('instant-supply', '🧴', t('refillTitle'), t('refillBody'), ADS.refill.gems))) return;
      supplies.fillAll();
      sound.play('reward');
      save();
    },
    build: async () => {
      const next = soonestBuild(state);
      if (!next) return;
      const left = secondsLeft(next.build, Date.now());
      const title = t('buildTitle', { name: padById(next.id)?.name ?? next.id });
      const body = t(next.build.halved ? 'buildBodyHalved' : 'buildBody', { time: formatClock(left) });
      const how = await earn('halve-build', '🚧', title, body, finishGems(left), next.build.halved);
      if (!how) return;
      // The ad halves what's left (from now, after it played); gems finish it.
      if (how === 'ad') halveBuild(next.build, Date.now());
      else next.build.endsAt = Date.now();
      sound.play('reward');
      save();
    },
    finish: async () => {
      const name = pads.nextName;
      if (!pads.nearlyAffordable(ADS.finishPad.fraction)) return;
      if (!(await earn('finish-pad', '🏗️', t('finishTitle'), t('finishBody', { pad: name }), ADS.finishPad.gems))) return;
      if (pads.nearlyAffordable(ADS.finishPad.fraction)) pads.finishNow();
    },
  };

  const openCalendar = (): void => {
    showCalendar(root, state, today, () => {
      // The 7th day's chest also brings the weekly gift from the boutique.
      const chest = !!DAILY.calendar[state.daily.loginDay % DAILY.calendar.length]?.chest;
      if (claimCalendar(state, today) > 0) {
        sound.play('reward');
        const gift = chest ? claimGift(state) : null;
        if (gift) {
          toast(root, `🎁 ${t('giftClaimed', { name: gift.name })}`);
          showLooks(null, null);
        }
        save();
      }
    });
  };

  // The boutique's looks: the hero's outfit, hat and trail, the brand colour on the staff and the farm's
  // vehicles, and this town's decorations; put on as the town opens, and tried on in the shop.
  const { player, hud, stage, effects, decor, labels } = deps.hero;
  // The earned title (a completed set's), on a little tag over the hero's head.
  const titleTag = document.createElement('div');
  titleTag.className = 'hero-title';
  const titleAt = new Vector3();
  const titleLabel = labels.add(titleTag, titleAt);
  let titleShown: string | null | undefined;
  player.effects = effects;
  const preview = new HeroPreview(stage, player.mesh);
  const thumbnails = thumbnailsFor(stage.renderer);

  /**
   * Where the close-up looks for a decoration in this town (null: it's elsewhere, or not up): all of it,
   * from in front and steeply above like the game's own camera (clear of hedges and walls in front); a
   * string of bunting from lower down, so its flags face the camera.
   */
  const decorView = (id: string): PreviewTarget | null => {
    const def = shopItem(id);
    if (def?.slot !== 'decor' || def.town !== state.currentTown) return null;
    const ball = decor.frame(def);
    const r = Math.max(1.2, ball.radius);
    const flags = !!def.to;
    return flags ? { spot: ball.center, look: 0, eye: r * 0.5, distance: r * 2.4 } : { spot: ball.center, look: 0, eye: r * 2.2, distance: r * 2.0 };
  };

  // A member of staff stands by the hero to show off the brand (only while the shop shows it): in a spot the
  // close-up can see clearly. (The real staff stand behind counters, drive vans and go indoors, out of sight.)
  let mannequin: PersonAvatar | null = null;
  const staffModel = (): PreviewTarget => {
    if (!mannequin) {
      mannequin = new PersonAvatar(Object.values(CHARACTERS.staff)[0]!);
      stage.scene.add(mannequin.root);
    }
    const hero = player.mesh.position;
    const skip = [mannequin.root, player.mesh];
    const place = new Vector3();
    // Beside the hero, seen from the game camera's side first (the open ground the player can see), then turned.
    let chosen: { x: number; z: number; yaw: number } | null = null;
    search: for (const yaw of STAND_IN_YAWS)
      for (const [x, z] of STAND_IN_SPOTS) {
        place.set(hero.x + x, hero.y, hero.z + z);
        if (preview.canSee(place, yaw, skip)) {
          chosen = { x, z, yaw };
          break search;
        }
      }
    const { x, z, yaw } = chosen ?? { x: STAND_IN_SPOTS[0]![0], z: STAND_IN_SPOTS[0]![1], yaw: 0 };
    mannequin.root.position.set(hero.x + x, hero.y, hero.z + z);
    mannequin.root.rotation.y = yaw;
    mannequin.root.visible = true;
    return { person: mannequin.root };
  };

  /** Shows the looks as saved, with one item tried on over them (the shop), and points the close-up at it. */
  const showLooks = (slot: Slot | null, id: string | null): void => {
    const look = lookWith(state, slot === 'outfit' || slot === 'hat' || slot === 'trail' ? { slot, id } : null);
    player.dress(look);
    setBrand(brandColours(state, slot === 'brand' && id ? id : undefined));
    // A decoration not bought yet shows while it's tried on; one that's owned shows only if it's up.
    decor.sync(townDecor(state, state.currentTown, slot === 'decor' && id && !owns(state, id) ? id : null), look.hat?.id ?? null);
    if (mannequin) mannequin.root.visible = false;
    preview.focus(slot === 'brand' ? staffModel() : slot === 'decor' && id ? decorView(id) : null);
  };
  showLooks(null, null);
  rollFeatured(state, today);

  /** Things earned since the last look (a town finished, a rank, a ribbon, a whole set): handed over with a cheer. */
  let earnTimer = 0;
  const checkEarned = (): void => {
    const { items, sets } = collectEarned(state);
    if (items.length === 0) return;
    for (const item of items) if (!sets.some((set) => set.reward === item.id)) toast(root, `🏅 ${t('earnedItem', { name: item.name })}`);
    for (const set of sets) toast(root, `📖 ${t('setDone', { set: set.name, title: set.title })}`);
    sound.play('reward');
    if (!shopOpen) showLooks(null, null);
    save();
  };
  let shopOpen = false;

  /** The gem boosts this town has, each with why it can't be used right now. */
  const boosts = (): BoostView[] => {
    const list: BoostView[] = [];
    const add = (action: Exclude<SideAction, 'calendar' | 'missions' | 'shelf' | 'shop' | 'tower' | 'discard'>, view: Omit<BoostView, 'use'>): void => {
      if (available(action)) list.push({ ...view, use: () => void rewards[action]() });
    };
    add('speed', { icon: '⚡', title: speedTitle, body: speedBody, gems: ADS.speedBoost.gems, status: state.boostSeconds > 0 ? t('boostOn', { time: formatClock(state.boostSeconds) }) : '' });
    if (traffic) {
      const wait = convoyReadyAt - sessionSeconds;
      add('convoy', { icon: '👑', title: t('convoyTitle'), body: t('convoyBody'), gems: ADS.convoy.gems, status: wait > 0 ? t('boostWait', { time: formatClock(wait) }) : '' });
    }
    if (supplies) add('refill', { icon: '🧴', title: t('refillTitle'), body: t('refillBody'), gems: ADS.refill.gems, status: supplies.anyShort() ? '' : t('boostFull') });
    if (deps.rides) add('fix', { icon: '🔧', title: t('fixTitle'), body: t('fixBody'), gems: ADS.fixRides.gems, status: deps.rides.broken() > 0 ? '' : t('boostNoFix') });
    const next = soonestBuild(state);
    const left = next ? secondsLeft(next.build, Date.now()) : 0;
    add('build', {
      icon: '🚧',
      title: next ? t('buildTitle', { name: padById(next.id)?.name ?? next.id }) : t('boostBuild'),
      body: next ? t(next.build.halved ? 'buildBodyHalved' : 'buildBody', { time: formatClock(left) }) : t('boostBuildBody'),
      gems: next ? finishGems(left) : 0,
      noAd: !!next?.build.halved,
      status: next ? '' : t('boostNoBuild'),
    });
    add('finish', { icon: '🏗️', title: t('finishTitle'), body: t('finishBody', { pad: pads.nextName }), gems: ADS.finishPad.gems, status: pads.nearlyAffordable(ADS.finishPad.fraction) ? '' : t('boostNoFinish') });
    return list;
  };

  const showShop = (tab?: ShopTab): void => {
    if (shopOpen || dialogOpen) return;
    shopOpen = true;
    rollFeatured(state, today);
    // Opened today: the gem counter's dot is for something new.
    state.wardrobe.seen = today;
    openShop(
      {
        root,
        state,
        town: state.currentTown,
        tryOn: showLooks,
        preview: (element) => {
          preview.show(element);
          player.posing = !!element;
          if (!element) shopOpen = false;
        },
        boosts,
        bought: (item) => {
          checkEarned();
          sound.play('reward');
          effects.burst('confetti', player.mesh.position.clone().setY(2.2), 24, 3.5, 0.6);
          toast(root, `🛍️ ${t('shopBought', { name: item.name })}`);
          save();
        },
        changed: () => {
          save();
          // Something bought may complete a set.
          checkEarned();
        },
        click: () => sound.play('click'),
        picture: (item) => (item.slot === 'hat' ? thumbnails.of({ hat: item.id }) : item.slot === 'decor' ? thumbnails.of({ decor: item.id, ...(item.to ? { to: item.to } : {}) }) : null),
        today,
        giftInDays: daysToGift(state, today),
        watchForGems: async () => {
          if (ads.busy) return false;
          const ok = await ads.rewarded('gems');
          if (!ok) {
            toast(root, t('adFailed'));
            return false;
          }
          const gems = claimAdGems(state, today);
          if (gems > 0) {
            sound.play('reward');
            toast(root, `💎 ${t('adGems', { gems })}`);
            save();
          }
          return gems > 0;
        },
      },
      tab,
    );
  };
  hud.onGems(() => {
    sound.play('click');
    showShop();
  }, () => available('shop'));

  const sideBar = new SideBar(root, (action) => {
    sound.play('click');
    if (action === 'calendar') openCalendar();
    else if (action === 'shop') showShop();
    else if (action === 'missions') {
      showMissions(root, state, (i) => {
        if (claimMission(state, i) > 0) {
          sound.play('reward');
          save();
        }
      });
    } else if (action === 'shelf') deps.shelf?.open();
    else if (action === 'tower') deps.tower?.open();
    else if (action === 'discard') {
      deps.discard?.drop();
      // (A little puff where they were, as it all goes.)
      const at = deps.hero.player.mesh.position;
      deps.hero.effects.burst('smoke', new Vector3(at.x, 1.3, at.z), 8, 1.6, 0.5);
      sound.play('drop');
    }
    else void rewards[action]();
  });

  /** The Car of the Day: once a day, a minute into a session, after the tutorial. */
  const updateDayCar = (): void => {
    if (!traffic || state.daily.carOfDayDate === today || tutorialActive(state) || sessionSeconds < DAILY.carOfDay.afterSeconds) return;
    const day = carOfDay(today);
    // The day's special loads when it's due.
    const file = specialCarFile(day.model);
    if (!hasModel(file.id)) {
      if (!dayCarLoading) {
        dayCarLoading = true;
        loadModel(file.id, file.path)
          .catch((error) => platform.logWarning(error))
          .finally(() => (dayCarLoading = false));
      }
      return;
    }
    const def: CarDef = {
      ...day,
      id: `day:${day.id}`,
      unlockedBy: null,
      dirt: 'muddy',
      basePay: 0,
      payMultiplier: DAILY.carOfDay.payMultiplier,
      patience: DAILY.carOfDay.patience,
      special: true,
    };
    if (!traffic.arrivals.addSpecial(def, DAILY.carOfDay.patience)) return;
    state.daily.carOfDayDate = today;
    toast(root, `🌟 ${t('carOfDay', { name: day.name })}`);
    save();
  };

  // Buttons for what this town has: no convoy without cars, no refill without supplies, no missions where there are none.
  const available = (action: SideAction): boolean =>
    sideButtonOpen(state, action) &&
    (action !== 'convoy' || !!traffic) &&
    (action !== 'refill' || !!supplies) &&
    (action !== 'missions' || state.daily.missions.length > 0) &&
    (action !== 'fix' || !!deps.rides) &&
    (action !== 'shelf' || !!deps.shelf) &&
    (action !== 'tower' || !!deps.tower) &&
    (action !== 'discard' || !!deps.discard);

  const progress = (kind: Parameters<typeof addProgress>[1], amount = 1): void => {
    // Missions open with the Mini-Mart; until then they count quietly.
    if (addProgress(state, kind, amount).length === 0 || !available('missions')) return;
    toast(root, `✅ ${t('missionDone')}`);
    sound.play('mission');
  };

  return {
    update(dt) {
      sessionSeconds += dt;
      preview.update(dt);
      if (mannequin?.root.visible) mannequin.update(dt, false, 0);
      if (supplies?.anyEmpty()) refillUntil = sessionSeconds + REFILL_LINGER_SECONDS;
      state.boostSeconds = Math.max(0, state.boostSeconds - dt);
      deps.setBoost(state.boostSeconds > 0 ? ADS.speedBoost.multiplier : 1);
      dateTimer -= dt;
      if (dateTimer <= 0) {
        dateTimer = DATE_CHECK_SECONDS;
        const now = localDate(new Date());
        if (now !== today) {
          today = now;
          rollDay(state, today, town);
          rollFeatured(state, today);
        }
      }
      updateDayCar();
      const title = shownTitle(state);
      if (title !== titleShown) {
        titleShown = title;
        titleTag.textContent = title ? `🏅 ${title}` : '';
        titleLabel.visible = !!title;
      }
      if (title) titleAt.set(player.mesh.position.x, TITLE_HEIGHT, player.mesh.position.z);
      earnTimer -= dt;
      if (earnTimer <= 0) {
        earnTimer = EARN_CHECK_SECONDS;
        checkEarned();
      }
      // The gem counter's dot: something featured today the gems would buy, and the shop not opened since.
      const fresh = available('shop') && state.wardrobe.seen !== today && featuredAffordable(state, today);
      hud.setDot(fresh);
      // Today's calendar reward pops up as a session opens (once the welcome-back
      // screen is closed), never in the middle of play; the 🎁 button pulses instead.
      const waiting = claimable(state, today);
      if (!calendarShown && sessionSeconds > 2 && !document.querySelector('.welcome-overlay')) {
        calendarShown = true;
        if (waiting.calendar && !tutorialActive(state) && !dialogOpen) openCalendar();
      }
      sideBar.update({
        calendar: waiting.calendar,
        missions: waiting.missions,
        speedLeft: state.boostSeconds,
        convoyWait: Math.max(0, convoyReadyAt - sessionSeconds),
        refill: sessionSeconds < refillUntil,
        finish: pads.nearlyAffordable(ADS.finishPad.fraction),
        fix: (deps.rides?.broken() ?? 0) > 0,
        shelf: deps.shelf?.count() ?? -1,
        tower: deps.tower ? (deps.tower.badge() ?? '') : null,
        discard: deps.discard?.count() ?? 0,
        shop: fresh,
        available,
        build: (() => {
          const next = soonestBuild(state);
          return next ? Math.max(1, secondsLeft(next.build, Date.now())) : 0;
        })(),
      });
    },
    onPaid(paid) {
      progress('earn', paid.amount);
      progress('parkEarn', paid.amount);
      progress('airEarn', paid.amount);
      const car = paid.car;
      if (!car) {
        if (paid.snack) progress('snack');
        return;
      }
      if (car.served.includes('fuel')) progress('fuel');
      if (car.served.includes('snack')) progress('snack');
      if (car.served.length > 1) progress('combo');
      if (!car.served.includes('wash')) return;
      progress('wash');
      if (!paid.automated) progress('handWash');
      if (paid.tip > 0) progress('tips');
      if (car.vip) progress('vip');
      if (car.def.id === 'monster') progress('monster');
      if (car.stages.some((s) => s.id === 'detail')) progress('detail');
    },
    count(kind, amount = 1) {
      progress(kind, amount);
    },
    onUpgrade() {
      progress('upgrade');
    },
    welcomeBack(earned) {
      save();
      showWelcomeBack(
        root,
        earned.cash,
        earned.seconds,
        async () => {
          const ok = await ads.rewarded('double-offline-cash');
          if (ok) {
            state.cash += earned.cash * (ADS.offline.multiplier - 1);
            save();
          } else toast(root, t('adFailed'));
          return ok;
        },
        () => {
          sound.play('coins');
          void ads.betweenScreens();
        },
      );
    },
    screenClosed() {
      void ads.betweenScreens();
    },
    rewarded: (rewardId) => ads.rewarded(rewardId),
    async doubleJob(pay) {
      return (await earn('double-job', '🌟', t('jobDoubleTitle'), t('jobDoubleBody', { cash: money(pay) }), ADS.jobDouble.gems)) !== null;
    },
    openShop: showShop,
  };
}
