// A town's story (strategy doc, section 4): beats that open as the player
// gets on, each told on a newspaper card, some with an effect on play — a
// rival who takes customers until the player answers, or a rush of dirty
// cars. Every town's story is data (src/data/towns/<town>/story.json).
import type { Dirt } from '../core/config';
import type { GameState } from '../core/gameState';
import type { NewsItem } from '../ui/newspaper';

export interface StoryBeat {
  id: string;
  /** All of these must hold: a flag set, a pad built, another beat told, the rush over. */
  when: { flag?: string; built?: string; beat?: string; rushOver?: boolean };
  icon: string;
  headline: string;
  body: string;
  /** Who adds a few words under the story. */
  speaker?: 'mentor' | 'rival';
  words?: string;
  effect?: {
    /** A rival opens: customers come this much as often until the `until` pad is built. */
    rival?: { arrivalFactor: number; until: string };
    /** A rush: for `seconds`, every car comes this dirty and pays this much more. */
    rush?: { seconds: number; dirt: Dirt; payMultiplier: number };
  };
}

export interface StoryData {
  /** The town paper's name. */
  paper: string;
  mentor: { name: string; icon: string };
  rival: { name: string; icon: string; business: string };
  beats: StoryBeat[];
}

/** The flag that records a beat was told (beats are per town, flags are the empire's). */
export function beatFlag(town: string, id: string): string {
  return `story:${town}:${id}`;
}

/** The flag that records a town's story has started. */
export function storyStartFlag(town: string): string {
  return `story:${town}`;
}

/** Whether a beat's conditions all hold now (told or not). */
export function beatReady(town: string, beat: StoryBeat, state: GameState, rushActive: boolean): boolean {
  const w = beat.when;
  if (w.flag && !state.flags.includes(w.flag)) return false;
  if (w.built && !state.unlocked.includes(w.built)) return false;
  if (w.beat && !state.flags.includes(beatFlag(town, w.beat))) return false;
  if (w.rushOver && rushActive) return false;
  return true;
}

/** Beats ready but not told yet, in story order. */
export function dueBeats(town: string, story: StoryData, state: GameState, rushActive: boolean): StoryBeat[] {
  return story.beats.filter((b) => !state.flags.includes(beatFlag(town, b.id)) && beatReady(town, b, state, rushActive));
}

/**
 * The first time a town's story runs: a save from before the story (a
 * player already well into the town) has every beat that's already due
 * marked as told, without cards, so it doesn't open on a pile of old news.
 * A new town has nothing due yet, so nothing is skipped. Returns the
 * flags to add.
 */
export function catchUpFlags(town: string, story: StoryData, state: GameState): string[] {
  if (state.flags.includes(storyStartFlag(town))) return [];
  const skipped: string[] = [];
  // Beats can depend on each other: keep going until nothing more is due.
  for (;;) {
    const flags = [...state.flags, ...skipped];
    const due = dueBeats(town, story, { ...state, flags }, false);
    if (due.length === 0) break;
    skipped.push(...due.map((b) => beatFlag(town, b.id)));
  }
  return [storyStartFlag(town), ...skipped];
}

/** How often customers come because of the story: a rival takes some until the player answers. */
export function storyArrivalFactor(town: string, story: StoryData, state: GameState): number {
  let factor = 1;
  for (const beat of story.beats) {
    const rival = beat.effect?.rival;
    if (rival && state.flags.includes(beatFlag(town, beat.id)) && !state.unlocked.includes(rival.until)) factor *= rival.arrivalFactor;
  }
  return factor;
}

/** A beat as its newspaper card. */
export function newsFor(story: StoryData, beat: StoryBeat): NewsItem {
  const who = beat.speaker === 'rival' ? story.rival : beat.speaker === 'mentor' ? story.mentor : null;
  return {
    paper: story.paper,
    icon: beat.icon,
    headline: beat.headline,
    body: beat.body,
    ...(who && beat.words ? { quote: { who: who.name, icon: who.icon, words: beat.words } } : {}),
  };
}
