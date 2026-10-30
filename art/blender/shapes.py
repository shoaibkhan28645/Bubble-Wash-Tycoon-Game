"""Small shape makers for the people (see people.py): soft rounded blocks,
balls, bands, arcs, and helpers to place parts on a surface.

FINE says how smooth they are: True for the hero (seen close), False for
the rest of the cast (fewer faces, so many people fit in a small file).
"""
import math

import bpy  # noqa: I001
import bmesh
from mathutils import Vector

import kit

FINE = True


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def shade(hex_, factor):
    """A colour made darker (factor < 1) or lighter (> 1)."""
    h = hex_.lstrip('#')
    rgb = [min(255, round(int(h[i:i + 2], 16) * factor)) for i in (0, 2, 4)]
    return '#' + ''.join(f'{c:02x}' for c in rgb)


def mix(a, b, t):
    ha, hb = a.lstrip('#'), b.lstrip('#')
    rgb = [round(int(ha[i:i + 2], 16) * (1 - t) + int(hb[i:i + 2], 16) * t) for i in (0, 2, 4)]
    return '#' + ''.join(f'{c:02x}' for c in rgb)


def bake(obj, *mods):
    """Applies the object's transform and then `mods` (kind, settings) to its mesh, smooth shaded."""
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for kind, settings in mods:
        mod = obj.modifiers.new(kind.lower(), kind)
        for key, value in settings.items():
            setattr(mod, key, value)
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.shade_smooth()
    return obj


def paint_faces(obj, rule):
    """Paints each face by `rule(centre)` → colour (corner colours, so the edges stay crisp)."""
    mesh = obj.data
    attr = mesh.color_attributes.get('Col') or mesh.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    cache = {}
    for poly in mesh.polygons:
        col = rule(poly.center)
        rgba = cache.get(col) or cache.setdefault(col, kit.colour(col))
        for li in poly.loop_indices:
            attr.data[li].color = rgba
    mesh.color_attributes.active_color = attr


def level(n):
    """Subdivision level: one less for the cast (never below 1)."""
    return n if FINE else max(1, n - 1)


def blob(size, at, col, rot=(0, 0, 0), level_=2, shape=None):
    """A soft rounded block: a cube of `size` (full widths), subdivided; `shape(co)` may push its points."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=at, rotation=rot)
    obj = bpy.context.object
    obj.scale = size
    bake(obj, ('SUBSURF', {'levels': level(level_), 'render_levels': level(level_)}))
    if shape:
        for v in obj.data.vertices:
            v.co = shape(v.co)
    kit._paint(obj, col)
    return obj


def ball(radius, at, col, scale=(1, 1, 1), rot=(0, 0, 0), segments=14):
    segments = segments if FINE else max(8, round(segments * 0.65))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=max(5, segments // 2 + 1), radius=radius, location=at, rotation=rot)
    obj = bpy.context.object
    obj.scale = scale
    bake(obj)
    kit._paint(obj, col)
    return obj


def ring(rx, ry, minor, z, col, centre=(0, 0), flat=1.0, segments=28):
    """A band round the body at height z: radii rx, ry; `flat` stretches its cross-section upright."""
    segments = segments if FINE else max(12, segments * 2 // 3)
    bpy.ops.mesh.primitive_torus_add(major_radius=1, minor_radius=minor, major_segments=segments, minor_segments=8 if FINE else 6, location=(0, 0, 0))
    obj = bpy.context.object
    for v in obj.data.vertices:
        d = Vector((v.co.x, v.co.y, 0)).normalized()
        off = Vector((v.co.x, v.co.y, 0)) - d
        v.co = Vector((d.x * rx + off.x, d.y * ry + off.y, v.co.z * flat))
    obj.location = (centre[0], centre[1], z)
    bake(obj)
    kit._paint(obj, col)
    return obj


def arc(radius, minor, at, col, start, end, rot=(math.pi / 2, 0, 0), segments=24):
    """Part of a ring (a smile, a brow): the points of a torus between angles start..end."""
    bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=minor, major_segments=segments, minor_segments=6, location=(0, 0, 0))
    obj = bpy.context.object
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    drop = [v for v in bm.verts if not (start <= math.atan2(v.co.y, v.co.x) <= end)]
    bmesh.ops.delete(bm, geom=drop, context='VERTS')
    bm.to_mesh(obj.data)
    bm.free()
    obj.location = at
    obj.rotation_euler = rot
    bake(obj)
    kit._paint(obj, col)
    return obj


def flare(r_top, r_bottom, z_top, z_bottom, col, centre=(0, 0), squash=1.0, thickness=0.004, verts=20):
    """An open tube widening downwards (a skirt, a glove cuff), `squash` scales its depth."""
    bpy.ops.mesh.primitive_cone_add(vertices=verts if FINE else max(12, verts * 2 // 3), radius1=r_bottom, radius2=r_top, depth=z_top - z_bottom,
                                    end_fill_type='NOTHING', location=(centre[0], centre[1], (z_top + z_bottom) / 2))
    obj = bpy.context.object
    obj.scale = (1, squash, 1)
    bake(obj, ('SOLIDIFY', {'thickness': thickness}))
    kit._paint(obj, col)
    return obj


def surface(obj, x, z, y_from=-1.0):
    """Where a ray from the front (or the back, y_from > 0) at (x, z) meets `obj`: (point, normal)."""
    ok, hit, normal, _ = obj.ray_cast(Vector((x, y_from, z)), Vector((0, -math.copysign(1, y_from), 0)))
    if not ok:
        raise RuntimeError(f'no surface at {x}, {z}')
    return hit, normal


def on_surface(obj, x, z, sink, y_from=-1.0):
    """A point on the front (or back) of `obj` at (x, z), pushed `sink` into it (negative: stands out)."""
    hit, normal = surface(obj, x, z, y_from)
    return hit - normal * sink, normal


def facing(normal):
    """Euler that turns a part's -Y (its front) to face along `normal`."""
    return (-normal).to_track_quat('Y', 'Z').to_euler()


def down_onto(obj, x, y):
    """Where a ray straight down at (x, y) meets the top of `obj`."""
    ok, hit, _, _ = obj.ray_cast(Vector((x, y, 2.0)), Vector((0, 0, -1)))
    if not ok:
        raise RuntimeError(f'nothing under {x}, {y}')
    return hit


def drape(part, obj, depth):
    """Lays a thin part over the front of `obj`: each point keeps its height over the surface behind it."""
    ys = [v.co.y for v in part.data.vertices]
    middle = (max(ys) + min(ys)) / 2
    for v in part.data.vertices:
        try:
            hit, _ = surface(obj, v.co.x, v.co.z)
        except RuntimeError:
            continue
        v.co.y = hit.y - depth + (v.co.y - middle)
    return part


def copy_of(obj):
    """A separate copy of a mesh object (its own mesh data), in the scene."""
    dup = obj.copy()
    dup.data = obj.data.copy()
    bpy.context.scene.collection.objects.link(dup)
    return dup


def cut(obj, point, normal):
    """Keeps the part of `obj` on the `normal` side of a plane (bisected, so the edge is smooth)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=point, plane_no=-Vector(normal), clear_outer=True)
    bm.to_mesh(obj.data)
    bm.free()
    return obj
