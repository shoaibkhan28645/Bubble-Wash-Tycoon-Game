"""The player: Kenney's Mini Character male-c (the police officer) dressed
as a business tycoon. The police cap comes off (his own ginger hair is under
it); the blue shirt becomes a navy suit jacket with long sleeves, a white
shirt at the neck and cuffs, a red tie and a white pocket square (where the
badge was); suit trousers, black shoes, a slim gold watch; and square black
glasses. No new bones: the pack's skeleton and animations stay as they are.

Each face keeps the pack's shading: it is repainted with its new colour
scaled by how light it was in the pack's colour map, and stored as vertex
colours (the game draws them without the texture).

Usage: python art/blender/kenney_tycoon.py <character-male-c.glb> <out.glb> [preview.png]
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kit  # noqa: E402

bpy = kit.bpy
import bmesh  # noqa: E402
from mathutils import Vector  # noqa: E402

SUIT = '#2a3350'
SHIRT = '#f4f6f8'
TIE = '#c8282f'
SHOE = '#1b1b20'
SOLE = '#2e2622'
GOLD = '#ffc24a'
FRAMES = '#1c1c22'
HAIR = '#d27d58'
CLIPS = ('idle', 'walk', 'sprint', 'interact-right', 'pick-up')


def lum(c):
    return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]


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


def read_faces(obj, image):
    """Each face's colour in the colour map (sRGB 0..1) and its centre in the world."""
    w, h = image.size
    px = image.pixels[:]
    uv = obj.data.uv_layers['UVMap'].data
    out = []
    for p in obj.data.polygons:
        u = sum(uv[i].uv[0] for i in p.loop_indices) / p.loop_total
        v = sum(uv[i].uv[1] for i in p.loop_indices) / p.loop_total
        x, y = min(w - 1, max(0, int(u * w))), min(h - 1, max(0, int(v * h)))
        i = (y * w + x) * 4
        out.append((tuple(px[i:i + 3]), obj.matrix_world @ p.center))
    return out


def body_colour(c, at, fam):
    """The new colour for a body face (None keeps the pack's)."""
    x, y, z = abs(at.x), at.y, at.z
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


def is_cap(c, at, fam):
    return fam == 'blue' or (fam == 'gold' and at.z > 0.6) or (fam == 'dark' and at.z > 0.56)


def repaint(obj, faces, colour_of):
    """Writes the new colours as corner colours, keeping each face's shading from the colour map."""
    refs = {}
    for c, _ in faces:
        refs.setdefault(family(c), []).append(lum(c))
    refs = {k: sum(v) / len(v) for k, v in refs.items()}
    attr = obj.data.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    for p, (c, at) in zip(obj.data.polygons, faces):
        new = colour_of(c, at, family(c))
        if new is None:
            rgb = c
        else:
            target = kit.colour(new)[:3]
            shade = min(1.3, max(0.7, lum(c) / refs[family(c)]))
            rgb = tuple(min(1.0, t * shade) for t in to_srgb(target))
        lin = kit.colour('#%02x%02x%02x' % tuple(round(v * 255) for v in rgb))
        for li in p.loop_indices:
            attr.data[li].color = lin
    obj.data.color_attributes.active_color = attr


def to_srgb(linear):
    """kit.colour gives linear values; back to sRGB for scaling by the shading."""
    return tuple(v * 12.92 if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055 for v in linear)


def remove_cap(head, faces):
    bm = bmesh.new()
    bm.from_mesh(head.data)
    bm.faces.ensure_lookup_table()
    doomed = [bm.faces[i] for i, (c, at) in enumerate(faces) if is_cap(c, at, family(c))]
    bmesh.ops.delete(bm, geom=doomed, context='FACES')
    bm.to_mesh(head.data)
    bm.free()


def block(size, at, col):
    bpy.ops.mesh.primitive_cube_add(size=1, location=at)
    obj = bpy.context.object
    obj.scale = size
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)
    kit._paint(obj, col)
    return obj


def glasses(head):
    """Square black frames over the eyes, a bridge, and arms back to the ears (in the world, then into the head)."""
    front, eye_z = -0.176, 0.492
    parts = []
    for sx in (1, -1):
        cx = sx * 0.075
        parts += [
            block((0.072, 0.012, 0.012), (cx, front, eye_z + 0.03), FRAMES),
            block((0.072, 0.012, 0.012), (cx, front, eye_z - 0.03), FRAMES),
            block((0.012, 0.012, 0.072), (cx + 0.03, front, eye_z), FRAMES),
            block((0.012, 0.012, 0.072), (cx - 0.03, front, eye_z), FRAMES),
            block((0.012, 0.17, 0.012), (sx * 0.172, -0.09, eye_z + 0.02), FRAMES),
            block((0.066, 0.012, 0.012), (sx * 0.139, front, eye_z + 0.02), FRAMES),
        ]
    parts.append(block((0.04, 0.012, 0.01), (0, front, eye_z + 0.012), FRAMES))
    frames = kit.join(parts, 'glasses')
    frames.data.transform(head.matrix_world.inverted())
    frames.vertex_groups.new(name='head').add([v.index for v in frames.data.vertices], 1.0, 'REPLACE')
    return frames


def main(src, out, preview=None):
    kit.reset()
    bpy.ops.import_scene.gltf(filepath=src, bone_heuristic='BLENDER')
    image = bpy.data.images['colormap']
    rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    body, head = bpy.data.objects['body-mesh'], bpy.data.objects['head-mesh']
    repaint(body, read_faces(body, image), body_colour)
    remove_cap(head, read_faces(head, image))
    repaint(head, read_faces(head, image), lambda c, at, fam: None)
    frames = glasses(head)
    frames.matrix_world = head.matrix_world
    bpy.ops.object.select_all(action='DESELECT')
    frames.select_set(True)
    head.select_set(True)
    bpy.context.view_layer.objects.active = head
    bpy.ops.object.join()
    material = kit.toy_material('tycoon')
    for obj in (body, head):
        kit.use_material(obj, material)
        for uv in list(obj.data.uv_layers):
            obj.data.uv_layers.remove(uv)
    # Only the clips the game plays.
    data = rig.animation_data
    data.action = None
    for track in list(data.nla_tracks):
        if track.name not in CLIPS:
            data.nla_tracks.remove(track)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in (rig, body, head):
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_yup=True, export_texcoords=False,
                              export_materials='EXPORT', export_animations=True, export_animation_mode='NLA_TRACKS', export_skins=True)
    if preview:
        for track in data.nla_tracks:
            track.mute = track.name != 'idle'
        bpy.context.scene.frame_set(1)
        kit.preview(preview, look_at=(0, 0, 0.42), distance=1.9, size=(420, 520), ground='#d9d2c4',
                    angles=((0.2, -1, 0.25), (-0.8, -0.7, 0.3), (0.1, 1, 0.3)))


if __name__ == '__main__':
    main(*sys.argv[1:4])
