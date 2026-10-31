"""The player: Kenney's Mini Character male-c (the police officer) dressed
as a business tycoon. The police cap comes off (his own ginger hair is under
it); the blue shirt becomes a navy suit jacket with long sleeves, a white
shirt at the neck and cuffs, a red tie and a white pocket square (where the
badge was); suit trousers, black shoes, a slim gold watch; and square black
glasses. No new bones: the pack's skeleton and animations stay as they are.

Faces keep the pack's shading (see kenney_kit.py).

Usage: python art/blender/kenney_tycoon.py <character-male-c.glb> <out.glb> [preview.png]
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kenney_kit as kk  # noqa: E402

SUIT = '#2a3350'
SHIRT = '#f4f6f8'
TIE = '#c8282f'
SHOE = '#1b1b20'
SOLE = '#2e2622'
GOLD = '#ffc24a'
FRAMES = '#1c1c22'


def family(c):
    """Which of the pack's colours a face had: gold, blue (shirt and cap), dark (cloth, eyes), sole, or skin-and-hair."""
    r, g, b = c
    if r > 0.9 and b < 0.45 and g > 0.5:
        return 'gold'
    if b > r + 0.15 and b > 0.6:
        return 'blue'
    if max(c) < 0.33:
        return 'dark'
    if b > r and max(c) < 0.6:
        return 'sole'
    return 'skin'


def body_colour(face):
    """The new colour for a body face (None keeps the pack's)."""
    fam = family(face.colour)
    x, y, z = abs(face.at.x), face.at.y, face.at.z
    if x > 0.22:  # the arms, stretched out sideways
        if fam == 'dark':
            return GOLD if x > 0.3 else SUIT  # a slim gold watch at the cuff
        return SUIT if x < 0.33 else SHIRT if x < 0.35 else None
    if fam == 'gold':
        # The badge becomes a pocket square; the belt buckle disappears under the jacket.
        return SHIRT if x > 0.04 else SUIT
    if fam == 'sole':
        return SOLE
    if fam == 'dark':
        if z < 0.075:
            return SHOE
        return TIE if z > 0.24 and x < 0.02 and y < -0.07 else SUIT
    if fam == 'blue':
        # An open V at the neck shows the shirt.
        return SHIRT if y < -0.07 and z > 0.27 and x < 0.012 + (z - 0.27) * 0.7 else SUIT
    return None


def is_cap(face):
    fam = family(face.colour)
    return fam == 'blue' or (fam == 'gold' and face.at.z > 0.6) or (fam == 'dark' and face.at.z > 0.56)


def glasses():
    """Square black frames over the eyes, a bridge, and arms back to the ears."""
    front, eye_z = -0.176, 0.492
    parts = []
    for sx in (1, -1):
        cx = sx * 0.075
        parts += [
            kk.block((0.072, 0.012, 0.012), (cx, front, eye_z + 0.03), FRAMES),
            kk.block((0.072, 0.012, 0.012), (cx, front, eye_z - 0.03), FRAMES),
            kk.block((0.012, 0.012, 0.072), (cx + 0.03, front, eye_z), FRAMES),
            kk.block((0.012, 0.012, 0.072), (cx - 0.03, front, eye_z), FRAMES),
            kk.block((0.012, 0.17, 0.012), (sx * 0.172, -0.09, eye_z + 0.02), FRAMES),
            kk.block((0.066, 0.012, 0.012), (sx * 0.139, front, eye_z + 0.02), FRAMES),
        ]
    parts.append(kk.block((0.04, 0.012, 0.01), (0, front, eye_z + 0.012), FRAMES))
    return parts


def main(src, out, preview=None):
    rig, body, head, image = kk.load(src)
    shading = lambda face: family(face.colour)  # noqa: E731
    kk.repaint(body, kk.read_faces(body, image), body_colour, shading)
    kk.delete_faces(head, kk.read_faces(head, image), is_cap)
    kk.repaint(head, kk.read_faces(head, image), lambda face: None, shading)
    kk.attach(glasses(), head, 'head')
    kk.export(rig, body, head, 'tycoon', out, preview)


if __name__ == '__main__':
    main(*sys.argv[1:4])
