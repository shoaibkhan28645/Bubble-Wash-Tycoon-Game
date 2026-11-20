# The gameplay trailer: the cover, the recorded shots as they were played (no captions over them), the end
# card; each town's own music under its shots, the reward jingle on the end card.
#   python3 assemble_play.py <cover.jpg> <playnow.png> <audio dir (public/audio)> <frames dir> <out.mp4>
import os
import subprocess
import sys

cover, playnow, audio, frames, out = sys.argv[1:6]
FPS = 30
FADE = 0.5
INTRO, OUTRO = 2.5, 3.5
# The shots in order, with the town whose music plays under them.
SHOTS = [('1-wash', 'roadside'), ('2-build', 'roadside'), ('3-busy', 'roadside'), ('4-farm', 'farm'), ('5-park', 'park'), ('6-airport', 'skyport')]
MUSIC = {
    'roadside': f'{audio}/roadside/roadside-music.mp3',
    'farm': f'{audio}/farm/farm-music.mp3',
    'park': f'{audio}/park/park-music.mp3',
    'skyport': f'{audio}/skyport/skyport-music.mp3',
}

lengths = [INTRO] + [len(os.listdir(f'{frames}/{name}')) / FPS for name, _ in SHOTS] + [OUTRO]
# Where each part starts in the trailer (each dissolve overlaps the part before by FADE).
starts = [0.0]
for k in range(1, len(lengths)):
    starts.append(starts[-1] + lengths[k - 1] - FADE)
total = starts[-1] + lengths[-1]

inputs, chains = [], []
def add(*args):
    inputs.extend(args)
    return sum(1 for a in inputs if a == '-i') - 1

# The cover, gently pushing in, up from black.
i = add('-loop', '1', '-framerate', str(FPS), '-t', f'{INTRO:.3f}', '-i', cover)
chains.append(f"[{i}:v]scale=3840:-2,zoompan=z='1+0.04*on/{int(INTRO*FPS)}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps={FPS},"
              f"trim=duration={INTRO},fade=t=in:st=0:d=0.4,setsar=1,format=yuv420p,fps={FPS},settb=AVTB,setpts=PTS-STARTPTS[s0]")
# The shots, just as they were played.
for k, (name, _) in enumerate(SHOTS, 1):
    v = add('-framerate', str(FPS), '-i', f'{frames}/{name}/f%04d.jpg')
    chains.append(f"[{v}:v]scale=1920:1080,setsar=1,format=yuv420p,fps={FPS},settb=AVTB,setpts=PTS-STARTPTS[s{k}]")
# The end card: the cover easing back, "Play now!" coming up.
n = len(SHOTS) + 1
i = add('-loop', '1', '-framerate', str(FPS), '-t', f'{OUTRO:.3f}', '-i', cover)
c = add('-loop', '1', '-framerate', str(FPS), '-t', f'{OUTRO:.3f}', '-i', playnow)
chains.append(
    f"[{i}:v]scale=3840:-2,zoompan=z='1.04-0.04*on/{int(OUTRO*FPS)}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps={FPS},trim=duration={OUTRO}[endbg];"
    f"[{c}:v]format=rgba,fade=t=in:st=0.5:d=0.4:alpha=1[endcap];"
    f"[endbg][endcap]overlay=0:0:shortest=1,setsar=1,format=yuv420p,fps={FPS},settb=AVTB,setpts=PTS-STARTPTS[s{n}]")
prev = 's0'
for k in range(1, n + 1):
    label = f'x{k}' if k < n else 'vout'
    chains.append(f"[{prev}][s{k}]xfade=transition=fade:duration={FADE}:offset={starts[k]:.3f}[{label}]")
    prev = label

# The music: each town's from its first shot until the next town's, crossfading at the dissolve; the last
# carries on under the end card and fades out.
runs = []
for k, (_, town) in enumerate(SHOTS, 1):
    if runs and runs[-1][0] == town:
        continue
    runs.append([town, starts[k] if runs else 0.0])
mixes = []
for r, (town, at) in enumerate(runs):
    until = runs[r + 1][1] + FADE if r + 1 < len(runs) else total
    length = until - at
    m = add('-i', MUSIC[town])
    fade_in = 0.3 if r == 0 else 0.8
    tail = 1.6 if r + 1 == len(runs) else 0.8
    chains.append(f"[{m}:a]atrim=duration={length:.3f},asetpts=PTS-STARTPTS,afade=t=in:d={fade_in},afade=t=out:st={length-tail:.3f}:d={tail},"
                  f"adelay={int(at*1000)}|{int(at*1000)},volume=1.2[m{r}]")
    mixes.append(f'[m{r}]')
j = add('-i', f'{audio}/jingle-reward.mp3')
at = int((starts[-1] + 0.5) * 1000)
chains.append(f"[{j}:a]adelay={at}|{at},volume=1.0[jin]")
chains.append(f"{''.join(mixes)}[jin]amix=inputs={len(mixes) + 1}:duration=longest:normalize=0,alimiter=limit=0.95,apad[aout]")
cmd = ['ffmpeg', '-v', 'error', '-y', *inputs, '-filter_complex', ';'.join(chains), '-map', '[vout]', '-map', '[aout]',
       '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', str(FPS),
       '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-movflags', '+faststart', '-t', f'{total:.3f}', out]
subprocess.run(cmd, check=True)
print(out, f'{total:.2f} s; parts start at', ', '.join(f'{s:.2f}' for s in starts))
