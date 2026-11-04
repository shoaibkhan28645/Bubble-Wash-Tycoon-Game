import { t } from './strings';

/** One newspaper card: a story beat or a rank-up (strategy doc, section 4). */
export interface NewsItem {
  /** The town paper's name, over the headline. */
  paper: string;
  headline: string;
  body: string;
  /** Someone's words under the story (the mentor, the rival), if any. */
  quote?: { who: string; icon: string; words: string };
  /** The big picture beside the headline. */
  icon: string;
}

/**
 * A full-screen newspaper card. Taps on it never reach the joystick; the
 * button, Enter or Escape closes it.
 */
export function showNewspaper(root: HTMLElement, item: NewsItem, onClose: () => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'welcome-overlay news-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', item.headline);
  const card = document.createElement('article');
  card.className = 'news-card';

  const masthead = document.createElement('div');
  masthead.className = 'news-masthead';
  masthead.textContent = item.paper;
  const rule = document.createElement('div');
  rule.className = 'news-rule';
  rule.textContent = t('newsEdition');

  const top = document.createElement('div');
  top.className = 'news-top';
  const picture = document.createElement('div');
  picture.className = 'news-picture';
  picture.textContent = item.icon;
  const headline = document.createElement('h2');
  headline.className = 'news-headline';
  headline.textContent = item.headline;
  top.append(picture, headline);

  const body = document.createElement('p');
  body.className = 'news-body';
  body.textContent = item.body;
  card.append(masthead, rule, top, body);

  if (item.quote) {
    const quote = document.createElement('blockquote');
    quote.className = 'news-quote';
    const face = document.createElement('span');
    face.className = 'news-quote-face';
    face.textContent = item.quote.icon;
    const words = document.createElement('span');
    words.textContent = `“${item.quote.words}” — ${item.quote.who}`;
    quote.append(face, words);
    card.appendChild(quote);
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'welcome-collect news-button';
  button.textContent = t('newsContinue');
  card.appendChild(button);
  overlay.appendChild(card);
  overlay.addEventListener('pointerdown', (e) => e.stopPropagation());

  const close = (): void => {
    window.removeEventListener('keydown', onKey);
    overlay.remove();
    onClose();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' || e.key === 'Enter') close();
  };
  button.addEventListener('click', close);
  window.addEventListener('keydown', onKey);
  root.appendChild(overlay);
  button.focus({ preventScroll: true });
}
