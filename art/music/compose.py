"""The towns' music, written for Main Street Mogul: each tune is a score in
this file, played by FluidSynth with the FluidR3 GM instruments (MIT) and cut
into a seamless loop.

- farm:    Willowbrook. A sunny hoedown in G: banjo rolls, boom-chick guitar,
           bass and shaker, then the fiddle's tune and its bridge.
- skyport: Skyport. A light bossa nova in F for the departure lounge: electric
           piano, warm pad, finger bass, brushes; the vibraphone's tune, then
           a flute's.
- park:    Starlight Fun Park. A carnival waltz in C: calliope with
           glockenspiel, oom-pah tuba and accordion, bass drum and snare.

Each score is 24 or 32 bars. It's played twice and the second time through
is kept, so the end's echoes ring on into the start and the loop has no seam.

Usage: python art/music/compose.py <out-dir> [farm|skyport|park ...]
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

# Each track's loudness (as the in-code Roadside music, -20.5 LUFS, and the park's old track, -19.9) and its file's bit rate.
TARGET_LUFS = -20.0
BITRATE = '64k'


class Score:
    """Notes on channels, in beats; written out as a MIDI file played twice."""

    def __init__(self, bpm: float, beats_per_bar: int, bars: int, seed: int):
        self.bpm = bpm
        self.beats_per_bar = beats_per_bar
        self.bars = bars
        self.notes: list[tuple[float, float, int, int, int]] = []  # start, length, channel, pitch, velocity
        self.setup: dict[int, dict] = {}
        self.rand = random.Random(seed)

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
        """A strummed or rolled chord: each string a moment after the last."""
        order = pitches if down else list(reversed(pitches))
        for i, p in enumerate(order):
            self.note(bar, beat + i * strum, p, length - i * strum, velocity - i * 3, channel, loose=0.004)

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
        # A quiet bar at the end, for the last echoes.
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


# ---------------------------------------------------------------- Willowbrook

def farm() -> Score:
    s = Score(bpm=116, beats_per_bar=4, bars=24, seed=7)
    BASS, GUITAR, BANJO, FIDDLE = 0, 1, 2, 3
    s.instrument(BASS, 32, 104, pan=64, reverb=20)        # acoustic bass
    s.instrument(GUITAR, 25, 78, pan=44, reverb=35)       # steel-string guitar
    s.instrument(BANJO, 105, 74, pan=86, reverb=35)       # banjo
    s.instrument(FIDDLE, 110, 96, pan=60, reverb=55)      # fiddle
    s.instrument(DRUMS, 0, 70, reverb=25)
    chords = ['G', 'C', 'G', 'D', 'G', 'C', 'G', 'D',      # the groove
              'G', 'C', 'G', 'D', 'G', 'C', 'D', 'G',      # the fiddle's tune
              'C', 'C', 'G', 'G', 'C', 'Am', 'D', 'D7']    # its bridge, back home to G
    root = {'G': 43, 'C': 48, 'D': 50, 'Am': 45, 'D7': 50}
    fifth = {'G': 50, 'C': 43, 'D': 45, 'Am': 52, 'D7': 45}
    strum = {'G': [55, 59, 62, 67], 'C': [55, 60, 64, 67], 'D': [57, 62, 66, 69], 'Am': [57, 60, 64, 69], 'D7': [57, 60, 66, 69]}
    roll = {'G': [59, 62, 67, 71], 'C': [60, 64, 67, 72], 'D': [62, 66, 69, 74], 'Am': [60, 64, 69, 72], 'D7': [60, 66, 69, 74]}
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
        pattern = [3, 1, 0, 3, 1, 0, 3, 2]
        for i, k in enumerate(pattern):
            s.note(bar, i * 0.5, roll[c][k], 0.45, (52 if lead else 70) - (0 if i % 3 == 0 else 8), BANJO)
        # Shaker in eighths, tambourine on 2 and 4.
        for i in range(8):
            s.note(bar, i * 0.5, 70, 0.2, 52 if i % 2 == 0 else 36, DRUMS)
        for b in (1, 3):
            s.note(bar, b, 54, 0.2, 40, DRUMS)
        if bar % 8 == 0:
            s.note(bar, 0, 36, 0.3, 50, DRUMS)
    tune = [
        # bar, beat, pitch, beats
        (8, 0, 71, 0.5), (8, 0.5, 74, 0.5), (8, 1, 79, 1), (8, 2, 78, 0.5), (8, 2.5, 79, 0.5), (8, 3, 81, 1),
        (9, 0, 79, 1.5), (9, 1.5, 76, 0.5), (9, 2, 72, 1), (9, 3, 76, 1),
        (10, 0, 74, 1), (10, 1, 71, 0.5), (10, 1.5, 74, 0.5), (10, 2, 79, 1), (10, 3, 74, 1),
        (11, 0, 78, 1.5), (11, 1.5, 76, 0.5), (11, 2, 74, 2),
        (12, 0, 71, 0.5), (12, 0.5, 74, 0.5), (12, 1, 79, 1), (12, 2, 81, 0.5), (12, 2.5, 83, 0.5), (12, 3, 86, 1),
        (13, 0, 84, 1.5), (13, 1.5, 83, 0.5), (13, 2, 79, 1), (13, 3, 76, 1),
        (14, 0, 74, 0.5), (14, 0.5, 78, 0.5), (14, 1, 81, 1), (14, 2, 78, 1), (14, 3, 72, 1),
        (15, 0, 71, 2), (15, 2, 74, 0.5), (15, 2.5, 71, 0.5), (15, 3, 67, 1),
        (16, 0, 76, 1), (16, 1, 79, 1), (16, 2, 84, 1.5), (16, 3.5, 83, 0.5),
        (17, 0, 81, 1), (17, 1, 79, 1), (17, 2, 76, 2),
        (18, 0, 79, 1), (18, 1, 83, 1), (18, 2, 86, 1.5), (18, 3.5, 84, 0.5),
        (19, 0, 83, 1), (19, 1, 81, 1), (19, 2, 79, 2),
        (20, 0, 76, 0.5), (20, 0.5, 79, 0.5), (20, 1, 84, 1), (20, 2, 83, 0.5), (20, 2.5, 81, 0.5), (20, 3, 79, 1),
        (21, 0, 81, 1.5), (21, 1.5, 79, 0.5), (21, 2, 76, 1), (21, 3, 72, 1),
        (22, 0, 74, 1), (22, 1, 78, 1), (22, 2, 81, 1), (22, 3, 78, 1),
        (23, 0, 84, 1.5), (23, 1.5, 81, 0.5), (23, 2, 78, 1), (23, 3, 74, 1),
    ]
    for bar, beat, pitch, length in tune:
        s.note(bar, beat, pitch, length * 0.96, 88 if beat == 0 else 80, FIDDLE)
    return s


# ---------------------------------------------------------------- Skyport

def skyport() -> Score:
    s = Score(bpm=98, beats_per_bar=4, bars=24, seed=11)
    BASS, EP, PAD, VIBES, FLUTE = 0, 1, 2, 3, 4
    s.instrument(BASS, 33, 100, reverb=20)                 # finger bass
    s.instrument(EP, 4, 84, pan=52, reverb=50, chorus=40)  # electric piano
    s.instrument(PAD, 89, 50, pan=72, reverb=70)           # warm pad
    s.instrument(VIBES, 11, 92, pan=78, reverb=60)         # vibraphone
    s.instrument(FLUTE, 73, 88, pan=58, reverb=65)         # flute
    s.instrument(DRUMS, 0, 72, reverb=30)
    chords = ['Fmaj7', 'Fmaj7', 'Gm7', 'C9', 'Am7', 'D7', 'Gm7', 'C7sus',      # the lounge
              'Bbmaj7', 'Bbmaj7', 'Am7', 'Dm7', 'Gm7', 'C9', 'Fmaj7', 'D7',    # the vibraphone's tune
              'Gm7', 'C9', 'Am7', 'Dm7', 'Bbmaj7', 'Bbm6', 'Gm7', 'C7sus']     # the flute's, back to F
    root = {'Fmaj7': 41, 'Gm7': 43, 'C9': 48, 'C7sus': 48, 'Am7': 45, 'D7': 50, 'Bbmaj7': 46, 'Dm7': 50, 'Bbm6': 46}
    fifth = {'Fmaj7': 48, 'Gm7': 50, 'C9': 43, 'C7sus': 43, 'Am7': 52, 'D7': 45, 'Bbmaj7': 53, 'Dm7': 45, 'Bbm6': 53}
    voicing = {
        'Fmaj7': [57, 60, 64, 67], 'Gm7': [58, 62, 65, 69], 'C9': [58, 62, 64, 67], 'C7sus': [58, 60, 65, 67],
        'Am7': [60, 64, 67, 71], 'D7': [60, 64, 66, 69], 'Bbmaj7': [57, 62, 65, 69], 'Dm7': [53, 57, 60, 64],
        'Bbm6': [61, 65, 67, 70],
    }
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
    vibes = [
        (8, 0, 74, 1), (8, 1, 77, 1), (8, 2, 81, 1.5), (8, 3.5, 79, 0.5),
        (9, 0, 77, 2), (9, 2, 74, 1), (9, 3, 72, 1),
        (10, 0, 72, 1), (10, 1, 76, 1), (10, 2, 79, 1.5), (10, 3.5, 77, 0.5),
        (11, 0, 77, 2), (11, 2, 72, 1), (11, 3, 69, 1),
        (12, 0, 70, 1), (12, 1, 74, 1), (12, 2, 77, 1.5), (12, 3.5, 76, 0.5),
        (13, 0, 74, 1), (13, 1, 76, 1), (13, 2, 79, 1), (13, 3, 82, 1),
        (14, 0, 81, 2.5), (14, 2.5, 79, 0.5), (14, 3, 76, 1),
        (15, 0, 78, 1.5), (15, 1.5, 74, 0.5), (15, 2, 72, 1), (15, 3, 69, 1),
    ]
    for bar, beat, pitch, length in vibes:
        s.note(bar, beat, pitch, length, 84 if beat in (0, 2) else 76, VIBES)
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
    for bar, beat, pitch, length in flute:
        s.note(bar, beat, pitch, length * 0.95, 80 if beat in (0, 2) else 72, FLUTE)
    return s


# ---------------------------------------------------------------- Starlight Fun Park

def park() -> Score:
    s = Score(bpm=152, beats_per_bar=3, bars=32, seed=5)
    TUBA, ORGAN, CALLIOPE, GLOCK = 0, 1, 2, 3
    s.instrument(TUBA, 58, 96, reverb=30)                  # tuba
    s.instrument(ORGAN, 21, 64, pan=48, reverb=40)         # accordion
    s.instrument(CALLIOPE, 82, 90, pan=64, reverb=50)      # calliope
    s.instrument(GLOCK, 9, 56, pan=84, reverb=55)          # glockenspiel
    s.instrument(DRUMS, 0, 68, reverb=40)
    chords = ['C', 'C', 'G7', 'G7', 'G7', 'G7', 'C', 'C',
              'C', 'C', 'F', 'F', 'C', 'G7', 'C', 'C',
              'F', 'F', 'C', 'C', 'G7', 'G7', 'C', 'C',
              'F', 'F', 'C', 'A7', 'Dm', 'G7', 'C', 'G7']
    root = {'C': 48, 'G7': 43, 'F': 41, 'A7': 45, 'Dm': 50}
    alt = {'C': 43, 'G7': 50, 'F': 48, 'A7': 52, 'Dm': 45}
    pah = {'C': [60, 64, 67], 'G7': [59, 65, 67], 'F': [60, 65, 69], 'A7': [61, 64, 67], 'Dm': [62, 65, 69]}
    for bar, c in enumerate(chords):
        # Oom on 1 (root, then the fifth the next bar of the same chord), pah-pah on 2 and 3.
        same = bar > 0 and chords[bar - 1] == c
        s.note(bar, 0, alt[c] if same else root[c], 0.9, 92, TUBA)
        for beat in (1, 2):
            s.chord(bar, beat, pah[c], 0.45, 62, ORGAN, strum=0.008)
        s.note(bar, 0, 36, 0.2, 64, DRUMS)
        for beat in (1, 2):
            s.note(bar, beat, 38, 0.15, 30, DRUMS)
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
        (30, 0, 72, 2), (30, 2, 76, 1), (31, 0, 74, 1), (31, 1, 71, 1), (31, 2, 67, 1),
    ]
    for bar, beat, pitch, length in tune:
        s.note(bar, beat, pitch, length * 0.9, 86 if beat == 0 else 76, CALLIOPE)
        # The glockenspiel doubles the tune an octave up on the first beat of each bar.
        if beat == 0:
            s.note(bar, beat, pitch + 12, 0.5, 60, GLOCK)
    return s


SONGS = {'farm': farm, 'skyport': skyport, 'park': park}


def loudness(samples: np.ndarray) -> float:
    """Integrated loudness (LUFS, EBU R128), as ffmpeg measures it."""
    report = subprocess.run(['ffmpeg', '-v', 'info', '-f', 'f32le', '-ar', str(RATE), '-ac', '1', '-i', '-', '-af', 'ebur128', '-f', 'null', '-'],
                            input=samples.astype(np.float32).tobytes(), capture_output=True, check=True).stderr.decode()
    return float([line for line in report.splitlines() if line.strip().startswith('I:')][-1].split()[1])


def render(name: str, out_dir: Path) -> Path:
    score = SONGS[name]()
    with tempfile.TemporaryDirectory() as tmp:
        mid = Path(tmp) / f'{name}.mid'
        wav = Path(tmp) / f'{name}.wav'
        score.midi(mid)
        subprocess.run(['fluidsynth', '-ni', '-q', '-g', '0.5', '-r', str(RATE), '-F', str(wav), SOUNDFONT, str(mid)], check=True)
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(wav), '-ac', '1', '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    audio = np.frombuffer(raw, dtype=np.float32)
    # The second time through: the first time's echoes are already ringing at its start.
    n = round(score.seconds * RATE)
    loop = audio[n:2 * n].copy()
    if len(loop) < n:
        loop = np.pad(loop, (0, n - len(loop)))
    # Its loudness set to the target; the peaks kept below full scale.
    loop *= 10 ** ((TARGET_LUFS - loudness(loop)) / 20)
    peak = np.abs(loop).max()
    if peak > 0.89:
        loop *= 0.89 / peak
    out = out_dir / f'{name}-music.mp3'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(RATE), '-ac', '1', '-i', '-',
                    '-codec:a', 'libmp3lame', '-b:a', BITRATE, str(out)], input=loop.tobytes(), check=True)
    print(f'{out}: {score.seconds:.1f}s, {score.bars} bars at {score.bpm} BPM')
    return out


if __name__ == '__main__':
    out_dir = Path(sys.argv[1])
    out_dir.mkdir(parents=True, exist_ok=True)
    for name in sys.argv[2:] or list(SONGS):
        render(name, out_dir)
