import { describe, expect, it } from 'vitest';
import { CARS } from '../src/core/config';
import { newGame, newTownState } from '../src/core/gameState';
import { ROADSIDE } from '../src/core/towns';
import { rushed } from '../src/systems/arrivals';
import { JOURNEY, stopStatus } from '../src/systems/journey';
import { beatFlag, catchUpFlags, dueBeats, newsFor, storyArrivalFactor, storyStartFlag } from '../src/systems/story';

const { story } = ROADSIDE;
const TOWN = ROADSIDE.id;
const told = (...ids: string[]) => ids.map((id) => beatFlag(TOWN, id));
const ids = (beats: { id: string }[]) => beats.map((b) => b.id);

describe('the roadside story', () => {
  it('only names pads, flags and beats that exist', () => {
    const pads = new Set(ROADSIDE.pads.map((p) => p.id));
    const beats = new Set(story.beats.map((b) => b.id));
    for (const beat of story.beats) {
      if (beat.when.built) expect(pads.has(beat.when.built), beat.id).toBe(true);
      if (beat.when.beat) expect(beats.has(beat.when.beat), beat.id).toBe(true);
      if (beat.effect?.rival) expect(pads.has(beat.effect.rival.until), beat.id).toBe(true);
      if (beat.speaker) expect(beat.words, beat.id).toBeTruthy();
    }
  });

  it('opens once the first cash is collected', () => {
    const state = newGame();
    expect(dueBeats(TOWN, story, state, false)).toEqual([]);
    state.flags.push('collected');
    expect(ids(dueBeats(TOWN, story, state, false))).toEqual(['arrival']);
    state.flags.push(...told('arrival'));
    expect(dueBeats(TOWN, story, state, false)).toEqual([]);
  });

  it('brings in a rival who takes a quarter of the customers until the tunnel is built', () => {
    const state = newGame();
    state.unlocked = ['bay1', 'board'];
    expect(storyArrivalFactor(TOWN, story, state)).toBe(1);
    expect(ids(dueBeats(TOWN, story, state, false))).toContain('rival');
    state.flags.push(...told('rival'));
    expect(storyArrivalFactor(TOWN, story, state)).toBe(0.75);
    // Building the tunnel wins the customers back, and the paper says so.
    state.unlocked.push('tunnel');
    expect(storyArrivalFactor(TOWN, story, state)).toBe(1);
    expect(ids(dueBeats(TOWN, story, state, false))).toContain('rivalBeaten');
  });

  it('tells the storm is over only once the rush has ended', () => {
    const state = newGame();
    state.unlocked = ['cashier'];
    state.flags.push(...told('storm'));
    expect(ids(dueBeats(TOWN, story, state, true))).not.toContain('stormOver');
    expect(ids(dueBeats(TOWN, story, state, false))).toContain('stormOver');
  });

  it("starts a new player's story with nothing skipped", () => {
    const state = newGame();
    expect(catchUpFlags(TOWN, story, state)).toEqual([storyStartFlag(TOWN)]);
    state.flags.push(storyStartFlag(TOWN));
    expect(catchUpFlags(TOWN, story, state)).toEqual([]);
  });

  it('skips the old news for a save from before the story, chained beats too', () => {
    const state = newGame();
    state.flags = ['washed', 'collected'];
    state.unlocked = ROADSIDE.pads.map((p) => p.id);
    const flags = catchUpFlags(TOWN, story, state);
    expect(flags[0]).toBe(storyStartFlag(TOWN));
    expect(flags).toEqual(expect.arrayContaining(told('arrival', 'firstHire', 'rival', 'rivalBeaten', 'storm', 'stormOver', 'landmark')));
  });

  it('tells a later town its opening, even if it is due on arrival', () => {
    const state = newGame();
    state.flags = [storyStartFlag(TOWN), ...told('arrival')];
    state.unlocked = ['bay1'];
    expect(catchUpFlags('beach', story, state)).toEqual([storyStartFlag('beach')]);
  });

  it('puts the speaker under the story', () => {
    const arrival = story.beats.find((b) => b.id === 'arrival')!;
    expect(newsFor(story, arrival)).toMatchObject({ paper: story.paper, headline: arrival.headline, quote: { who: story.mentor.name } });
    const over = story.beats.find((b) => b.id === 'stormOver')!;
    expect(newsFor(story, over).quote).toBeUndefined();
  });
});

describe('a rush', () => {
  it('makes cars dirtier and pay more, but swamp mud stays for the tunnel', () => {
    const sedan = CARS.find((c) => c.id === 'sedan')!;
    const monster = CARS.find((c) => c.id === 'monster')!;
    expect(rushed(sedan, { dirt: 'muddy', payMultiplier: 2 })).toMatchObject({ id: 'sedan', dirt: 'muddy', payMultiplier: 2 });
    expect(rushed(monster, { dirt: 'muddy', payMultiplier: 2 }).dirt).toBe('swamp');
  });
});

describe('the journey', () => {
  const exists = (id: string) => id === 'roadside';

  it('has six towns, the first one free, each needing more franchise stars', () => {
    expect(JOURNEY.map((s) => s.chapter)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(JOURNEY[0]).toMatchObject({ id: 'roadside', franchiseStars: 0 });
    for (let i = 1; i < JOURNEY.length; i++) expect(JOURNEY[i]!.franchiseStars).toBeGreaterThan(JOURNEY[i - 1]!.franchiseStars);
  });

  it('marks where the hero is, what he owns, and what is locked or still to come', () => {
    const state = newGame();
    const [roadside, beach, market] = JOURNEY;
    expect(stopStatus(roadside!, state, exists)).toBe('here');
    expect(stopStatus(beach!, state, exists)).toBe('locked');
    state.franchiseStars = 8;
    expect(stopStatus(beach!, state, exists)).toBe('soon');
    expect(stopStatus(beach!, state, () => true)).toBe('open');
    expect(stopStatus(market!, state, () => true)).toBe('locked');
    state.towns.beach = newTownState();
    expect(stopStatus(beach!, state, exists)).toBe('owned');
  });
});
