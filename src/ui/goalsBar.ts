// The town goals: a bar under the cash counter (how many are reached and the
// next one), and the list it opens, where reached goals are claimed.
import { GOALS, type GoalDef } from '../core/config';
import type { GameState } from '../core/gameState';
import { goalProgress } from '../systems/townGoals';
import { openDialog } from './dialog';
import { t, type StringKey } from './strings';

/** "Open the Mini-Mart", "Serve 40 combos"… */
export function goalText(goal: GoalDef): string {
  return t(`goal_${goal.id}` as StringKey, { n: goal.goal ?? goal.stars ?? 1 });
}

export interface GoalsBarView {
  visible: boolean;
  done: number;
  total: number;
  /** Reached goals waiting to be claimed. */
  ready: number;
  next: GoalDef | null;
}

/** Tappable bar under the HUD; only touches the page when something changes. */
export class GoalsBar {
  private readonly el: HTMLButtonElement;
  private readonly count: HTMLElement;
  private readonly text: HTMLElement;
  private readonly fill: HTMLElement;
  private shown = '';

  constructor(root: HTMLElement, onTap: () => void) {
    this.el = document.createElement('button');
    this.el.type = 'button';
    this.el.className = 'goals-bar';
    this.el.innerHTML = '<span class="goals-flag" aria-hidden="true">🏁</span><span class="goals-count"></span><span class="goals-text"></span><span class="goals-track"><span class="goals-fill"></span></span>';
    this.count = this.el.querySelector('.goals-count')!;
    this.text = this.el.querySelector('.goals-text')!;
    this.fill = this.el.querySelector('.goals-fill')!;
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('click', onTap);
    root.appendChild(this.el);
  }

  update(view: GoalsBarView): void {
    const key = `${view.visible}|${view.done}|${view.ready}|${view.next?.id}`;
    if (key === this.shown) return;
    this.shown = key;
    this.el.hidden = !view.visible;
    this.count.textContent = t('goalsBar', { done: view.done, total: view.total });
    this.text.textContent = view.ready > 0 ? t('goalsClaim') : view.next ? goalText(view.next) : t('goalsAll');
    this.fill.style.width = `${(view.done / view.total) * 100}%`;
    this.el.classList.toggle('goals-hot', view.ready > 0);
  }
}

/** Every goal with its progress; reached ones can be claimed here for gems and a franchise star. */
export function showGoals(root: HTMLElement, state: GameState, onClaim: (id: string) => void): void {
  const list = document.createElement('div');
  list.className = 'mission-list';
  const stars = document.createElement('div');
  stars.className = 'goals-stars';
  const showStars = () => (stars.textContent = `⭐ ${t('franchiseStars', { n: state.franchiseStars })}`);
  showStars();
  list.appendChild(stars);
  for (const goal of GOALS.goals) {
    const { value, target } = goalProgress(state, goal);
    const done = state.goals.done.includes(goal.id);
    const row = document.createElement('div');
    row.className = 'mission-row';
    const text = document.createElement('div');
    text.className = 'mission-text';
    text.textContent = goalText(goal);
    const bar = document.createElement('div');
    bar.className = 'mission-bar';
    const fill = document.createElement('div');
    fill.className = 'mission-fill';
    fill.style.width = `${done ? 100 : (value / target) * 100}%`;
    bar.appendChild(fill);
    const count = document.createElement('div');
    count.className = 'mission-count';
    count.textContent = done ? '✓' : goal.stars ? `★ ${value.toFixed(1)} / ${target}` : goal.built ? '' : `${Math.floor(value)} / ${target}`;
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'mission-claim';
    if (state.goals.claimed.includes(goal.id)) {
      action.textContent = '✓';
      action.disabled = true;
    } else {
      action.textContent = `💎 ${goal.gems}`;
      action.disabled = !done;
      action.addEventListener('click', () => {
        onClaim(goal.id);
        action.textContent = '✓';
        action.disabled = true;
        showStars();
      });
    }
    row.append(text, action, bar, count);
    list.appendChild(row);
  }
  openDialog(root, { icon: '🏁', title: t('goalsTitle'), body: t('goalsBody'), content: list, buttons: [{ label: 'OK', kind: 'plain', onTap: () => {} }] });
}
