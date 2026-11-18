"""Main Street Mogul's music, all written for the game: each tune is a score
in this file, played by FluidSynth with the FluidR3 GM instruments (MIT) and
cut into a seamless loop.

Town music (loops):
- roadside:  Roadside. The car wash's sunny ukulele tune in C: strummed
             ukulele, bass and shaker; the marimba's tune; a whistled verse;
             the marimba again with a glockenspiel.
- farm:      Willowbrook. A hoedown in G: banjo rolls and boom-chick guitar,
             then the fiddle's tune, its bridge, and the tune again with a
             second fiddle in harmony.
- park:      Starlight Fun Park. A carnival waltz in C: calliope and
             glockenspiel over oom-pah tuba and accordion, and a gentler trio
             in F.
- skyport:   Skyport. A light bossa nova in F for the departure lounge:
             electric piano, warm pad, finger bass and brushes; the
             vibraphone's tune, a flute's, then both together.
- musicbox:  The carousel's music box: a slow lullaby waltz in C.

Jingles (mono, short): build, reward, vip, mission.

A loop is played once and left to ring out; what rings on past the end is laid
over the start, as it would sound going round again, so there's no seam.

Usage: python art/music/compose.py <out-dir> [name ...]
Needs: fluidsynth and FluidR3_GM.sf2 (Debian/Ubuntu: fluidsynth
fluid-soundfont-gm), ffmpeg, numpy, mido.
"""
import random
import subprocess
import sys
import tempfile
from pathlib import Path

import mido
import numpy as np

SOUNDFONT = '/usr/share/sounds/sf2/FluidR3_GM.sf2'
RATE = 44100
PPQ = 480
DRUMS = 9

# The town music's loudness (as the old in-code Roadside loop, -20.5 LUFS) and the music box's (as the old one's).
LOOP_LUFS = -20.0
# Every file stays under the game's 512 KiB target: the longer a loop, the lower its bit rate (64 kbps at most).
FILE_BUDGET = 500 * 1024
# The jingles' loudest 50 ms (as the old ones, about -11 dB) and their peaks.
JINGLE_PEAK_RMS_DB = -11.0


class Score:
    """Notes on channels, in beats; written out as a MIDI file."""

    def __init__(self, bpm: float, beats_per_bar: int, bars: float, seed: int, room: float = 0.5, wet: float = 0.6):
        self.bpm = bpm
        self.beats_per_bar = beats_per_bar
        self.bars = bars
        self.notes: list[tuple[float, float, int, int, int]] = []  # start, length, channel, pitch, velocity
        self.setup: dict[int, dict] = {}
        self.rand = random.Random(seed)
        self.room = room
        self.wet = wet
        # Channels whose instrument's stereo halves cancel when a phone mixes them to one speaker: kept to one half, centred.
        self.fold: set[int] = set()
        self.chords: list[str] = []

    @property
    def beats(self) -> float:
        return self.bars * self.beats_per_bar

    @property
    def seconds(self) -> float:
        return self.beats * 60 / self.bpm

    def instrument(self, channel: int, program: int, volume: int, pan: int = 64, reverb: int = 40, chorus: int = 0):
        self.setup[channel] = dict(program=program, volume=volume, pan=pan, reverb=reverb, chorus=chorus)

    def note(self, bar: float, beat: float, pitch: int, length: float, velocity: int, channel: int, loose: float = 0.012):
        """One note; `loose` (beats) lets it land a touch early or late, as a player would."""
        at = bar * self.beats_per_bar + beat
        if channel != DRUMS and at > 0:
            at += self.rand.uniform(-loose, loose)
        velocity = max(1, min(127, velocity + self.rand.randint(-5, 5)))
        self.notes.append((max(0.0, at), length, channel, pitch, velocity))

    def chord(self, bar: float, beat: float, pitches, length: float, velocity: int, channel: int, strum: float = 0.02, down: bool = True):
        """A strummed or rolled chord: each string a moment after the last (a pitch played twice sounds once)."""
        seen = []
        for p in pitches:
            if p not in seen:
                seen.append(p)
        order = seen if down else list(reversed(seen))
        for i, p in enumerate(order):
            self.note(bar, beat + i * strum, p, length - i * strum, velocity - i * 3, channel, loose=0.004)

    def tune(self, notes, channel: int, accent: int, soft: int, legato: float = 0.95, shift: float = 0, transpose: int = 0):
        """A melody: (bar, beat, pitch, beats) each, louder on the strong beats."""
        strong = (0, 2) if self.beats_per_bar == 4 else (0,)
        for bar, beat, pitch, length in notes:
            self.note(bar + shift, beat, pitch + transpose, length * legato, accent if beat in strong else soft, channel)

    def midi(self, path: Path, times: int = 2):
        track = mido.MidiTrack()
        track.append(mido.MetaMessage('set_tempo', tempo=mido.bpm2tempo(self.bpm), time=0))
        track.append(mido.MetaMessage('time_signature', numerator=self.beats_per_bar, denominator=4, time=0))
        events = []
        for channel, s in self.setup.items():
            if channel != DRUMS:
                events.append((0, 0, mido.Message('program_change', channel=channel, program=s['program'])))
            for cc, value in ((7, s['volume']), (10, s['pan']), (91, s['reverb']), (93, s['chorus'])):
                events.append((0, 0, mido.Message('control_change', channel=channel, control=cc, value=value)))
        for t in range(times):
            offset = t * self.beats
            for start, length, channel, pitch, velocity in self.notes:
                on = round((start + offset) * PPQ)
                off = round((start + offset + max(0.05, length)) * PPQ)
                events.append((on, 2, mido.Message('note_on', channel=channel, note=pitch, velocity=velocity)))
                events.append((off, 1, mido.Message('note_off', channel=channel, note=pitch, velocity=0)))
        # Two quiet bars at the end, for the last echoes.
        end = round((times * self.beats + self.beats_per_bar * 2) * PPQ)
        events.append((end, 3, mido.MetaMessage('marker', text='end')))
        events.sort(key=lambda e: (e[0], e[1]))
        now = 0
        for tick, _, msg in events:
            track.append(msg.copy(time=tick - now))
            now = tick
        song = mido.MidiFile(ticks_per_beat=PPQ)
        song.tracks.append(track)
        song.save(path)


