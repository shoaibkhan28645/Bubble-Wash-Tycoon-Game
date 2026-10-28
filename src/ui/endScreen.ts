import { t } from './strings';

/**
 * End of content (YouTube requires telling the player when there's no more):
 * shown once the truck to the next town is bought. The lot keeps running.
 */
export function showEndScreen(root: HTMLElement, onClose: () => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'welcome-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', t('endTitle'));
  const card = document.createElement('div');
  card.className = 'welcome-card end-card';
  const trophy = document.createElement('div');
  trophy.className = 'welcome-bag';
  trophy.textContent = '🏆';
  const title = document.createElement('h2');
  title.textContent = t('endTitle');
  const body = document.createElement('p');
  body.className = 'end-body';
  body.textContent = t('endBody');
  const keep = document.createElement('button');
  keep.type = 'button';
  keep.className = 'welcome-collect';
  keep.textContent = t('keepWashing');
  card.append(trophy, title, body, keep);
  overlay.appendChild(card);
  overlay.addEventListener('pointerdown', (e) => e.stopPropagation());

  const close = () => {
    window.removeEventListener('keydown', onKey);
    overlay.remove();
    onClose();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Enter') close();
  };
  keep.addEventListener('click', close);
  window.addEventListener('keydown', onKey);
  root.appendChild(overlay);
  keep.focus();
}
