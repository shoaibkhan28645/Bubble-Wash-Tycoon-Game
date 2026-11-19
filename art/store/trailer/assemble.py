# The cinematic trailer: the cover, six recorded shots and the end card, cut on the music's bars, with captions
# that slide up and fade, from frames/ (cine.cjs and captions.cjs). python3 assemble.py <cover.jpg> <music.mp3> <jingle.mp3> <out.mp4>
import subprocess
import sys

cover, music, jingle, out = sys.argv[1:5]
FPS = 30
BAR = 60 * 4 / 104          # the car wash music: 104 beats a minute, four to a bar
FADE = 0.2                  # each cut is a short dissolve, centred on the beat
SHOTS = [('1-car-wash', 'k1'), ('2-build', 'k2'), ('3-crew', 'k3'), ('4-farm', 'k4'), ('5-park', 'k5'), ('6-airport', 'k6')]
# The first frame used of each shot, where it isn't the first one recorded.
FIRST = {}
# Where each part starts, in bars: the cover, six shots of a bar and a half, the end card for two bars.
starts = [0, 1] + [1 + 1.5 * k for k in range(1, 7)]
cuts = [s * BAR for s in starts[1:]]       # the seven cuts
total = cuts[-1] + 2 * BAR
lengths = [cuts[0] + FADE / 2] + [cuts[k + 1] - cuts[k] + FADE for k in range(6)] + [total - cuts[-1] + FADE / 2]

inputs, chains = [], []
def add(*args):
    inputs.extend(args)
    return sum(1 for a in inputs if a == '-i') - 1

# The cover, slowly pushing in, faded up from black.
L = lengths[0]
i = add('-loop', '1', '-framerate', str(FPS), '-t', f'{L:.3f}', '-i', cover)
chains.append(f"[{i}:v]scale=3840:-2,zoompan=z='1+0.06*on/{int(L*FPS)}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps={FPS},"
              f"trim=duration={L:.3f},fade=t=in:st=0:d=0.35,setsar=1,format=yuv420p,fps={FPS},settb=AVTB,setpts=PTS-STARTPTS[s0]")
# The shots, each with its caption: up and in after a moment, out just before the cut.
SLIDE = "y='38*pow(1-min(max((t-0.35)/0.3,0),1),2)'"
for k, (shot, cap) in enumerate(SHOTS, 1):
    L = lengths[k]
    v = add('-framerate', str(FPS), '-start_number', str(FIRST.get(shot, 0)), '-i', f'frames/{shot}/f%04d.jpg')
    c = add('-loop', '1', '-framerate', str(FPS), '-t', f'{L:.3f}', '-i', f'frames/{cap}.png')
    chains.append(
        f"[{c}:v]format=rgba,fade=t=in:st=0.35:d=0.25:alpha=1,fade=t=out:st={L-0.6:.3f}:d=0.3:alpha=1[c{k}];"
        f"[{v}:v]scale=1920:1080,tpad=stop_mode=clone:stop_duration=0.5,trim=duration={L:.3f},setpts=PTS-STARTPTS[v{k}];"
        f"[v{k}][c{k}]overlay=x=0:{SLIDE}:eval=frame:shortest=1,setsar=1,format=yuv420p,fps={FPS},settb=AVTB,setpts=PTS-STARTPTS[s{k}]")
# The end card: the cover easing back out, "Play now!" popping up.
L = lengths[7]
i = add('-loop', '1', '-framerate', str(FPS), '-t', f'{L:.3f}', '-i', cover)
c = add('-loop', '1', '-framerate', str(FPS), '-t', f'{L:.3f}', '-i', 'frames/kend.png')
chains.append(
    f"[{i}:v]scale=3840:-2,zoompan=z='1.06-0.06*on/{int(L*FPS)}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps={FPS},trim=duration={L:.3f}[endbg];"
    f"[{c}:v]format=rgba,fade=t=in:st=0.3:d=0.25:alpha=1[endcap];"
    f"[endbg][endcap]overlay=x=0:y='38*pow(1-min(max((t-0.3)/0.3,0),1),2)':eval=frame:shortest=1,setsar=1,format=yuv420p,fps={FPS},settb=AVTB,setpts=PTS-STARTPTS[s7]")
# The dissolves, each centred on its cut.
prev = 's0'
for k in range(1, 8):
    label = f'x{k}' if k < 7 else 'vout'
    chains.append(f"[{prev}][s{k}]xfade=transition=fade:duration={FADE}:offset={cuts[k-1] - FADE / 2:.3f}[{label}]")
    prev = label
# Sound: the car wash music from its first beat, the reward jingle as "Play now!" lands.
m = add('-i', music)
j = add('-i', jingle)
jingle_at = int((cuts[-1] + 0.3) * 1000)
chains.append(
    f"[{m}:a]atrim=duration={total:.3f},afade=t=out:st={total-1.4:.3f}:d=1.4,volume=0.9[mus];"
    f"[{j}:a]adelay={jingle_at}|{jingle_at},volume=0.85[jin];"
    f"[mus][jin]amix=inputs=2:duration=first:normalize=0[aout]")
cmd = ['ffmpeg', '-v', 'error', '-y', *inputs, '-filter_complex', ';'.join(chains), '-map', '[vout]', '-map', '[aout]',
       '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', str(FPS),
       '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-movflags', '+faststart', '-t', f'{total:.3f}', out]
subprocess.run(cmd, check=True)
print(out, f'{total:.2f} s; cuts at', ', '.join(f'{c:.2f}' for c in cuts))
