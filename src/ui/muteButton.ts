import { icon } from './icons';

/**
 * The game's own sound on/off button, bottom left (the Playgama build: Playgama
 * asks for one, rule 3.3.3; YouTube has its own and asks for none). Taps on it
 * never reach the joystick.
 */
export function createMuteButton(root: HTMLElement, deps: { muted: () => boolean; toggle: () => void }): void {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'mute-button';
  const show = (): void => {
    const muted = deps.muted();
    el.innerHTML = icon(muted ? 'muted' : 'sound', 30);
    el.setAttribute('aria-label', muted ? 'Sound off: turn it on' : 'Sound on: turn it off');
    el.setAttribute('aria-pressed', String(muted));
  };
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('click', () => {
    deps.toggle();
    show();
  });
  show();
  root.appendChild(el);
}