def below(pitch: int, scale: list[int], steps: int = 2) -> int:
    """The note `steps` scale steps under `pitch` (a third, for two): a second voice in harmony."""
    p = pitch
    while steps > 0:
        p -= 1
        if p % 12 in scale:
            steps -= 1
    return p


NOTE = {'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11}
QUALITY = {'': [0, 4, 7], 'm': [0, 3, 7], '7': [0, 4, 7, 10], 'maj7': [0, 4, 7, 11], 'm7': [0, 3, 7, 10],
           '9': [0, 4, 7, 10, 2], 'm6': [0, 3, 7, 9], '7sus': [0, 5, 7, 10]}


def chord_tones(chord: str) -> set[int]:
    """The pitch classes of a chord named like 'G', 'Am', 'D7', 'Bbmaj7' or 'C7sus'."""
    root = chord[:2] if chord[1:2] == 'b' else chord[:1]
    return {(NOTE[root] + i) % 12 for i in QUALITY[chord[len(root):]]}


def harmony(pitch: int, chord: str, scale: list[int]) -> int:
    """A second voice under a tune: the next chord note at least a third down, or (under a passing note) a third down the scale."""
    tones = chord_tones(chord)
    if pitch % 12 not in tones:
        return below(pitch, scale)
    p = pitch - 3
    while p % 12 not in tones:
        p -= 1
    return p


C_MAJOR = [0, 2, 4, 5, 7, 9, 11]
G_MAJOR = [7, 9, 11, 0, 2, 4, 6]
F_MAJOR = [5, 7, 9, 10, 0, 2, 4]


# ---------------------------------------------------------------- Roadside

def roadside() -> Score:
    s = Score(bpm=104, beats_per_bar=4, bars=32, seed=3, room=0.45, wet=0.55)
    UKE, BASS, MARIMBA, WHISTLE, GLOCK = 0, 1, 2, 3, 4
    s.instrument(UKE, 24, 84, pan=46, reverb=35)           # nylon guitar, strummed high like a ukulele
    s.instrument(BASS, 32, 100, reverb=15)                 # acoustic bass
    s.instrument(MARIMBA, 12, 96, pan=80, reverb=45)       # marimba
    s.instrument(WHISTLE, 78, 80, pan=58, reverb=55)       # whistle
    s.instrument(GLOCK, 9, 58, pan=88, reverb=55)          # glockenspiel
    s.instrument(DRUMS, 0, 72, reverb=25)
    chords = ['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G',       # the strum
              'F', 'G', 'Em', 'Am', 'F', 'G', 'C', 'G',       # the marimba's tune
              'Am', 'Em', 'F', 'C', 'Dm', 'G', 'C', 'G',      # the whistled verse
              'F', 'G', 'Em', 'Am', 'F', 'G', 'C', 'G']       # the tune again, back home to C
    # Ukulele chord shapes (GCEA, the G string high), as the old in-code loop.
    uke = {'C': [67, 60, 64, 72], 'Am': [69, 60, 64, 69], 'F': [69, 60, 65, 69], 'G': [67, 62, 67, 71],
           'Em': [67, 64, 67, 71], 'Dm': [69, 62, 65, 69]}
    root = {'C': 48, 'Am': 45, 'F': 53, 'G': 55, 'Em': 52, 'Dm': 50}
    fifth = {'C': 55, 'Am': 52, 'F': 48, 'G': 50, 'Em': 47, 'Dm': 45}
    arpeggio = {'C': [60, 64, 67, 72], 'Am': [57, 60, 64, 69], 'F': [60, 65, 69, 72], 'G': [62, 67, 71, 74],
                'Em': [59, 64, 67, 71], 'Dm': [57, 62, 65, 69]}
    strum = [(0, True, 1.0), (1, True, 0.75), (1.5, False, 0.5), (2.5, False, 0.55), (3, True, 0.8), (3.5, False, 0.5)]
    s.chords = chords
    for bar, c in enumerate(chords):
        nxt = chords[(bar + 1) % len(chords)]
        for beat, down, loud in strum:
            s.chord(bar, beat, uke[c], 0.45 if beat % 1 else 0.7, round(76 * loud), UKE, strum=0.016, down=down)
        s.note(bar, 0, root[c], 1.4, 90, BASS)
        s.note(bar, 2, fifth[c], 0.9, 78, BASS)
        if nxt != c:
            s.note(bar, 3.5, root[nxt] + (1 if root[nxt] < root[c] else -1), 0.45, 64, BASS)
        else:
            s.note(bar, 3, root[c], 0.9, 70, BASS)
        # Shaker in eighths; a soft kick; claps on 2 and 4 once the tune comes in; a tambourine for the last verse.
        for i in range(8):
            s.note(bar, i * 0.5, 70, 0.2, 48 if i % 2 == 0 else 32, DRUMS)
        s.note(bar, 0, 36, 0.3, 56, DRUMS)
        if bar >= 8:
            s.note(bar, 2, 36, 0.3, 44, DRUMS)
            for b in (1, 3):
                s.note(bar, b, 39, 0.2, 40, DRUMS)
        if bar >= 24:
            for i in range(4):
                s.note(bar, i + 0.5, 54, 0.2, 30, DRUMS)
        # In the strum, a bubbly run up the chord at the end of each phrase.
        if bar < 8 and bar % 4 == 3:
            for i, p in enumerate(arpeggio[c]):
                s.note(bar, 2 + i * 0.5, p + 12, 0.45, 62 + i * 3, MARIMBA)
    tune = [  # as the old in-code loop's marimba tune, bars 8-15
        (8, 0, 81, 1), (8, 1, 79, 0.5), (8, 1.5, 76, 0.5), (8, 2, 77, 1), (8, 3, 76, 1),
        (9, 0, 74, 1.5), (9, 1.5, 76, 0.5), (9, 2, 79, 2),
        (10, 0, 79, 1), (10, 1, 76, 0.5), (10, 1.5, 74, 0.5), (10, 2, 71, 1), (10, 3, 74, 1),
        (11, 0, 76, 3), (11, 3, 72, 1),
        (12, 0, 81, 1), (12, 1, 79, 0.5), (12, 1.5, 76, 0.5), (12, 2, 77, 1), (12, 3, 81, 1),
        (13, 0, 79, 1.5), (13, 1.5, 76, 0.5), (13, 2, 74, 2),
        (14, 0, 72, 1), (14, 1, 76, 1), (14, 2, 79, 1), (14, 3, 84, 1),
        (15, 0, 83, 2), (15, 2, 79, 2),
    ]
    s.tune(tune, MARIMBA, 92, 82)
    s.tune(tune, MARIMBA, 94, 84, shift=16)
    # The glockenspiel doubles the tune's strong beats an octave up the second time.
    s.tune([n for n in tune if n[1] in (0, 2)], GLOCK, 56, 56, legato=0.5, shift=16, transpose=12)
    whistle = [
        (16, 0, 76, 1), (16, 1, 81, 1), (16, 2, 84, 1.5), (16, 3.5, 83, 0.5),
        (17, 0, 83, 2), (17, 2, 79, 1), (17, 3, 76, 1),
        (18, 0, 77, 1), (18, 1, 81, 1), (18, 2, 84, 1), (18, 3, 81, 1),
        (19, 0, 79, 3), (19, 3, 76, 1),
        (20, 0, 77, 1), (20, 1, 81, 1), (20, 2, 86, 1.5), (20, 3.5, 84, 0.5),
        (21, 0, 83, 1.5), (21, 1.5, 81, 0.5), (21, 2, 79, 1), (21, 3, 77, 1),
        (22, 0, 76, 1), (22, 1, 79, 1), (22, 2, 84, 2),
        (23, 0, 83, 2), (23, 2, 79, 1), (23, 3, 74, 1),
    ]
    s.tune(whistle, WHISTLE, 84, 76, legato=0.92)
    return s


# ---------------------------------------------------------------- Willowbrook

def farm() -> Score:
    s = Score(bpm=116, beats_per_bar=4, bars=32, seed=7, room=0.4, wet=0.5)
    BASS, GUITAR, BANJO, FIDDLE, FIDDLE2 = 0, 1, 2, 3, 4
    s.instrument(BASS, 32, 104, reverb=20)                 # acoustic bass
    s.instrument(GUITAR, 25, 78, pan=40, reverb=35)        # steel-string guitar
    s.instrument(BANJO, 105, 74, pan=88, reverb=35)        # banjo
    s.instrument(FIDDLE, 110, 96, pan=56, reverb=55)       # fiddle
    s.instrument(FIDDLE2, 110, 78, pan=78, reverb=55)      # a second fiddle, for the harmony
    s.instrument(DRUMS, 0, 70, reverb=25)
    chords = ['G', 'C', 'G', 'D', 'G', 'C', 'G', 'D',      # the groove
              'G', 'C', 'G', 'D', 'G', 'C', 'D', 'G',      # the fiddle's tune
              'C', 'C', 'G', 'G', 'C', 'Am', 'D', 'D7',    # its bridge
              'G', 'C', 'G', 'D', 'G', 'C', 'D', 'G']      # the tune again, two fiddles
    root = {'G': 43, 'C': 48, 'D': 50, 'Am': 45, 'D7': 50}
    fifth = {'G': 50, 'C': 43, 'D': 45, 'Am': 52, 'D7': 45}
    strum = {'G': [55, 59, 62, 67], 'C': [55, 60, 64, 67], 'D': [57, 62, 66, 69], 'Am': [57, 60, 64, 69], 'D7': [57, 60, 66, 69]}
    roll = {'G': [59, 62, 67, 71], 'C': [60, 64, 67, 72], 'D': [62, 66, 69, 74], 'Am': [60, 64, 69, 72], 'D7': [60, 66, 69, 74]}
    s.chords = chords
    for bar, c in enumerate(chords):
        nxt = chords[(bar + 1) % len(chords)]
        # Bass: root on 1, fifth on 3, and a walk up into a new chord.
        s.note(bar, 0, root[c], 0.9, 92, BASS)
        if nxt != c and bar % 2 == 1:
            s.note(bar, 2, fifth[c], 0.9, 80, BASS)
            target = root[nxt]
            s.note(bar, 3, target - 2, 0.45, 72, BASS)
            s.note(bar, 3.5, target - 1, 0.45, 72, BASS)
        else:
            s.note(bar, 2, fifth[c], 1.8, 84, BASS)
        # Guitar: the chick on 2 and 4, a light upstroke before 4 in every other bar.
        s.chord(bar, 1, strum[c], 0.4, 70, GUITAR)
        s.chord(bar, 3, strum[c], 0.4, 74, GUITAR)
        if bar % 2:
            s.chord(bar, 2.5, strum[c][1:], 0.3, 48, GUITAR, down=False)
        # Banjo: a forward roll in eighths, louder while there's no fiddle.
        lead = bar >= 8
        for i, k in enumerate([3, 1, 0, 3, 1, 0, 3, 2]):
            s.note(bar, i * 0.5, roll[c][k], 0.45, (52 if lead else 70) - (0 if i % 3 == 0 else 8), BANJO)
        # Shaker in eighths, tambourine on 2 and 4, claps with the two fiddles.
        for i in range(8):
            s.note(bar, i * 0.5, 70, 0.2, 52 if i % 2 == 0 else 36, DRUMS)
        for b in (1, 3):
            s.note(bar, b, 54, 0.2, 40, DRUMS)
            if bar >= 24:
                s.note(bar, b, 39, 0.2, 42, DRUMS)
        if bar % 8 == 0:
            s.note(bar, 0, 36, 0.3, 50, DRUMS)
    tune = [
        (8, 0, 71, 0.5), (8, 0.5, 74, 0.5), (8, 1, 79, 1), (8, 2, 78, 0.5), (8, 2.5, 79, 0.5), (8, 3, 81, 1),
        (9, 0, 79, 1.5), (9, 1.5, 76, 0.5), (9, 2, 72, 1), (9, 3, 76, 1),
        (10, 0, 74, 1), (10, 1, 71, 0.5), (10, 1.5, 74, 0.5), (10, 2, 79, 1), (10, 3, 74, 1),
        (11, 0, 78, 1.5), (11, 1.5, 76, 0.5), (11, 2, 74, 2),
        (12, 0, 71, 0.5), (12, 0.5, 74, 0.5), (12, 1, 79, 1), (12, 2, 81, 0.5), (12, 2.5, 83, 0.5), (12, 3, 86, 1),
        (13, 0, 84, 1.5), (13, 1.5, 83, 0.5), (13, 2, 79, 1), (13, 3, 76, 1),
        (14, 0, 74, 0.5), (14, 0.5, 78, 0.5), (14, 1, 81, 1), (14, 2, 78, 1), (14, 3, 72, 1),
        (15, 0, 71, 2), (15, 2, 74, 0.5), (15, 2.5, 71, 0.5), (15, 3, 67, 1),
    ]
    bridge = [
        (16, 0, 76, 1), (16, 1, 79, 1), (16, 2, 84, 1.5), (16, 3.5, 83, 0.5),
        (17, 0, 81, 1), (17, 1, 79, 1), (17, 2, 76, 2),
        (18, 0, 79, 1), (18, 1, 83, 1), (18, 2, 86, 1.5), (18, 3.5, 84, 0.5),
        (19, 0, 83, 1), (19, 1, 81, 1), (19, 2, 79, 2),
        (20, 0, 76, 0.5), (20, 0.5, 79, 0.5), (20, 1, 84, 1), (20, 2, 83, 0.5), (20, 2.5, 81, 0.5), (20, 3, 79, 1),
        (21, 0, 81, 1.5), (21, 1.5, 79, 0.5), (21, 2, 76, 1), (21, 3, 72, 1),
        (22, 0, 74, 1), (22, 1, 78, 1), (22, 2, 81, 1), (22, 3, 78, 1),
        (23, 0, 84, 1.5), (23, 1.5, 81, 0.5), (23, 2, 78, 1), (23, 3, 74, 1),
    ]
    s.tune(tune, FIDDLE, 88, 80, legato=0.96)
    s.tune(bridge, FIDDLE, 88, 80, legato=0.96)
    s.tune(tune, FIDDLE, 90, 82, legato=0.96, shift=16)
    # The second fiddle a third under the tune.
    s.tune([(b, beat, harmony(p, chords[b + 16], G_MAJOR), n) for b, beat, p, n in tune], FIDDLE2, 76, 70, legato=0.96, shift=16)
    return s


# ---------------------------------------------------------------- Starlight Fun Park

def park() -> Score:
    s = Score(bpm=152, beats_per_bar=3, bars=48, seed=5, room=0.6, wet=0.6)
    TUBA, ORGAN, CALLIOPE, GLOCK = 0, 1, 2, 3
    s.instrument(TUBA, 58, 96, reverb=30)                  # tuba
    s.instrument(ORGAN, 21, 64, pan=46, reverb=40)         # accordion
    s.instrument(CALLIOPE, 82, 90, pan=64, reverb=50)      # calliope
    s.instrument(GLOCK, 9, 56, pan=86, reverb=55)          # glockenspiel
    s.instrument(DRUMS, 0, 68, reverb=40)
    s.fold = {CALLIOPE}
    chords = ['C', 'C', 'G7', 'G7', 'G7', 'G7', 'C', 'C',
              'C', 'C', 'F', 'F', 'C', 'G7', 'C', 'C',
              'F', 'F', 'C', 'C', 'G7', 'G7', 'C', 'C',
              'F', 'F', 'C', 'A7', 'Dm', 'G7', 'C', 'C7',
              # The trio, in F, gentler; back to C by way of D7 and G7.
              'F', 'F', 'C7', 'C7', 'C7', 'C7', 'F', 'F',
              'Bb', 'Bb', 'F', 'F', 'D7', 'D7', 'G7', 'G7']
    root = {'C': 48, 'G7': 43, 'F': 41, 'A7': 45, 'Dm': 50, 'C7': 48, 'Bb': 46, 'D7': 50}
    alt = {'C': 43, 'G7': 50, 'F': 48, 'A7': 52, 'Dm': 45, 'C7': 43, 'Bb': 41, 'D7': 45}
    pah = {'C': [60, 64, 67], 'G7': [59, 65, 67], 'F': [60, 65, 69], 'A7': [61, 64, 67], 'Dm': [62, 65, 69],
           'C7': [60, 64, 70], 'Bb': [62, 65, 70], 'D7': [60, 66, 69]}
    s.chords = chords
    for bar, c in enumerate(chords):
        trio = bar >= 32
        same = bar > 0 and chords[bar - 1] == c
        s.note(bar, 0, alt[c] if same else root[c], 0.9, 86 if trio else 92, TUBA)
        for beat in (1, 2):
            s.chord(bar, beat, pah[c], 0.45, 54 if trio else 62, ORGAN, strum=0.008)
        s.note(bar, 0, 36, 0.2, 56 if trio else 64, DRUMS)
        for beat in (1, 2):
            s.note(bar, beat, 38, 0.15, 24 if trio else 30, DRUMS)
        if bar % 4 == 0:
            s.note(bar, 0, 81, 0.5, 42, DRUMS)
    tune = [
        (0, 0, 67, 1), (0, 1, 72, 1), (0, 2, 76, 1), (1, 0, 79, 2), (1, 2, 76, 1),
        (2, 0, 77, 1), (2, 1, 74, 1), (2, 2, 71, 1), (3, 0, 79, 2), (3, 2, 77, 1),
        (4, 0, 77, 1), (4, 1, 76, 1), (4, 2, 74, 1), (5, 0, 71, 2), (5, 2, 74, 1),
        (6, 0, 76, 1), (6, 1, 74, 1), (6, 2, 72, 1), (7, 0, 72, 2), (7, 2, 67, 1),
        (8, 0, 72, 1), (8, 1, 76, 1), (8, 2, 79, 1), (9, 0, 84, 2), (9, 2, 79, 1),
        (10, 0, 81, 1), (10, 1, 77, 1), (10, 2, 72, 1), (11, 0, 81, 2), (11, 2, 79, 1),
        (12, 0, 79, 1), (12, 1, 76, 1), (12, 2, 72, 1), (13, 0, 74, 1), (13, 1, 77, 1), (13, 2, 71, 1),
        (14, 0, 72, 3), (15, 0, 67, 1), (15, 1, 69, 1), (15, 2, 71, 1),
        (16, 0, 72, 1), (16, 1, 77, 1), (16, 2, 81, 1), (17, 0, 84, 2), (17, 2, 81, 1),
        (18, 0, 79, 1), (18, 1, 76, 1), (18, 2, 72, 1), (19, 0, 79, 2), (19, 2, 76, 1),
        (20, 0, 77, 1), (20, 1, 79, 1), (20, 2, 77, 1), (21, 0, 74, 2), (21, 2, 71, 1),
        (22, 0, 72, 1), (22, 1, 76, 1), (22, 2, 79, 1), (23, 0, 84, 3),
        (24, 0, 81, 1), (24, 1, 84, 1), (24, 2, 81, 1), (25, 0, 77, 2), (25, 2, 72, 1),
        (26, 0, 76, 1), (26, 1, 79, 1), (26, 2, 84, 1), (27, 0, 85, 2), (27, 2, 81, 1),
        (28, 0, 86, 1), (28, 1, 81, 1), (28, 2, 77, 1), (29, 0, 79, 1), (29, 1, 77, 1), (29, 2, 74, 1),
        (30, 0, 72, 2), (30, 2, 76, 1), (31, 0, 76, 1), (31, 1, 72, 1), (31, 2, 70, 1),
        # The trio.
        (32, 0, 77, 2), (32, 2, 81, 1), (33, 0, 84, 3),
        (34, 0, 82, 2), (34, 2, 79, 1), (35, 0, 76, 3),
        (36, 0, 79, 1), (36, 1, 82, 1), (36, 2, 84, 1), (37, 0, 88, 2), (37, 2, 84, 1),
        (38, 0, 81, 3), (39, 0, 77, 1), (39, 1, 79, 1), (39, 2, 81, 1),
        (40, 0, 82, 2), (40, 2, 86, 1), (41, 0, 86, 3),
        (42, 0, 84, 2), (42, 2, 81, 1), (43, 0, 77, 3),
        (44, 0, 78, 2), (44, 2, 81, 1), (45, 0, 84, 2), (45, 2, 81, 1),
        (46, 0, 79, 2), (46, 2, 77, 1), (47, 0, 74, 1), (47, 1, 71, 1), (47, 2, 67, 1),
    ]
    s.tune(tune, CALLIOPE, 86, 76, legato=0.9)
    # The glockenspiel doubles the tune an octave up on the first beat of each bar.
    s.tune([n for n in tune if n[1] == 0], GLOCK, 60, 60, legato=0.4, transpose=12)
    return s


def musicbox() -> Score:
    s = Score(bpm=76, beats_per_bar=3, bars=16, seed=13, room=0.7, wet=0.7)
    BOX = 0
    s.instrument(BOX, 10, 100, reverb=60)                  # music box
    chords = ['C', 'Am', 'F', 'G', 'C', 'Am', 'Dm', 'G',
              'F', 'G', 'Em', 'Am', 'Dm', 'G', 'C', 'G']
    low = {'C': 60, 'Am': 57, 'F': 53, 'G': 55, 'Dm': 50, 'Em': 52}
    pair = {'C': [64, 67], 'Am': [64, 72], 'F': [65, 69], 'G': [67, 71], 'Dm': [65, 69], 'Em': [67, 71]}
    s.chords = chords
    for bar, c in enumerate(chords):
        s.note(bar, 0, low[c], 2.8, 70, BOX)
        for beat in (1, 2):
            s.chord(bar, beat, pair[c], 0.9, 50, BOX, strum=0.01)
    tune = [
        (0, 0, 79, 2), (0, 2, 76, 1), (1, 0, 81, 2), (1, 2, 76, 1),
        (2, 0, 77, 1), (2, 1, 81, 1), (2, 2, 84, 1), (3, 0, 83, 2), (3, 2, 79, 1),
        (4, 0, 84, 2), (4, 2, 79, 1), (5, 0, 81, 1), (5, 1, 79, 1), (5, 2, 76, 1),
        (6, 0, 77, 2), (6, 2, 74, 1), (7, 0, 79, 3),
        (8, 0, 81, 2), (8, 2, 77, 1), (9, 0, 79, 2), (9, 2, 74, 1),
        (10, 0, 76, 1), (10, 1, 79, 1), (10, 2, 83, 1), (11, 0, 84, 3),
        (12, 0, 81, 2), (12, 2, 77, 1), (13, 0, 79, 1), (13, 1, 77, 1), (13, 2, 74, 1),
        (14, 0, 76, 2), (14, 2, 72, 1), (15, 0, 74, 2), (15, 2, 71, 1),
    ]
    s.tune(tune, BOX, 92, 82, legato=1.0)
    return s


# ---------------------------------------------------------------- Skyport

def skyport() -> Score:
    s = Score(bpm=98, beats_per_bar=4, bars=32, seed=11, room=0.75, wet=0.7)
    BASS, EP, PAD, VIBES, FLUTE = 0, 1, 2, 3, 4
    s.instrument(BASS, 33, 100, reverb=20)                 # finger bass
    s.instrument(EP, 4, 84, pan=50, reverb=50, chorus=15)  # electric piano
    s.instrument(PAD, 89, 50, pan=74, reverb=70)           # warm pad
    s.instrument(VIBES, 11, 92, pan=82, reverb=60)         # vibraphone
    s.instrument(FLUTE, 73, 88, pan=56, reverb=65)         # flute
    s.instrument(DRUMS, 0, 72, reverb=30)
    s.fold = {EP}
    chords = ['Fmaj7', 'Fmaj7', 'Gm7', 'C9', 'Am7', 'D7', 'Gm7', 'C7sus',      # the lounge
              'Bbmaj7', 'Bbmaj7', 'Am7', 'Dm7', 'Gm7', 'C9', 'Fmaj7', 'D7',    # the vibraphone's tune
              'Gm7', 'C9', 'Am7', 'Dm7', 'Bbmaj7', 'Bbm6', 'Gm7', 'C7sus',     # the flute's
              'Bbmaj7', 'Bbmaj7', 'Am7', 'Dm7', 'Gm7', 'C9', 'Fmaj7', 'C7sus']  # both together, back to F
    root = {'Fmaj7': 41, 'Gm7': 43, 'C9': 48, 'C7sus': 48, 'Am7': 45, 'D7': 50, 'Bbmaj7': 46, 'Dm7': 50, 'Bbm6': 46}
    fifth = {'Fmaj7': 48, 'Gm7': 50, 'C9': 43, 'C7sus': 43, 'Am7': 52, 'D7': 45, 'Bbmaj7': 53, 'Dm7': 45, 'Bbm6': 53}
    voicing = {
        'Fmaj7': [57, 60, 64, 67], 'Gm7': [58, 62, 65, 69], 'C9': [58, 62, 64, 67], 'C7sus': [58, 60, 65, 67],
        'Am7': [60, 64, 67, 71], 'D7': [60, 64, 66, 69], 'Bbmaj7': [57, 62, 65, 69], 'Dm7': [53, 57, 60, 64],
        'Bbm6': [61, 65, 67, 70],
    }
    s.chords = chords
    for bar, c in enumerate(chords):
        nxt = chords[(bar + 1) % len(chords)]
        # Bass: root, fifth, and a step into the next chord.
        s.note(bar, 0, root[c], 1.4, 90, BASS)
        s.note(bar, 1.5, fifth[c], 0.4, 62, BASS)
        s.note(bar, 2, fifth[c], 1.3, 80, BASS)
        if nxt != c:
            s.note(bar, 3.5, root[nxt] + (1 if root[nxt] < root[c] else -1), 0.4, 66, BASS)
        # Electric piano: the bossa's push, in two-bar turns.
        hits = [(0, 1.0), (1.5, 0.45), (2.5, 1.2)] if bar % 2 == 0 else [(0.5, 1.0), (2, 0.45), (3, 0.9)]
        for beat, length in hits:
            s.chord(bar, beat, voicing[c], length, 62 if beat else 68, EP, strum=0.012)
        # Pad: the chord, held.
        s.chord(bar, 0, voicing[c][:3], 3.9, 46, PAD, strum=0)
        # Brushes: rim clave (3-2), soft kick, closed hats and a shaker.
        for beat in ([0, 1.5, 3] if bar % 2 == 0 else [1, 2.5]):
            s.note(bar, beat, 37, 0.2, 58, DRUMS)
        for beat, v in ((0, 62), (1.5, 34), (2, 54), (3.5, 34)):
            s.note(bar, beat, 36, 0.2, v, DRUMS)
        for i in range(8):
            s.note(bar, i * 0.5, 42, 0.2, 40 if i % 2 == 0 else 28, DRUMS)
            s.note(bar, i * 0.5 + 0.25, 69, 0.1, 22, DRUMS)
    # The lounge: a soft rising chime on the vibraphone every four bars.
    for bar in (0, 4):
        for k, (beat, pitch) in enumerate(((0, 72), (0.5, 76), (1, 79), (1.5, 84))):
            s.note(bar, beat, pitch, 2.5 - beat, 66 - k * 3, VIBES)
    tune = [
        (8, 0, 74, 1), (8, 1, 77, 1), (8, 2, 81, 1.5), (8, 3.5, 79, 0.5),
        (9, 0, 77, 2), (9, 2, 74, 1), (9, 3, 72, 1),
        (10, 0, 72, 1), (10, 1, 76, 1), (10, 2, 79, 1.5), (10, 3.5, 77, 0.5),
        (11, 0, 77, 2), (11, 2, 72, 1), (11, 3, 69, 1),
        (12, 0, 70, 1), (12, 1, 74, 1), (12, 2, 77, 1.5), (12, 3.5, 76, 0.5),
        (13, 0, 74, 1), (13, 1, 76, 1), (13, 2, 79, 1), (13, 3, 82, 1),
        (14, 0, 81, 2.5), (14, 2.5, 79, 0.5), (14, 3, 76, 1),
    ]
    s.tune(tune + [(15, 0, 78, 1.5), (15, 1.5, 74, 0.5), (15, 2, 72, 1), (15, 3, 69, 1)], VIBES, 84, 76, legato=1.0)
    flute = [
        (16, 0, 74, 1.5), (16, 1.5, 77, 0.5), (16, 2, 81, 1), (16, 3, 79, 1),
        (17, 0, 76, 2), (17, 2, 74, 1), (17, 3, 70, 1),
        (18, 0, 72, 1.5), (18, 1.5, 76, 0.5), (18, 2, 79, 1), (18, 3, 81, 1),
        (19, 0, 77, 2), (19, 2, 76, 1), (19, 3, 72, 1),
        (20, 0, 74, 1), (20, 1, 77, 1), (20, 2, 81, 1.5), (20, 3.5, 79, 0.5),
        (21, 0, 77, 1.5), (21, 1.5, 73, 0.5), (21, 2, 70, 2),
        (22, 0, 74, 1), (22, 1, 72, 1), (22, 2, 70, 1), (22, 3, 67, 1),
        (23, 0, 72, 2), (23, 2, 70, 1), (23, 3, 67, 1),
    ]
    s.tune(flute, FLUTE, 80, 72)
    # Both together: the flute takes the vibraphone's tune, the vibraphone a third under it.
    together = tune + [(15, 0, 72, 2), (15, 2, 70, 1), (15, 3, 67, 1)]
    s.tune(together, FLUTE, 82, 74, shift=16)
    s.tune([(b, beat, harmony(p, chords[b + 16], F_MAJOR), n) for b, beat, p, n in together], VIBES, 72, 66, legato=1.0, shift=16)
    return s


# ---------------------------------------------------------------- Jingles (in seconds: 60 beats a minute)

def jingle_build() -> Score:
    """Something built: a quick run up on marimba and glockenspiel, then a bright brass chord with a timpani."""
    s = Score(bpm=60, beats_per_bar=4, bars=1.45 / 4, seed=21, room=0.4, wet=0.5)
    MARIMBA, GLOCK, BRASS, TIMPANI = 0, 1, 2, 3
    s.instrument(MARIMBA, 12, 110, pan=54, reverb=40)
    s.instrument(GLOCK, 9, 90, pan=80, reverb=50)
    s.instrument(BRASS, 61, 104, pan=60, reverb=45)
    s.instrument(TIMPANI, 47, 100, reverb=40)
    s.instrument(DRUMS, 0, 80, reverb=50)
    for i, p in enumerate((72, 76, 79, 84)):
        s.note(0, i * 0.09, p, 0.12, 92 + i * 4, MARIMBA, loose=0)
        s.note(0, i * 0.09, p + 12, 0.12, 70 + i * 4, GLOCK, loose=0)
    s.chord(0, 0.38, [60, 64, 67, 72], 0.75, 104, BRASS, strum=0)
    s.chord(0, 0.38, [84, 88, 91, 96], 0.3, 72, GLOCK, strum=0.03)
    s.note(0, 0.38, 48, 0.6, 100, TIMPANI, loose=0)
    s.note(0, 0.38, 49, 0.8, 54, DRUMS)
    return s


def jingle_reward() -> Score:
    """A reward: a sparkling celesta run up to a ringing chord."""
    s = Score(bpm=60, beats_per_bar=4, bars=0.95 / 4, seed=22, room=0.5, wet=0.6)
    CELESTA, VIBES, GLOCK = 0, 1, 2
    s.instrument(CELESTA, 8, 112, pan=58, reverb=50)
    s.instrument(VIBES, 11, 96, pan=70, reverb=55)
    s.instrument(GLOCK, 9, 84, pan=84, reverb=55)
    for i, p in enumerate((79, 84, 88)):
        s.note(0, i * 0.07, p, 0.12, 96 + i * 4, CELESTA, loose=0)
    s.note(0, 0.21, 91, 0.6, 108, CELESTA, loose=0)
    s.chord(0, 0.21, [72, 76, 79, 84], 0.65, 80, VIBES, strum=0.01)
    s.note(0, 0.21, 96, 0.5, 70, GLOCK, loose=0)
    return s


def jingle_vip() -> Score:
    """A VIP: a harp sweeping up, then a soft, rich vibraphone chord."""
    s = Score(bpm=60, beats_per_bar=4, bars=1.1 / 4, seed=23, room=0.7, wet=0.7)
    HARP, VIBES, GLOCK = 0, 1, 2
    s.instrument(HARP, 46, 110, pan=50, reverb=60)
    s.instrument(VIBES, 11, 100, pan=72, reverb=65)
    s.instrument(GLOCK, 9, 74, pan=86, reverb=65)
    for i, p in enumerate((65, 67, 69, 72, 74, 77, 79, 81, 84)):
        s.note(0, i * 0.035, p, 0.6, 76 + i * 3, HARP, loose=0)
    s.chord(0, 0.34, [65, 69, 72, 76, 79], 0.7, 88, VIBES, strum=0.012)
    s.note(0, 0.34, 89, 0.5, 64, GLOCK, loose=0)
    return s


def jingle_mission() -> Score:
    """A goal done: a short brass "da-DAH!" with a snare."""
    s = Score(bpm=60, beats_per_bar=4, bars=0.5 / 4, seed=24, room=0.4, wet=0.5)
    TRUMPET, BRASS, GLOCK = 0, 1, 2
    s.instrument(TRUMPET, 56, 112, pan=58, reverb=40)
    s.instrument(BRASS, 61, 104, pan=66, reverb=40)
    s.instrument(GLOCK, 9, 80, pan=84, reverb=45)
    s.instrument(DRUMS, 0, 84, reverb=40)
    s.note(0, 0, 67, 0.09, 100, TRUMPET, loose=0)
    s.note(0, 0.11, 72, 0.32, 112, TRUMPET, loose=0)
    s.chord(0, 0.11, [60, 64, 67], 0.32, 100, BRASS, strum=0)
    s.note(0, 0.11, 84, 0.3, 76, GLOCK, loose=0)
    s.note(0, 0, 38, 0.1, 64, DRUMS)
    s.note(0, 0.11, 38, 0.1, 84, DRUMS)
    return s


LOOPS = {'roadside': roadside, 'farm': farm, 'park': park, 'skyport': skyport, 'musicbox': musicbox}
JINGLES = {'build': jingle_build, 'reward': jingle_reward, 'vip': jingle_vip, 'mission': jingle_mission}


def play(score: Score, tmp: Path, times: int) -> np.ndarray:
    """FluidSynth's stereo recording of the score (float, so nothing clips), its folded channels centred."""
    if not score.fold:
        return record(score, tmp, times)
    notes = score.notes
    score.notes = [n for n in notes if n[2] not in score.fold]
    rest = record(score, tmp, times)
    score.notes = [n for n in notes if n[2] in score.fold]
    folded = record(score, tmp, times)
    score.notes = notes
    n = min(len(rest), len(folded))
    return rest[:n] + folded[:n, :1] * 0.85


def record(score: Score, tmp: Path, times: int) -> np.ndarray:
    mid = tmp / 'score.mid'
    wav = tmp / 'score.wav'
    score.midi(mid, times=times)
    subprocess.run(['fluidsynth', '-ni', '-q', '-g', '0.5', '-r', str(RATE), '-o', 'audio.file.format=float',
                    '-o', f'synth.reverb.room-size={score.room}', '-o', f'synth.reverb.level={score.wet}',
                    '-o', 'synth.reverb.width=0.9', '-o', 'synth.reverb.damp=0.35',
                    '-F', str(wav), SOUNDFONT, str(mid)], check=True)
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(wav), '-ac', '2', '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


def filtered(audio: np.ndarray, chain: str) -> np.ndarray:
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'f32le', '-ar', str(RATE), '-ac', '2', '-i', '-', '-af', chain, '-f', 'f32le', '-'],
                         input=audio.astype(np.float32).tobytes(), capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


