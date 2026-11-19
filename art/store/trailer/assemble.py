# Builds trailer.mp4 (1920x1080, 30 fps) from the cover, the five recorded clips and the captions,
# with the game's own music. python3 assemble.py <cover.jpg> <music.mp3> <jingle.mp3> <out.mp4>
import subprocess
import sys

cover, music, jingle, out = sys.argv[1:5]
FPS = 30
FADE = 0.4
# Each clip's first frame and length (s): the farm clip runs out of things to see after 3.4 s.
CLIPS = [(10, 4.5), (10, 4.5), (0, 3.4), (0, 4.2), (15, 4.5)]
INTRO, OUTRO = 2.6, 3.2

inputs, chains, lengths = [], [], []
# Intro: the cover, slowly zooming in.
inputs += ['-loop', '1', '-framerate', str(FPS), '-t', str(INTRO), '-i', cover]
chains.append(f"[0:v]scale=3840:-2,zoompan=z='1+0.05*on/{int(INTRO*FPS)}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps={FPS},trim=duration={INTRO},setsar=1,format=yuv420p,fps=30,settb=AVTB,setpts=PTS-STARTPTS[s0]")
lengths.append(INTRO)
# The clips, each with its caption fading in and out.
for k, (start, seconds) in enumerate(CLIPS, 1):
    inputs += ['-framerate', str(FPS), '-start_number', str(start), '-i', f'c{k}/f%04d.jpg']
    inputs += ['-loop', '1', '-framerate', str(FPS), '-t', str(seconds), '-i', f'cap{k}.png']
for k, (start, seconds) in enumerate(CLIPS, 1):
    v, c = 2 * k - 1, 2 * k
    chains.append(
        f"[{c}:v]format=rgba,fade=t=in:st=0.25:d=0.35:alpha=1,fade=t=out:st={seconds-0.6}:d=0.35:alpha=1[cap{k}];"
        f"[{v}:v]trim=duration={seconds},setpts=PTS-STARTPTS,scale=1920:1080[clip{k}];"
        f"[clip{k}][cap{k}]overlay=0:0:shortest=1,setsar=1,format=yuv420p,fps=30,settb=AVTB,setpts=PTS-STARTPTS[s{k}]"
    )
    lengths.append(seconds)
# Outro: the cover with "Play now!".
n = 11
inputs += ['-loop', '1', '-framerate', str(FPS), '-t', str(OUTRO), '-i', cover, '-loop', '1', '-framerate', str(FPS), '-t', str(OUTRO), '-i', 'capend.png']
chains.append(
    f"[{n}:v]scale=3840:-2,zoompan=z='1.05-0.05*on/{int(OUTRO*FPS)}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps={FPS},trim=duration={OUTRO}[endbg];"
    f"[{n+1}:v]format=rgba,fade=t=in:st=0.4:d=0.3:alpha=1[endcap];"
    f"[endbg][endcap]overlay=0:0:shortest=1,setsar=1,format=yuv420p,fps=30,settb=AVTB,setpts=PTS-STARTPTS[s6]"
)
lengths.append(OUTRO)
# Crossfades.
prev, t = 's0', lengths[0]
for k in range(1, 7):
    offset = t - FADE
    label = f'x{k}' if k < 6 else 'vout'
    chains.append(f"[{prev}][s{k}]xfade=transition=fade:duration={FADE}:offset={offset:.3f}[{label}]")
    prev, t = label, offset + lengths[k]
total = t
# Sound: the car wash music, the reward jingle on the end card.
m, j = n + 2, n + 3
inputs += ['-i', music, '-i', jingle]
jingle_at = int((total - OUTRO + 0.3) * 1000)
chains.append(
    f"[{m}:a]atrim=duration={total:.3f},afade=t=in:d=0.4,afade=t=out:st={total-1.6:.3f}:d=1.6,volume=0.9[mus];"
    f"[{j}:a]adelay={jingle_at}|{jingle_at},volume=0.8[jin];"
    f"[mus][jin]amix=inputs=2:duration=first:normalize=0[aout]"
)
cmd = ['ffmpeg', '-v', 'error', '-y', *inputs, '-filter_complex', ';'.join(chains), '-map', '[vout]', '-map', '[aout]',
       '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', str(FPS),
       '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-movflags', '+faststart', '-t', f'{total:.3f}', out]
subprocess.run(cmd, check=True)
print(out, f'{total:.2f} s')
