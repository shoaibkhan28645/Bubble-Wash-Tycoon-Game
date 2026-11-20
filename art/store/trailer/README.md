# Trailer

The trailer (`main-street-tycoon-trailer-1080p.mp4`, 1920x1080, 30 fps) is pure
gameplay: the game as a player sees it, with its own camera and HUD, running at
normal speed. Like all the store art, the video isn't kept in git (it's too
heavy). It's on the game's Playgama page, and these scripts make it again.

It opens on the landscape cover, then plays six shots joined by gentle
dissolves, with no captions over the gameplay. It ends on the cover with
"Play now!" and the reward jingle. Each town's own music plays under its shots.

| Shot | Save | What the hero does |
|---|---|---|
| 1-wash | early car wash | walks to a muddy car, washes it, collects the cash at the till |
| 2-build | early car wash | crosses the road onto the fuel pump's pad and builds it |
| 3-busy | fully built car wash | walks through the busy lot past the staff, tunnel and dryer |
| 4-farm | all four towns | walks past the windmill and fields to the farm stand's cash |
| 5-park | all four towns | crosses the plaza to the ticket booth, then to the snack cart by the carousel |
| 6-airport | all four towns | walks up Gate 2's lounge, through its doors, onto the apron |

## How it's made

Start the dev server first (`npx vite --port 5190 --strictPort`), then run
these from this folder:

1. `node play.cjs shots/<name>.json frames/<name>` records one shot.
   - Each shot file names a save in `saves/`, the town, where the hero starts,
     and the steps: walk to a spot, wait, wash a car at a bay, collect a pile,
     or set the cash in hand (so a pad is built on camera).
   - The hero is steered the way a player's thumb would: the joystick pushed
     right over (the game's own speed), turning smoothly, along the game's own
     route round things, slowing only onto a spot where they stop to work.
   - The game's clock is stepped 1/30 s per frame, so the footage plays at
     normal speed (never sped up) however slowly the machine draws it.
   - Add `preview` after the output folder to draw only every 10th frame, to
     check a plan quickly.
2. `node captions.cjs` draws the end card's "Play now!" in the game's title
   style (Lilita One, from `src/ui/fonts`) as a transparent PNG in `frames/`.
3. `python3 assemble.py ../covers/landscape-1920x1080.jpg frames/kend.png ../../../public/audio frames main-street-tycoon-trailer-1080p.mp4`
   puts the cover, the shots, the end card and the music together with ffmpeg.

`frames/` and the finished video are not committed. Step 3 needs the landscape
cover in `../covers/` (also kept out of git).
