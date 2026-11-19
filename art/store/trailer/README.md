# Trailer

`main-street-tycoon-trailer-1080p.mp4`: 27.7 s, 1920x1080, 30 fps, with the game's
own music (the car wash track and the reward jingle).

It is cut to the music: the cover for one bar, six shots of a bar and a half each,
then the end card for two bars. Each cut is a short dissolve on the beat.

| Shot | Town | Caption |
|---|---|---|
| 1 | Car wash, early | Start with one car wash |
| 2 | Car wash, early (the fuel pump is built) | Build it up! |
| 3 | Car wash, fully built | Hire a crew, earn more |
| 4 | Willowbrook Farm | Grow a farm |
| 5 | Starlight Fun Park | Run a theme park |
| 6 | Skyport (the Sky Queen) | Rule the skies! |

## How it's made

Everything comes from the real game. Start the dev server first
(`npx vite --port 5190 --strictPort`), then run these from this folder:

1. `node cine.cjs shots/<n>.json frames/<n>` records one shot (104 frames).
   - Each shot file names a save in `saves/`, the town, the hero's spot and
     direction, and the camera's path.
   - The game's clock is frozen and stepped 1/30 s per frame, so the footage is
     smooth however slowly the machine draws.
   - The interface is hidden. The camera eases from its start to its end, and
     the hero stands still in his spot.
   - Add `still` after the output folder for one frame from the middle of the
     shot, to check its framing.
2. `node captions.cjs` draws the captions in the game's title style (Lilita One,
   from `src/ui/fonts`) as transparent PNGs in `frames/`.
3. `python3 assemble.py ../covers/landscape-1920x1080.jpg ../../../public/audio/roadside/roadside-music.mp3 ../../../public/audio/jingle-reward.mp3 main-street-tycoon-trailer-1080p.mp4`
   puts the cover, the shots, the captions and the music together with ffmpeg.

`frames/` is not committed.
