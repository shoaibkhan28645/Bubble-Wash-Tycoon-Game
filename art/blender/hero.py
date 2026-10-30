"""The player: the car wash's own washer (looks.HERO). A swept-up brown
quiff and fringe, a friendly face, an aqua work polo with a white collar,
sleeve trim and the bubble badge, navy work trousers with a belt, a spray
bottle on the hip and a pink towel in the back pocket, yellow rubber gloves
and boots.

Built like the rest of the cast (people.py) on the same skeleton and
animations, but smoother, since the camera follows him. Each gait's ground
speed is printed; the game keeps them in src/data/characters.json to play
each gait at the matching rate.

About 0.78 tall, shown at twice that; front faces -Y. The right hand bone
is `hand-right`: the game puts the sponge there.

Usage: python art/blender/hero.py <out.glb> [preview-dir]
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kit  # noqa: E402
import looks  # noqa: E402
import people  # noqa: E402
import person_body as pb  # noqa: E402

kit.reset()
rig = pb.build_rig()
hero = people.build_person('hero', looks.HERO, rig, kit.toy_material('toy'), fine=True)
lengths = people.animate(rig)
people.export(rig, [hero], sys.argv[1] if len(sys.argv) > 1 else 'character-hero.glb')

if len(sys.argv) > 2:
    import person_preview
    person_preview.stills(Path(sys.argv[2]), rig, lengths, people.FPS)
