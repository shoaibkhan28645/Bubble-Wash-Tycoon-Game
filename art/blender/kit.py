"""Shared Blender helpers for Bubble Wash Town's buildings.

Every building is made of simple rounded parts, each painted one flat
colour. Static parts are joined into one mesh that carries its colours as
vertex colours (one draw call in the game); see-through glass and moving
parts (brushes) stay separate, named objects. Run a building script with
Blender's Python module, e.g. `python art/blender/tunnel.py <out.glb> <preview.png>`.

Blender is Z-up; the glTF export turns it Y-up, so Blender +Y becomes the
game's -Z (towards the road) and -Y the game's +Z (towards the camera).
"""
import math

import bpy  # noqa: I001 (bpy first: it makes bmesh and mathutils importable)
import bmesh
from mathutils import Vector

# The game's palette (src/render/models/kit.ts), as sRGB hex.
PALETTE = {
    'white': '#f6f8fb',
    'pink': '#ff8fc8',
    'hotpink': '#ff5fa8',
    'blue': '#5bbcff',
    'deepblue': '#2f80d1',
    'mint': '#7ee0c3',
    'yellow': '#ffd24a',
    'gold': '#ffbf3c',
    'lilac': '#b79cff',
    'red': '#ff5c6c',
    'kerb': '#c3cad4',
    'steel': '#8d98a7',
    'dark': '#3b4a5e',
    'concrete': '#cfd6de',
    'tile': '#d3e6f0',
    'glass': '#bfe3f7',
    'black': '#2d3440',
}


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def colour(name_or_hex):
    hex_ = PALETTE.get(name_or_hex, name_or_hex).lstrip('#')
    return tuple(srgb_to_linear(int(hex_[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def _paint(obj, col):
    """Writes one flat colour into the object's colour attribute (game reads it as COLOR_0)."""
    mesh = obj.data
    attr = mesh.color_attributes.get('Col') or mesh.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    rgba = colour(col)
    for item in attr.data:
        item.color = rgba
    mesh.color_attributes.active_color = attr
    obj['paint'] = col


def _finish(obj, col, bevel=0.0, segments=1, rot=(0, 0, 0)):
    obj.rotation_euler = rot
    if bevel > 0:
        mod = obj.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = 'ANGLE'
        mod.harden_normals = False
    _apply_all(obj)
    _paint(obj, col)
    return obj


def _apply_all(obj):
    bpy.context.view_layer.objects.active = obj
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def box(size, at, col, bevel=0.04, segments=1, rot=(0, 0, 0)):
    """A box of size (x, y, z) centred at `at`, edges rounded by `bevel`."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=at)
    obj = bpy.context.object
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish(obj, col, bevel, segments, rot)


def cylinder(radius, depth, at, col, verts=16, bevel=0.0, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=at)
    return _finish(bpy.context.object, col, bevel, 1, rot)


def sphere(radius, at, col, segments=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=max(4, segments // 2), radius=radius, location=at)
    return _finish(bpy.context.object, col)


def torus(major, minor, at, col, rot=(0, 0, 0), major_segments=24, minor_segments=8):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=major_segments, minor_segments=minor_segments, location=at)
    return _finish(bpy.context.object, col, rot=rot)


def arch_segments(radius, thickness, depth, centre, cols, segments=10, start=0.0, end=math.pi):
    """A half-ring arch standing in the XZ plane (spans across X), built from
    short rounded blocks so it can be candy-striped with `cols`."""
    parts = []
    step = (end - start) / segments
    chord = 2 * radius * math.sin(step / 2) * 1.04
    for i in range(segments):
        a = start + step * (i + 0.5)
        x = centre[0] + radius * math.cos(a)
        z = centre[2] + radius * math.sin(a)
        parts.append(box((chord, depth, thickness), (x, centre[1], z), cols[i % len(cols)], bevel=0.03, rot=(0, -(a - math.pi / 2), 0)))
    return parts


def star_disc(radius, inner, height, at, col, points=12, twist=0.0):
    """A short cylinder with a bristly star outline: brush bristles. `twist`
    turns it a little, so stacked discs look like tufts, not gear teeth."""
    bm = bmesh.new()
    verts_bottom = []
    verts_top = []
    for i in range(points * 2):
        a = math.pi * i / points + twist
        r = radius if i % 2 == 0 else inner
        verts_bottom.append(bm.verts.new((r * math.cos(a), r * math.sin(a), -height / 2)))
        verts_top.append(bm.verts.new((r * math.cos(a), r * math.sin(a), height / 2)))
    bm.faces.new(list(reversed(verts_bottom)))
    bm.faces.new(verts_top)
    n = len(verts_bottom)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((verts_bottom[i], verts_bottom[j], verts_top[j], verts_top[i]))
    mesh = bpy.data.meshes.new('disc')
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new('disc', mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = at
    bpy.context.view_layer.objects.active = obj
    return _finish(obj, col)


def text(body, size, at, col, depth=0.06, rot=(math.pi / 2, 0, 0)):
    """Raised 3D letters, standing up and facing -Y (the camera)."""
    bpy.ops.object.text_add(location=at, rotation=rot)
    obj = bpy.context.object
    obj.data.body = body
    obj.data.size = size
    obj.data.extrude = depth
    obj.data.align_x = 'CENTER'
    obj.data.align_y = 'CENTER'
    obj.data.bevel_depth = 0.0
    obj.data.resolution_u = 4
    bpy.ops.object.convert(target='MESH')
    obj = bpy.context.object
    return _finish(obj, col)


def join(parts, name):
    """Joins parts into one mesh object (keeps each part's vertex colours)."""
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name
    return obj


def set_origin(obj, point):
    """Moves an object's origin (its pivot in the game, e.g. a brush's spin axis) to `point`."""
    cursor = bpy.context.scene.cursor
    saved = cursor.location.copy()
    cursor.location = point
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    cursor.location = saved


def toy_material(name='toy', alpha=1.0):
    """Shows the vertex colours (for the preview render and the glTF export)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes['Principled BSDF']
    attr = nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    mat.node_tree.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.8
    if alpha < 1:
        bsdf.inputs['Alpha'].default_value = alpha
        mat.surface_render_method = 'BLENDED'
    return mat


def use_material(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def triangles(objs):
    total = 0
    for obj in objs:
        obj.data.calc_loop_triangles()
        total += len(obj.data.loop_triangles)
    return total


def export(objs, path):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objs:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_texcoords=False, export_materials='EXPORT')


def preview(path, look_at=(0, 0, 1.2), distance=16.0, size=(960, 720), ground='#8fd46a', angles=((0, -1, 1.2),)):
    """Renders the model on a patch of grass, from the game's camera angle
    (and any extra `angles`), side by side if several. Not exported."""
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
    plane = bpy.context.object
    _paint(plane, ground)
    use_material(plane, toy_material('ground'))
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.cycles.device = 'CPU'
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new('sky')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = colour('#bfe9ff')
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
    scene.world = world
    bpy.ops.object.light_add(type='SUN', location=(0, 0, 20))
    sun = bpy.context.object
    sun.data.energy = 3.2
    sun.rotation_euler = (math.radians(40), math.radians(-25), math.radians(30))
    target = Vector(look_at)
    paths = []
    for i, direction in enumerate(angles):
        d = Vector(direction).normalized()
        bpy.ops.object.camera_add(location=target + d * distance)
        cam = bpy.context.object
        cam.data.lens = 50
        cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
        scene.camera = cam
        out = path if len(angles) == 1 else path.replace('.png', f'-{i}.png')
        scene.render.filepath = out
        bpy.ops.render.render(write_still=True)
        paths.append(out)
    bpy.data.objects.remove(plane)
    return paths
