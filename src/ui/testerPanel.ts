// The tester build's panel (src/platform/tester.ts): a small tab showing the
// build number, opening a panel of shortcuts for testers. Only the tester
// build loads this file.
import './tester.css';
import type { GameState } from '../core/gameState';
import type { SaveManager } from '../core/save';
import type { DevControls } from '../platform/types';
import { town } from '../core/config';
import { townIds } from '../core/towns';
import { formatCash } from '../systems/economy';
import { JOURNEY } from '../systems/journey';
import { BUILD_LABEL, setAwayShift, testerCash } from '../platform/tester';

const GEMS = 100;
const HOUR_MS = 60 * 60 * 1000;

interface TesterDeps {
  root: HTMLElement;
  state: GameState;
  saves: SaveManager;
  /** Takes the hero to another town. */
  travel: (id: string) => Promise<void>;
  /** Shows the frame rate and other stats (the ?debug panel's). */
  showStats: () => Promise<void>;
  /** Clears the save (null inside YouTube, whose saves the game can't clear). */
  dev: DevControls | null;
}

export function createTesterPanel({ root, state, saves, travel, showStats, dev }: TesterDeps): void {
  const number = /\d+/.exec(BUILD_LABEL)?.[0];
  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'tester-tab';
  tab.textContent = number ? `TEST ${number}` : 'TEST';
  tab.setAttribute('aria-label', `${BUILD_LABEL}: tester tools`);

  const panel = document.createElement('div');
  panel.className = 'tester-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Tester tools');

  // Taps on the tab and the panel must not reach the game (it would walk the hero there).
  for (const el of [tab, panel]) el.addEventListener('pointerdown', (event) => event.stopPropagation());
  root.append(tab, panel);

  const head = document.createElement('div');
  head.className = 'tester-head';
  const title = document.createElement('strong');
  title.textContent = 'Tester tools';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'tester-close';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Close');
  head.append(title, close);
  const build = document.createElement('p');
  build.className = 'tester-build';
  build.textContent = `${BUILD_LABEL}. Put this in every report.`;
  const note = document.createElement('p');
  note.className = 'tester-note';
  note.setAttribute('aria-live', 'polite');
  panel.append(head, build);

  const section = (label: string): HTMLDivElement => {
    const heading = document.createElement('p');
    heading.className = 'tester-section';
    heading.textContent = label;
    const row = document.createElement('div');
    row.className = 'tester-row';
    panel.append(heading, row);
    return row;
  };
  const button = (row: HTMLElement, label: string, onTap: (el: HTMLButtonElement) => void | Promise<void>): HTMLButtonElement => {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = label;
    el.addEventListener('click', () => void onTap(el));
    row.appendChild(el);
    return el;
  };
  const say = (text: string): void => {
    note.textContent = text;
  };

  const money = section('Money and gems');
  button(money, 'Add money', async () => {
    const amount = testerCash(town().pads, state.unlocked);
    state.cash += amount;
    await saves.saveNow();
    say(`Added ${formatCash(amount)}: enough for about five builds here.`);
  });
  button(money, `Add ${GEMS} gems`, async () => {
    state.gems += GEMS;
    await saves.saveNow();
    say(`Added ${GEMS} gems.`);
  });

  const towns = section('Go to a town');
  const townButtons = new Map<string, HTMLButtonElement>();
  for (const stop of JOURNEY.filter((s) => townIds().includes(s.id))) {
    const el = button(towns, `${stop.icon} ${stop.name}`, async () => {
      setOpen(false);
      for (const b of townButtons.values()) b.disabled = true;
      try {
        await travel(stop.id);
      } finally {
        showTowns();
      }
    });
    townButtons.set(stop.id, el);
  }
  const showTowns = (): void => {
    for (const [id, el] of townButtons) el.disabled = id === state.currentTown;
  };

  const checks = section('Checks');
  button(checks, 'Come back an hour later', async (el) => {
    el.disabled = true;
    say('Restarting as if an hour had passed…');
    await saves.saveNow();
    setAwayShift(HOUR_MS);
    window.location.reload();
  });
  button(checks, 'Show performance', async (el) => {
    el.disabled = true;
    await showStats();
    el.textContent = 'Performance shown';
    say('The frame rate (FPS) is in the box at the bottom left.');
  });

  if (dev) {
    const restart = section('Start again');
    let armed = false;
    button(restart, 'Start again from zero', (el) => {
      if (!armed) {
        armed = true;
        el.textContent = 'Tap again to wipe progress';
        el.classList.add('tester-danger');
        return;
      }
      dev.clearSave();
      window.location.reload();
    });
  }
  panel.append(note);

  const setOpen = (open: boolean): void => {
    panel.hidden = !open;
    tab.setAttribute('aria-expanded', String(open));
    if (open) {
      showTowns();
      say('');
    }
  };
  tab.addEventListener('click', () => setOpen(panel.hidden));
  close.addEventListener('click', () => setOpen(false));
  setOpen(false);
}
