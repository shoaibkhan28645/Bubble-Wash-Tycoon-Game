// Everything around the core loop: rewarded boosts, the daily calendar and
// missions, the Car of the Day, and the ads that go with screen changes.
import * as platform from '../platform/youtube';
import { ADS, DAILY, padById, type CarDef } from './config';
import type { GameState } from './gameState';
import type { SaveManager } from './save';
import type { SoundManager } from '../audio/sound';
import { hasModel, loadModel, specialCarFile } from '../render/assets';
import { Ads } from '../systems/ads';
import { finishGems, formatClock, halveBuild, secondsLeft, soonestBuild } from '../systems/construction';
import { addProgress, carOfDay, claimable, claimCalendar, claimMission, localDate, rollDay, type MissionKind, type MissionTown } from '../systems/daily';
import { sideButtonOpen, tutorialActive } from '../systems/guide';
import type { PadSystem } from '../systems/pads';
import type { Supplies } from '../systems/supplies';
import type { Paid, Traffic } from '../systems/traffic';
import { showCalendar, showMissions } from '../ui/dailyPanels';
import { offer, setUiSound, toast } from '../ui/dialog';
import { SideBar, type SideAction } from '../ui/sideBar';
import { t } from '../ui/strings';
import { showWelcomeBack } from '../ui/welcomeBack';

/** Check the date this often, so missions roll over at local midnight. */
const DATE_CHECK_SECONDS = 20;
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
}

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
}): Meta {
  const { root, state, saves, sound, traffic, pads, supplies } = deps;
  const town = deps.town ?? 'carWash';
  const ads = new Ads(platform, () => state.playSeconds);
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

  const rewards: Record<Exclude<SideAction, 'calendar' | 'missions'>, () => Promise<void>> = {
    speed: async () => {
      if (state.boostSeconds > 0) return;
      if (!(await earn('speed-boost', '⚡', t('speedTitle'), t('speedBody'), ADS.speedBoost.gems))) return;
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
      if (claimCalendar(state, today) > 0) {
        sound.play('reward');
        save();
      }
    });
  };

  const sideBar = new SideBar(root, (action) => {
    sound.play('click');
    if (action === 'calendar') openCalendar();
    else if (action === 'missions') {
      showMissions(root, state, (i) => {
        if (claimMission(state, i) > 0) {
          sound.play('reward');
          save();
        }
      });
    } else void rewards[action]();
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
    (action !== 'missions' || state.daily.missions.length > 0);

  const progress = (kind: Parameters<typeof addProgress>[1], amount = 1): void => {
    // Missions open with the Mini-Mart; until then they count quietly.
    if (addProgress(state, kind, amount).length === 0 || !available('missions')) return;
    toast(root, `✅ ${t('missionDone')}`);
    sound.play('mission');
  };

  return {
    update(dt) {
      sessionSeconds += dt;
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
        }
      }
      updateDayCar();
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
  };
}
