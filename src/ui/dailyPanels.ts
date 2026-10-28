// The daily rewards calendar and the daily missions list.
import { DAILY } from '../core/config';
import type { GameState } from '../core/gameState';
import { calendarReady, missionReady, type MissionKind } from '../systems/daily';
import { formatCash } from '../systems/economy';
import { openDialog } from './dialog';
import { t, type StringKey } from './strings';

/** Seven day tiles: claimed ones ticked, today's highlighted, day 7 a chest. */
export function showCalendar(root: HTMLElement, state: GameState, today: string, onClaim: () => void): void {
  const ready = calendarReady(state, today);
  const grid = document.createElement('div');
  grid.className = 'calendar-grid';
  // The tile to claim next (or, if today's is claimed, the one just claimed).
  const current = ready ? state.daily.loginDay : (state.daily.loginDay + DAILY.calendar.length - 1) % DAILY.calendar.length;
  DAILY.calendar.forEach((reward, i) => {
    const tile = document.createElement('div');
    tile.className = 'calendar-tile';
    if (i < current || (i === current && !ready)) tile.classList.add('calendar-done');
    if (i === current && ready) tile.classList.add('calendar-today');
    if (reward.chest) tile.classList.add('calendar-chest');
    tile.innerHTML = `<span class="calendar-day"></span><span class="calendar-icon">${reward.chest ? '🎁' : '💎'}</span><span class="calendar-gems">${reward.gems}</span>`;
    tile.querySelector('.calendar-day')!.textContent = t('day', { n: i + 1 });
    grid.appendChild(tile);
  });
  openDialog(root, {
    icon: '🎁',
    title: t('calendarTitle'),
    body: t('calendarBody'),
    content: grid,
    buttons: ready
      ? [{ label: t('claim'), onTap: onClaim }]
      : [{ label: t('tomorrow'), kind: 'plain', onTap: () => {} }],
  });
}

/** "Wash 30 cars", "Earn $5.2K"… */
export function missionText(id: string, goal: number): string {
  return t(`m_${id as MissionKind}` as StringKey, { n: goal, cash: formatCash(goal) });
}

/** Today's three missions with progress bars; finished ones can be claimed right here. */
export function showMissions(root: HTMLElement, state: GameState, onClaim: (index: number) => void): void {
  const list = document.createElement('div');
  list.className = 'mission-list';
  const d = state.daily;
  d.missions.forEach((id, i) => {
    const goal = d.goals[i] ?? 1;
    const done = Math.min(goal, d.progress[i] ?? 0);
    const row = document.createElement('div');
    row.className = 'mission-row';
    const text = document.createElement('div');
    text.className = 'mission-text';
    text.textContent = missionText(id, goal);
    const bar = document.createElement('div');
    bar.className = 'mission-bar';
    const fill = document.createElement('div');
    fill.className = 'mission-fill';
    fill.style.width = `${(done / goal) * 100}%`;
    bar.appendChild(fill);
    const count = document.createElement('div');
    count.className = 'mission-count';
    count.textContent = id === 'earn' ? `${formatCash(done)} / ${formatCash(goal)}` : `${Math.floor(done)} / ${goal}`;
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'mission-claim';
    const gems = DAILY.missions.find((m) => m.id === id)?.gems ?? 0;
    if (d.claimed[i]) {
      action.textContent = '✓';
      action.disabled = true;
    } else {
      action.textContent = `💎 ${gems}`;
      action.disabled = !missionReady(state, i);
      action.addEventListener('click', () => {
        onClaim(i);
        action.textContent = '✓';
        action.disabled = true;
      });
    }
    row.append(text, action, bar, count);
    list.appendChild(row);
  });
  openDialog(root, { icon: '📋', title: t('missionsTitle'), body: t('missionsBody'), content: list, buttons: [{ label: 'OK', kind: 'plain', onTap: () => {} }] });
}
