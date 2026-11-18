# Sound credits

## Music: written for Main Street Mogul

All of the game's music was written for it. Each piece is a score in
`art/music/compose.py`, played with the **FluidR3 GM** instruments
(© 2000–2002, 2008 Frank Wen; MIT licence) through FluidSynth and cut into a
seamless loop. Each town's music loads when the hero arrives there.

| Files | What |
|---|---|
| `roadside/roadside-music` | Roadside: the car wash's ukulele tune |
| `farm/farm-music` | Willowbrook: a hoedown with banjo and fiddles |
| `park/park-music` | Starlight Fun Park: a circus galop on a calliope with a band organ |
| `park/musicbox` | The carousel's music box: a lullaby waltz |
| `skyport/skyport-music` | Skyport: a lounge bossa nova |
| `jingle-build`, `jingle-reward`, `jingle-vip`, `jingle-mission` | The short fanfares for building, rewards, VIPs and goals |

## Sound effects

These sound effects are by **Kenney** (https://kenney.nl), released under
**Creative Commons Zero (CC0 1.0)**: free for any use, no attribution
required. Downloaded from Kenney's official OpenGameArt uploads, converted to
mono MP3 and level-matched.

| Files | Pack | Source |
|---|---|---|
| `coins-*` | RPG Sound Effects (handleCoins) | https://opengameart.org/content/50-rpg-sound-effects |
| `chip-*`, `register` | Casino Audio | https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips |
| `sparkle`, `pick`, `drop`, `click`, `open`, `upgrade` | Interface Sounds | https://opengameart.org/content/interface-sounds |

Starlight Fun Park's other sounds (`park/`) are also released under **CC0 1.0**
on OpenGameArt, cut, converted to mono MP3 and level-matched. They load
when the hero arrives at the park.

| Files | Original | By | Source |
|---|---|---|---|
| `park/firework-*` | 25 CC0 bang / firework SFX | rubberduck | https://opengameart.org/content/25-cc0-bang-firework-sfx |
| `park/splash-*`, `park/rain` | 40 CC0 water / splash / slime SFX | rubberduck | https://opengameart.org/content/40-cc0-water-splash-slime-sfx |
| `park/cheer-*` | Applause in a large hall or church | eXpl0it3r | https://opengameart.org/content/applause-in-a-large-hall-or-church |
| `park/ooh` | OoOoOoOoOoOoOo | Nocturnal_Vanguard | https://opengameart.org/content/oooooooooooooo |
| `park/clank-*` | Chain winch sounds | bart | https://opengameart.org/content/chain-winch-sounds |
| `park/whoosh` | Air whoosh | pyranostudios | https://opengameart.org/content/air-whoosh |

Willowbrook's animals (`farm/`) are by **Joseph Sardin** on BigSoundBank
(https://bigsoundbank.com), released under **CC0 1.0**: free for any use, no
attribution required. Single calls were cut from the recordings, filtered,
converted to mono MP3 and level-matched. They load when the hero arrives at
the farm.

| Files | Original | Source |
|---|---|---|
| `farm/moo-1` | Cow moos #2 | https://bigsoundbank.com/cow-moos-2-s2382.html |
| `farm/moo-2` | Cow moos #5 | https://bigsoundbank.com/cow-moos-5-s2385.html |
| `farm/moo-3` | Cow moos #6 | https://bigsoundbank.com/cow-moos-6-s2386.html |
| `farm/cluck-*` | Annoyed hen | https://bigsoundbank.com/annoyed-hen-s0453.html |

The sponge squeaks, water spray, bubble pops, horn, till bell, footsteps and
the airport's chime, tyre chirp, propellers, gulls and engine drone are made
in code (`src/audio/synth.ts`).
