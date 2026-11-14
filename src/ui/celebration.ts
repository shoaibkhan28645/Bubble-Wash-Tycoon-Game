import { iconFor } from './icons';
import { t } from './strings';

/** One big moment told to the player: a story beat or a new rank. */
export interface Announcement {
  /** A word or two shouted over the card: "Woohoo!", "Uh-oh!". */
  shout: string;
  headline: string;
  body: string;
  /** Someone's words under the story (the mentor, the rival), in a speech bubble. */
  quote?: { who: string; icon: string; words: string };
  /** The picture in the card's badge. */
  icon: string;
  /** Something won with it (a rank's perk), on a gold strip. */
  perk?: string;
  /** The button's words ("Let's go!" if not given). */
  button?: string;
}

/** Where the confetti falls (percent across and down, colour, turn), the same every time so it never covers the words. */
const CONFETTI: [number, number, string, number][] = [
  [14, 8, 'sun', 25], [29, 17, 'pink', -30], [64, 6, 'mint', 60], [78, 19, 'sun', -15], [49, 12, 'pink', 0],
  [9, 70, 'pink', 40], [90, 66, 'sun', -50], [23, 90, 'mint', 15], [72, 91, 'sun', 0], [88, 84, 'pink', 30],
];
const BUBBLES: [number, number, number][] = [[7, 14, 40], [82, 11, 26], [85, 75, 46], [5, 82, 30]];

/**
 * A full-screen celebration: sunrays and bubbles over the town, and a card with the news in the player's
 * own terms. Taps on it never reach the joystick; the button, Enter or Escape closes it.
 */
export function showCelebration(root: HTMLElement, item: Announcement, onClose: () => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'welcome-overlay party-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', item.headline);
  const rays = document.createElement('div');
  rays.className = 'party-rays';
  overlay.appendChild(rays);
  for (const [x, y, size] of BUBBLES) {
    const bubble = document.createElement('span');
    bubble.className = 'party-bubble';
    bubble.style.cssText = `left:${x}%;top:${y}%;width:${size}px;height:${size}px`;
    overlay.appendChild(bubble);
  }
  for (const [x, y, colour, turn] of CONFETTI) {
    const bit = document.createElement('span');
    bit.className = `party-bit party-${colour}`;
    bit.style.cssText = `left:${x}%;top:${y}%;rotate:${turn}deg`;
    overlay.appendChild(bit);
  }

  const card = document.createElement('article');
  card.className = 'welcome-card party-card';
  const badge = document.createElement('div');
  badge.className = 'dialog-icon';
  const drawn = iconFor(item.icon, 52);
  if (drawn) badge.innerHTML = drawn;
  else badge.textContent = item.icon;
  const shout = document.createElement('div');
  shout.className = 'party-shout';
  shout.textContent = item.shout;
  const headline = document.createElement('h2');
  headline.textContent = item.headline;
  const body = document.createElement('p');
  body.className = 'end-body';
  body.textContent = item.body;
  card.append(badge, shout, headline, body);

  if (item.perk) {
    const perk = document.createElement('div');
    perk.className = 'party-perk';
    perk.textContent = item.perk;
    card.appendChild(perk);
  }
  if (item.quote) {
    const quote = document.createElement('blockquote');
    quote.className = 'party-quote';
    const face = document.createElement('span');
    face.className = 'speech-face';
    face.textContent = item.quote.icon;
    const words = document.createElement('span');
    words.className = 'speech-words';
    const who = document.createElement('b');
    who.textContent = item.quote.who;
    words.append(who, document.createTextNode(item.quote.words));
    quote.append(face, words);
    card.appendChild(quote);
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'welcome-collect party-button';
  button.textContent = item.button ?? t('partyContinue');
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
