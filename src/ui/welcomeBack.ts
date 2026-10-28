import { formatCash } from '../systems/economy';
import { t } from './strings';

/** "1 h 20 min", "45 min", "2 min". */
export function formatAway(seconds: number): string {
  const minutes = Math.max(1, Math.floor(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${minutes} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * Welcome-back screen (GDD): a big cash bag with what the staff earned while
 * the player was away, and a Collect button. "Collect 2×" (rewarded ad)
 * arrives with the ads milestone.
 */
export function showWelcomeBack(root: HTMLElement, cash: number, seconds: number, onCollect: () => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'welcome-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', t('welcomeBack'));
  const card = document.createElement('div');
  card.className = 'welcome-card';
  const title = document.createElement('h2');
  title.textContent = t('welcomeBack');
  const bag = document.createElement('div');
  bag.className = 'welcome-bag';
  bag.textContent = '💰';
  const amount = document.createElement('div');
  amount.className = 'welcome-amount';
  amount.textContent = formatCash(cash);
  const away = document.createElement('div');
  away.className = 'welcome-away';
  away.textContent = `${t('staffEarned')} · ${formatAway(seconds)}`;
  const collect = document.createElement('button');
  collect.type = 'button';
  collect.className = 'welcome-collect';
  collect.textContent = t('collect');
  card.append(title, bag, amount, away, collect);
  overlay.appendChild(card);
  // The overlay swallows taps so the joystick doesn't start underneath.
  overlay.addEventListener('pointerdown', (e) => e.stopPropagation());

  const close = () => {
    window.removeEventListener('keydown', onKey);
    overlay.remove();
    onCollect();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Enter') close();
  };
  collect.addEventListener('click', close);
  window.addEventListener('keydown', onKey);
  root.appendChild(overlay);
  collect.focus();
}
