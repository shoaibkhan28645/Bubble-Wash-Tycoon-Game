// The town's longer goals: the contracts board (walk up to it to see the
// contracts) and the town goals bar. Both count what paying cars got.
import { Vector3, type Scene } from 'three';
import type { LocationLayout, Point } from './config';
import type { GameState } from './gameState';
import type { SoundManager } from '../audio/sound';
import { PadModel } from '../render/models/padModel';
import { canDouble, claimContract, contractDone, countTask, readyCount, refreshBoard, tasksFor } from '../systems/contracts';
import { localDate } from '../systems/daily';
import { tutorialActive } from '../systems/guide';
import type { Paid } from '../systems/till';
import { allGoalsDone, checkGoals, claimGoal, goalsSummary } from '../systems/townGoals';
import { showContracts } from '../ui/contractsPanel';
import { toast } from '../ui/dialog';
import { GoalsBar, showGoals } from '../ui/goalsBar';
import { t } from '../ui/strings';
import type { WorldLabels } from '../ui/worldLabels';

/** The spot in front of the board that opens it, this far out from the board. */
const BOARD_SPOT_Z = 1.6;
const SPOT_RADIUS = 0.9;
/** Contract timers and goals are checked this often. */
const CHECK_SECONDS = 0.5;

export interface Town {
  update(dt: number, player: Point): void;
  onPaid(paid: Paid): void;
}

export function createTown(deps: {
  root: HTMLElement;
  scene: Scene;
  layout: LocationLayout;
  state: GameState;
  labels: WorldLabels;
  sound: SoundManager;
  save: () => void;
  /** Plays a rewarded ad; true if it was watched to the end. */
  rewarded: (rewardId: string) => Promise<boolean>;
}): Town {
  const { root, scene, layout, state, labels, sound, save, rewarded } = deps;
  const bar = new GoalsBar(root, () => {
    sound.play('click');
    showGoals(root, state, (id) => {
      if (claimGoal(state, id) > 0) {
        sound.play('reward');
        save();
      }
    });
  });
  let board: { at: Point; pad: PadModel; badge: HTMLElement } | null = null;
  let onSpot = false;
  let checkTimer = 0;
  let openGoals = allGoalsDone(state);

  /** The spot in front of the board, once it's built, with a badge for finished contracts. */
  const showBoard = (): void => {
    const at = layout.pads.board;
    if (board || !at || !state.unlocked.includes('board')) return;
    const spot = { x: at.x, z: at.z + BOARD_SPOT_Z };
    const pad = new PadModel(1.5, 0xffb800);
    pad.group.position.set(spot.x, 0, spot.z);
    scene.add(pad.group);
    const label = document.createElement('div');
    label.className = 'upgrade-icon contract-label';
    label.textContent = `📋 ${t('contractsSign')}`;
    const badge = document.createElement('span');
    badge.className = 'side-badge';
    badge.hidden = true;
    label.appendChild(badge);
    labels.add(label, new Vector3(spot.x, 0.3, spot.z + 1));
    board = { at: spot, pad, badge };
  };

  const openBoard = (): void => {
    const today = () => localDate(new Date());
    showContracts(
      root,
      () => ({ slots: state.contracts.slots, now: Date.now(), canDouble: canDouble(state, today()) }),
      async (i, double) => {
        const slot = state.contracts.slots[i];
        if (!slot || !contractDone(slot)) return;
        if (double && !(await rewarded('double-contract'))) {
          toast(root, t('adFailed'));
          return;
        }
        claimContract(state, i, Date.now(), double, today());
        sound.play('reward');
        save();
      },
    );
  };

  const check = (): void => {
    if (refreshBoard(state, Date.now())) save();
    if (checkGoals(state).length > 0) {
      toast(root, `🏁 ${t('goalDone')}`);
      sound.play('mission');
      save();
    }
    if (!openGoals && allGoalsDone(state)) {
      openGoals = true;
      toast(root, `🚚 ${t('goalsOpen')}`);
    }
    if (board) {
      const ready = readyCount(state);
      board.badge.hidden = ready === 0;
      board.badge.textContent = String(ready);
    }
    const summary = goalsSummary(state);
    bar.update({ visible: !tutorialActive(state), ...summary });
  };
  check();

  return {
    update(dt, player) {
      showBoard();
      checkTimer -= dt;
      if (checkTimer <= 0) {
        checkTimer = CHECK_SECONDS;
        check();
      }
      if (!board) return;
      const here = Math.abs(player.x - board.at.x) < SPOT_RADIUS && Math.abs(player.z - board.at.z) < SPOT_RADIUS;
      board.pad.update(dt, here);
      // Opens on stepping onto the spot, not again until stepping off.
      if (here && !onSpot) {
        sound.play('click');
        openBoard();
      }
      onSpot = here;
    },
    onPaid(paid) {
      // Vending machine sales (no car) don't count: contracts are for the Mini-Mart.
      const car = paid.car;
      const tasks = car ? tasksFor(car) : [];
      if (tasks.includes('combo')) state.counts.combo = (state.counts.combo ?? 0) + 1;
      const now = Date.now();
      const finished = tasks.flatMap((task) => countTask(state, task, now));
      if (finished.length > 0) {
        toast(root, `📋 ${t('contractDone')}`);
        sound.play('mission');
      }
    },
  };
}
