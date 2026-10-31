"""The car wash staff: Kenney Mini Characters in one team uniform. Whatever
each one wore becomes a short-sleeved aqua polo with a white collar, white
sleeve trims and the white bubble badge on the chest, navy trousers (or
shorts or skirt, by the shape they had), and white trainers with grey
soles. Faces, hair, glasses, beards and skin stay their own. Faces keep
the pack's shading (see kenney_kit.py).

Skin is found from the hands (or the head, under gloves), and stays as it
is on the arms and legs.

Usage: python art/blender/kenney_staff.py <out-dir> [preview-dir]
Writes character-<id>-staff.glb for each of STAFF, from the pack's
character-<id>.glb in art/kenney/people (characters only the staff use) or
public/models/people (characters also out walking in town).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kenney_kit as kk  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
SOURCES = [REPO / 'art/kenney/people', REPO / 'public/models/people']

STAFF = ['male-f', 'female-b', 'female-c', 'female-d', 'male-a', 'male-d', 'female-e', 'male-b', 'female-f']
POLO = '#22c3c9'
COLLAR = '#f6f8fb'
TROUSERS = '#2f3e66'
SHOES = '#f4f6f8'
SOLES = '#8d98a7'
BADGE = '#f6f8fb'
BUBBLE = '#8fe3ff'
# The colour map's skin swatches (column, row): light, tan and brown.
SKIN_TONES = {(5, 3), (6, 3), (7, 3)}


def uniform(skin, skin_colour):
    """Torso: polo, white collar. Arms: short polo sleeves with a white trim, then bare arms in the
    person's own skin (long sleeves and gloves become skin). Below the waist: navy, white trainers."""
    def colour_of(face):
        x, y, z = abs(face.at.x), face.at.y, face.at.z
        if z < 0.025:
            return SOLES
        if z < 0.075:
            return SHOES
        if z < 0.19:
            return None if face.swatch in skin else TROUSERS
        if x < 0.16:
            if y > 0.175:
                return TROUSERS  # anything carried on the back
            return COLLAR if z > 0.335 else POLO
        if x < 0.235:
            return POLO
        if x < 0.255:
            return COLLAR
        return None if face.swatch in skin else skin_colour
    return colour_of


def badge(faces):
    """The bubble badge on the left of the chest, just in front of whatever the chest is."""
    chest = [f.at.y for f in faces if 0.03 < f.at.x < 0.1 and 0.25 < f.at.z < 0.33 and f.at.y < 0]
    front = min(chest) - 0.004
    return [kk.block((0.05, 0.01, 0.05), (0.066, front, 0.292), BADGE),
            kk.block((0.024, 0.01, 0.024), (0.062, front - 0.004, 0.29), BUBBLE)]


def skin_of(body, head):
    """The skin swatches: those at the tips of the arms (the hands) that are skin tones, or, when the
    hands are gloved, the skin tones on the head."""
    hands = {f.swatch for f in body if abs(f.at.x) > 0.345} & SKIN_TONES
    return hands or ({f.swatch for f in head} & SKIN_TONES)


def mean_colour(faces, swatches):
    """The average colour of the faces in these swatches, as a hex colour."""
    picked = [f.colour for f in faces if f.swatch in swatches]
    return '#%02x%02x%02x' % tuple(round(sum(c[i] for c in picked) / len(picked) * 255) for i in range(3))


def main(out_dir, preview_dir=None):
    out_dir = Path(out_dir)
    for person in STAFF:
        src = next(d / f'character-{person}.glb' for d in SOURCES if (d / f'character-{person}.glb').exists())
        rig, body, head, image = kk.load(str(src))
        faces = kk.read_faces(body, image)
        head_faces = kk.read_faces(head, image)
        skin = skin_of(faces, head_faces)
        kk.repaint(body, faces, uniform(skin, mean_colour(head_faces, skin)), lambda face: face.swatch)
        kk.repaint(head, head_faces, lambda face: None, lambda face: face.swatch)
        kk.attach(badge(faces), body, 'torso')
        preview = Path(preview_dir) / f'{person}.png' if preview_dir else None
        kk.export(rig, body, head, f'{person}-staff', out_dir / f'character-{person}-staff.glb', preview)
        print(person, 'skin swatches', sorted(skin))


if __name__ == '__main__':
    main(*sys.argv[1:3])
