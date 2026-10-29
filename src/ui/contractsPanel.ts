// The contracts board's pop-up: three contracts with their client, task,
// progress, time left and reward; finished ones are claimed here, and once
// a day an ad doubles one.
import type { Contract } from '../core/gameState';
import { contractDef, contractDone } from '../systems/contracts';
import { formatClock } from '../systems/construction';
import { formatCash } from '../systems/economy';
import { openDialog } from './dialog';
import { t, type StringKey } from './strings';

export interface BoardView {
  slots: readonly Contract[];
  /** Wall-clock ms. */
  now: number;
  /** Today's doubling ad is still unused. */
  canDouble: boolean;
}

/** "Wash 8 SUVs", "Fill up 12 cars"… */
export function taskText(task: string, goal: number): string {
  return t(`task_${task}` as StringKey, { n: goal });
}

const rewardText = (c: Contract, times = 1): string => (c.gems > 0 ? `💎 ${c.gems * times}` : `💵 ${formatCash(c.cash * times)}`);

function card(c: Contract, view: BoardView, onClaim: (double: boolean) => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'contract-card';
  const def = contractDef(c.kind);
  if (!def) {
    el.classList.add('contract-empty');
    el.textContent = c.endsAt > view.now ? `📭 ${t('contractNew', { time: formatClock((c.endsAt - view.now) / 1000) })}` : `📭 ${t('contractNone')}`;
    return el;
  }
  const done = contractDone(c);
  const icon = document.createElement('div');
  icon.className = 'contract-icon';
  icon.textContent = def.icon;
  const head = document.createElement('div');
  head.className = 'contract-head';
  const client = document.createElement('div');
  client.className = 'contract-client';
  client.textContent = def.client;
  const task = document.createElement('div');
  task.className = 'mission-text';
  task.textContent = taskText(def.task, c.goal);
  head.append(client, task);
  const time = document.createElement('div');
  time.className = 'contract-time';
  time.textContent = done ? '✅' : `⏱ ${t('contractLeft', { time: formatClock(Math.max(0, c.endsAt - view.now) / 1000) })}`;
  const bar = document.createElement('div');
  bar.className = 'mission-bar contract-bar';
  const fill = document.createElement('div');
  fill.className = 'mission-fill';
  fill.style.width = `${(Math.min(c.progress, c.goal) / c.goal) * 100}%`;
  bar.appendChild(fill);
  const count = document.createElement('div');
  count.className = 'mission-count';
  count.textContent = `${Math.floor(c.progress)} / ${c.goal}`;
  const reward = document.createElement('div');
  reward.className = 'contract-reward';
  reward.textContent = rewardText(c);
  const foot = document.createElement('div');
  foot.className = 'contract-foot';
  const buttons = document.createElement('div');
  buttons.className = 'contract-buttons';
  const claim = document.createElement('button');
  claim.type = 'button';
  claim.className = 'mission-claim';
  claim.textContent = t('claim');
  claim.disabled = !done;
  claim.addEventListener('click', () => onClaim(false));
  buttons.appendChild(claim);
  if (done && view.canDouble) {
    const double = document.createElement('button');
    double.type = 'button';
    double.className = 'mission-claim contract-double';
    double.textContent = `📺 ${rewardText(c, 2)}`;
    double.addEventListener('click', () => {
      double.disabled = true;
      onClaim(true);
    });
    buttons.appendChild(double);
  }
  foot.append(reward, buttons);
  el.append(icon, head, time, bar, count, foot);
  return el;
}

/** Opens the board; it keeps its timers ticking while open. `onClaim` (with the ad for a double) runs before it redraws. */
export function showContracts(root: HTMLElement, view: () => BoardView, onClaim: (index: number, double: boolean) => Promise<void>): { close: () => void } {
  const list = document.createElement('div');
  list.className = 'contract-list';
  const render = (): void => {
    const now = view();
    list.replaceChildren(
      ...now.slots.map((c, i) =>
        card(c, now, (double) => {
          void onClaim(i, double).then(render);
        }),
      ),
    );
  };
  render();
  const timer = window.setInterval(render, 1000);
  return openDialog(root, {
    icon: '📋',
    title: t('contractsTitle'),
    body: t('contractsBody'),
    content: list,
    buttons: [{ label: 'OK', kind: 'plain', onTap: () => {} }],
    onClose: () => window.clearInterval(timer),
  });
}