def loudness(audio: np.ndarray) -> float:
    """Integrated loudness (LUFS, EBU R128), as ffmpeg measures it."""
    report = subprocess.run(['ffmpeg', '-v', 'info', '-f', 'f32le', '-ar', str(RATE), '-ac', str(audio.shape[1]), '-i', '-', '-af', 'ebur128', '-f', 'null', '-'],
                            input=audio.astype(np.float32).tobytes(), capture_output=True, check=True).stderr.decode()
    return float([line for line in report.splitlines() if line.strip().startswith('I:')][-1].split()[1])


def encode(audio: np.ndarray, out: Path, kbps: int):
    """Mono MP3 like the game's other sounds (phone speakers are mono, and the stereo halves were kept from cancelling)."""
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(RATE), '-ac', str(audio.shape[1]), '-i', '-',
                    '-ac', '1', '-codec:a', 'libmp3lame', '-abr', '1', '-b:a', f'{kbps}k', str(out)], input=audio.astype(np.float32).tobytes(), check=True)


def render_loop(name: str, out_dir: Path) -> Path:
    score = LOOPS[name]()
    with tempfile.TemporaryDirectory() as tmp:
        audio = play(score, Path(tmp), times=1)
    # Once through, then what rings on past the end (held notes, echoes) laid over the start.
    n = round(score.seconds * RATE)
    loop = audio[:n].copy()
    tail = audio[n:]
    while len(tail):
        loop[:min(n, len(tail))] += tail[:n]
        tail = tail[n:]
    # A gentle glue, run over the loop going round twice so its start and end are squeezed alike.
    loop = filtered(np.concatenate([loop, loop]), 'acompressor=threshold=0.125:ratio=2:attack=20:release=250')[n:2 * n].copy()
    # Mono, as it's saved (its loudness set on what's heard).
    loop = loop.mean(axis=1, keepdims=True)
    loop *= 10 ** ((LOOP_LUFS - loudness(loop)) / 20)
    peak = np.abs(loop).max()
    if peak > 0.89:
        loop *= 0.89 / peak
    out = out_dir / f'{name}-music.mp3' if name != 'musicbox' else out_dir / 'musicbox.mp3'
    kbps = min(64, int(FILE_BUDGET * 8 / score.seconds / 1000))
    encode(loop, out, kbps)
    print(f'{out}: {score.seconds:.1f}s, {score.bars} bars at {score.bpm} BPM, {kbps} kbps')
    return out


def render_jingle(name: str, out_dir: Path) -> Path:
    score = JINGLES[name]()
    with tempfile.TemporaryDirectory() as tmp:
        audio = play(score, Path(tmp), times=1)
    n = round(score.seconds * RATE)
    clip = audio[:n].copy()
    fade = round(0.12 * RATE)
    clip[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
    mono = clip.mean(axis=1, keepdims=True)
    hop = RATE // 20
    loudest = max(np.sqrt(np.mean(mono[i:i + hop] ** 2)) for i in range(0, n - hop, hop // 2))
    mono *= 10 ** (JINGLE_PEAK_RMS_DB / 20) / loudest
    peak = np.abs(mono).max()
    if peak > 0.84:
        mono *= 0.84 / peak
    out = out_dir / f'jingle-{name}.mp3'
    encode(mono, out, 64)
    print(f'{out}: {score.seconds:.2f}s')
    return out


if __name__ == '__main__':
    out_dir = Path(sys.argv[1])
    out_dir.mkdir(parents=True, exist_ok=True)
    for name in sys.argv[2:] or [*LOOPS, *JINGLES]:
        if name in LOOPS:
            render_loop(name, out_dir)
        else:
            render_jingle(name, out_dir)
