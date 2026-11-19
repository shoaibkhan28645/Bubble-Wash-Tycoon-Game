# Trailer

`main-street-tycoon-trailer-1080p.mp4`: 24.5 s, 1920x1080, 30 fps, with the game's
own music (the car wash track and the reward jingle).

It is made from the real game:

1. `clip.cjs` records each clip on the dev server (`npx vite --port 5190`) from a
   saved game: the game's clock is frozen and stepped 1/30 s per frame while the
   hero walks, so the footage is smooth however slowly the machine draws.
   `node clip.cjs <save.json> <town> <outDir> <frames> <x,z|-> "<keys>:<frames>,…"`
2. `captions.cjs` draws the captions in the game's title style (Lilita One, from
   `src/ui/fonts`) as transparent 1920x1080 PNGs.
3. `assemble.py` puts the landscape cover, the five clips, the captions and the
   music together with ffmpeg:
   `python3 assemble.py <cover.jpg> <music.mp3> <jingle.mp3> <out.mp4>`
