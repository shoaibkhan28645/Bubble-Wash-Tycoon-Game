"""Shared steps for restyling Kenney Mini Characters (kenney_tycoon.py,
kenney_staff.py): load a character, read each face's colour from the pack's
colour map, repaint faces while keeping the pack's shading, add small solid
parts on a bone, and export with only the clips the game plays.

The colour map is a grid of swatches (64 pixels wide, 128 tall), each a
light-to-dark gradient: a face's swatch says what it is painted with, and
where it sits in the gradient says how shaded it is. Repainted faces keep
that shading and become vertex colours (the game draws them without the
texture).
"""
import kit

bpy = kit.bpy
import bmesh  # noqa: E402

CLIPS = ('idle', 'walk', 'sprint', 'interact-right', 'pick-up')
SWATCH = (64, 128)


def lum(c):
    return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]


def to_srgb(linear):
    """kit.colour gives linear values; back to sRGB for scaling by the shading."""
    return tuple(v * 12.92 if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055 for v in linear)


class Face:
    """A face's colour in the colour map (sRGB 0..1), its swatch (column, row) and its centre in the world."""

    def __init__(self, colour, swatch, at):
        self.colour, self.swatch, self.at = colour, swatch, at


def load(src):
    """The character's skeleton, body and head meshes, and the colour map."""
    kit.reset()
    bpy.ops.import_scene.gltf(filepath=src, bone_heuristic='BLENDER')
    rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    return rig, bpy.data.objects['body-mesh'], bpy.data.objects['head-mesh'], bpy.data.images['colormap']


def read_faces(obj, image):
    w, h = image.size
    px = image.pixels[:]
    uv = obj.data.uv_layers['UVMap'].data
    out = []
    for p in obj.data.polygons:
        u = sum(uv[i].uv[0] for i in p.loop_indices) / p.loop_total
        v = sum(uv[i].uv[1] for i in p.loop_indices) / p.loop_total
        x, y = min(w - 1, max(0, int(u * w))), min(h - 1, max(0, int(v * h)))
        i = (y * w + x) * 4
        out.append(Face(tuple(px[i:i + 3]), (x // SWATCH[0], (h - 1 - y) // SWATCH[1]), obj.matrix_world @ p.center))
    return out


def repaint(obj, faces, colour_of, group_of):
    """Writes the new colours (`colour_of(face)`, None keeps the pack's) as corner colours. A repainted
    face keeps its shading: how much lighter or darker it is than the average of its `group_of(face)`."""
    refs = {}
    for f in faces:
        refs.setdefault(group_of(f), []).append(lum(f.colour))
    refs = {k: sum(v) / len(v) for k, v in refs.items()}
    attr = obj.data.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    for p, f in zip(obj.data.polygons, faces):
        new = colour_of(f)
        rgb = f.colour
        if new is not None:
            shade = min(1.3, max(0.7, lum(f.colour) / max(1e-3, refs[group_of(f)])))
            rgb = tuple(min(1.0, t * shade) for t in to_srgb(kit.colour(new)[:3]))
        lin = kit.colour('#%02x%02x%02x' % tuple(round(v * 255) for v in rgb))
        for li in p.loop_indices:
            attr.data[li].color = lin
    obj.data.color_attributes.active_color = attr


def delete_faces(obj, faces, doomed):
    """Removes the faces for which `doomed(face)` is true."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.faces[i] for i, f in enumerate(faces) if doomed(f)], context='FACES')
    bm.to_mesh(obj.data)
    bm.free()


def block(size, at, col):
    bpy.ops.mesh.primitive_cube_add(size=1, location=at)
    obj = bpy.context.object
    obj.scale = size
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)
    kit._paint(obj, col)
    return obj


def attach(parts, mesh, bone):
    """Joins solid parts (built in the world) into one of the character's meshes, on one bone."""
    extra = kit.join(parts, 'extra')
    extra.data.transform(mesh.matrix_world.inverted())
    extra.matrix_world = mesh.matrix_world
    extra.vertex_groups.new(name=bone).add([v.index for v in extra.data.vertices], 1.0, 'REPLACE')
    bpy.ops.object.select_all(action='DESELECT')
    extra.select_set(True)
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.join()


def export(rig, body, head, name, out, preview=None):
    """Vertex colours only, the game's clips only; optionally stills from the front, the side and the back."""
    material = kit.toy_material(name)
    for obj in (body, head):
        kit.use_material(obj, material)
        for uv in list(obj.data.uv_layers):
            obj.data.uv_layers.remove(uv)
    data = rig.animation_data
    data.action = None
    for track in list(data.nla_tracks):
        if track.name not in CLIPS:
            data.nla_tracks.remove(track)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in (rig, body, head):
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', use_selection=True, export_yup=True, export_texcoords=False,
                              export_materials='EXPORT', export_animations=True, export_animation_mode='NLA_TRACKS', export_skins=True)
    if preview:
        for track in data.nla_tracks:
            track.mute = track.name != 'idle'
        bpy.context.scene.frame_set(1)
        kit.preview(str(preview), look_at=(0, 0, 0.42), distance=1.9, size=(420, 520), ground='#d9d2c4',
                    angles=((0.2, -1, 0.25), (-0.8, -0.7, 0.3), (0.1, 1, 0.3)))
