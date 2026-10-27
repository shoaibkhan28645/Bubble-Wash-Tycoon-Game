/**
 * The one game clock. It only moves when the loop runs, so it stops while
 * YouTube has the game paused. Gameplay timers read from here, never Date.now().
 */
export class GameClock {
  private seconds = 0;

  get now(): number {
    return this.seconds;
  }

  advance(dt: number): void {
    this.seconds += dt;
  }
}
