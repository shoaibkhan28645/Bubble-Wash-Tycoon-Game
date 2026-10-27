const FADE_MS = 250;

/** Controls the loading screen that index.html shows from the very first paint. */
export function getLoadingScreen(): { setProgress(fraction: number): void; hide(): Promise<void> } {
  const screen = document.getElementById('loading');
  const fill = screen?.querySelector<HTMLElement>('.loading-fill');

  return {
    setProgress(fraction) {
      const percent = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
      if (fill) fill.style.width = `${percent}%`;
      screen?.setAttribute('aria-valuenow', String(percent));
    },
    hide() {
      if (!screen) return Promise.resolve();
      screen.classList.add('loading-done');
      return new Promise((resolve) =>
        setTimeout(() => {
          screen.remove();
          resolve();
        }, FADE_MS),
      );
    },
  };
}
