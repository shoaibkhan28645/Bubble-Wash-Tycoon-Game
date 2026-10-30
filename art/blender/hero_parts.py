"""The hero's head and hair, gloved hands, rubber boots and outfit details
(see hero.py), and the little shape makers they are built from.

Each part maker returns a list of (object, bones): a bone name (or a blend,
{bone: weight}) pins the part; None lets it take the body's weights where
it sits.
"""
import math

import bpy  # noqa: I001
import bmesh
from mathutils import Vector

import hero_model as m
import kit
from hero_model import bake, smoothstep

HZ = m.HZ


def blob(size, at, col, rot=(0, 0, 0), level=2, shape=None):
    """A soft rounded block: a cube of `size` (full widths), subdivided; `shape(co)` may push its points."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=at, rotation=rot)
    obj = bpy.context.object
    obj.scale = size
    bake(obj, ('SUBSURF', {'levels': level, 'render_levels': level}))
    if shape:
        for v in obj.data.vertices:
            v.co = shape(v.co)
    kit._paint(obj, col)
    return obj


def ball(radius, at, col, scale=(1, 1, 1), rot=(0, 0, 0), segments=14):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=max(6, segments // 2 + 1), radius=radius, location=at, rotation=rot)
    obj = bpy.context.object
    obj.scale = scale
    bake(obj)
    kit._paint(obj, col)
    return obj


def ring(rx, ry, minor, z, col, centre=(0, 0), flat=1.0, segments=28):
    """A band round the body at height z: radii rx, ry; `flat` stretches its cross-section upright."""
    bpy.ops.mesh.primitive_torus_add(major_radius=1, minor_radius=minor, major_segments=segments, minor_segments=8, location=(0, 0, 0))
    obj = bpy.context.object
    for v in obj.data.vertices:
        d = Vector((v.co.x, v.co.y, 0)).normalized()
        off = Vector((v.co.x, v.co.y, 0)) - d
        v.co = Vector((d.x * rx + off.x * 1.0, d.y * ry + off.y * 1.0, v.co.z * flat))
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


def surface(obj, x, z, y_from=-1.0):
    """Where a ray from the front (or the back, y_from > 0) at (x, z) meets `obj`: (point, normal)."""
    origin = Vector((x, y_from, z))
    ok, hit, normal, _ = obj.ray_cast(origin, Vector((0, -math.copysign(1, y_from), 0)))
    if not ok:
        raise RuntimeError(f'no surface at {x}, {z}')
    return hit, normal


def on_surface(obj, x, z, sink):
    """A point on the front of `obj` at (x, z), pushed `sink` into it (negative: stands out)."""
    hit, normal = surface(obj, x, z)
    return hit - normal * sink, normal


def facing(normal):
    """Euler that turns a part's -Y (its front) to face along `normal`."""
    return (-normal).to_track_quat('Y', 'Z').to_euler()


def head():
    a, b, c = m.HEAD

    def jaw(co):
        # Full cheeks, a soft jaw, a flatter back of the head.
        low = smoothstep(HZ + 0.01, HZ - 0.08, co.z)
        co.x *= 1 + 0.07 * low
        if co.y > 0:
            co.y *= 0.9
        return co

    skull = blob((2 * a, 2 * b, 2 * c), (0, 0, HZ), m.SKIN, level=3, shape=jaw)
    parts = [skull]
    for sx in (1, -1):
        at, n = on_surface(skull, sx * 0.031, HZ + 0.004, 0.003)
        parts.append(ball(0.0115, at, m.EYE, scale=(1, 0.55, 1.45), rot=facing(n), segments=12))
        parts.append(ball(0.0042, at - n * 0.007 + Vector((-sx * 0.003, 0, 0.007)), m.WHITE, segments=8))
        at, n = on_surface(skull, sx * 0.034, HZ + 0.038, -0.001)
        parts.append(blob((0.028, 0.009, 0.0085), at, m.HAIR, rot=(0, sx * 0.12, 0), level=1))
        at, n = on_surface(skull, sx * 0.054, HZ - 0.03, 0.003)
        parts.append(ball(0.013, at, m.CHEEK, scale=(1, 0.4, 0.72), rot=facing(n), segments=12))
        parts.append(ball(0.02, (sx * 0.09, 0.006, HZ - 0.02), m.SKIN, scale=(0.5, 0.8, 1.15), segments=12))
        parts.append(ball(0.007, (sx * 0.097, 0.004, HZ - 0.02), m.SKIN_SHADE, scale=(0.5, 0.8, 1.3), segments=8))
    at, n = on_surface(skull, 0, HZ - 0.016, 0.006)
    parts.append(ball(0.016, at, m.SKIN_SHADE, scale=(1, 0.95, 0.9), segments=12))
    at, n = on_surface(skull, 0, HZ - 0.06, 0.0)
    grin = arc(0.021, 0.0045, (0, at.y, HZ - 0.04), m.MOUTH, -math.pi + 0.5, -0.5)
    parts.append(drape(grin, skull, -0.0015))
    return [(p, 'head') for p in parts + hair(skull)]


def hair(skull):
    """A soft cartoon mop: a thick shell over the skull, cut along a smooth tilted hairline (above the
    brows at the front, over the ears, down to the nape), a side-swept fringe over the forehead and a
    quiff swelling up over the front of the crown."""
    shell = skull.copy()
    shell.data = skull.data.copy()
    bpy.context.scene.collection.objects.link(shell)
    bm = bmesh.new()
    bm.from_mesh(shell.data)
    for v in bm.verts:
        co = Vector((v.co.x * 1.13, v.co.y * 1.12 + 0.006, HZ + (v.co.z - HZ) * 1.06 + 0.008))
        # The quiff: the hair over the front of the crown swells up and forward, off-centre.
        up = smoothstep(HZ + 0.02, HZ + 0.09, co.z) * math.exp(-(((co.x - 0.014) / 0.085) ** 2 + ((co.y + 0.05) / 0.075) ** 2))
        v.co = co + Vector((0, -0.016 * up, 0.024 * up))
    # The hairline: a plane, high over the forehead and low at the nape.
    front, back = Vector((0, -0.1, HZ + 0.05)), Vector((0, 0.1, HZ - 0.045))
    normal = Vector((0, -(front.z - back.z), front.y - back.y)).normalized()
    if normal.z < 0:
        normal = -normal
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=front, plane_no=normal, clear_inner=True)
    bm.to_mesh(shell.data)
    bm.free()
    bake(shell, ('SOLIDIFY', {'thickness': 0.012, 'offset': -1}))
    kit._paint(shell, m.HAIR)
    parts = [shell]
    # The fringe sweeps from high on the right across to the left brow.
    fringe = blob((0.13, 0.026, 0.04), (0.004, -0.1, HZ + 0.054), m.HAIR, rot=(0, -0.3, 0), level=2)
    parts.append(drape(fringe, shell, -0.002))
    return parts


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


def hands():
    """Big yellow rubber gloves, a mitten with a thumb and a flared cuff."""
    out = []
    for side, sx in (('left', 1), ('right', -1)):
        hand = f'hand-{side}'
        x = sx * 0.148

        def mitt(co, x=x):
            # Fingers curl in towards the palm at the bottom.
            low = smoothstep(0.31, 0.27, co.z)
            co.y -= 0.012 * low
            return co

        out.append((blob((0.06, 0.054, 0.08), (x, -0.006, 0.313), m.RUBBER, level=2, shape=mitt), hand))
        out.append((ball(0.017, (x - sx * 0.028, -0.026, 0.326), m.RUBBER, scale=(0.85, 0.9, 1.35), rot=(0.3, 0, sx * 0.35), segments=12), hand))
        bpy.ops.mesh.primitive_cone_add(vertices=20, radius1=0.033, radius2=0.041, depth=0.034, end_fill_type='NOTHING', location=(sx * 0.144, -0.002, 0.366))
        cuff = bpy.context.object
        bake(cuff, ('SOLIDIFY', {'thickness': 0.004}))
        kit._paint(cuff, m.RUBBER_DARK)
        out.append((cuff, hand))
    return out


def boots(body):
    """Yellow rubber boots: the foot on the foot bone, a rim round the top of the shaft."""
    out = []
    for side, sx in (('left', 1), ('right', -1)):
        x = sx * m.LEG_X

        def toe(co):
            f = smoothstep(-0.02, -0.08, co.y)
            co.z = 0.01 + (co.z - 0.01) * (1 + 0.12 * f)
            return co

        foot = f'foot-{side}'
        out.append((blob((0.078, 0.13, 0.058), (x, -0.026, 0.04), m.RUBBER, level=2, shape=toe), foot))
        out.append((blob((0.074, 0.074, 0.066), (x, 0.004, 0.07), m.RUBBER, level=2), foot))
        out.append((blob((0.084, 0.136, 0.02), (x, -0.026, 0.01), m.SOLE, level=2), foot))
        w, d, cx, cy = m.section(body, m.BOOT_TOP, xmin=min(0, sx), xmax=max(0, sx))
        out.append((ring(w + 0.001, d + 0.001, 0.006, m.BOOT_TOP, m.RUBBER_DARK, centre=(cx, cy), flat=1.8), {f'shin-{side}': 1.0}))
    return out


def extras(body):
    """Belt, collar, placket, chest badge, a spray bottle on the hip and a towel in the back pocket."""
    waist, chest, collar = {'hips': 0.65, 'spine': 0.35}, {'chest': 0.7, 'spine': 0.3}, {'chest': 0.8, 'neck': 0.2}
    out = []
    w, d, cx, cy = m.section(body, m.WAIST)
    out.append((ring(w + 0.003, d + 0.003, 0.011, m.WAIST, m.BELT, centre=(cx, cy), flat=1.3, segments=32), waist))
    out.append((blob((0.036, 0.012, 0.028), (0, cy - d - 0.007, m.WAIST), m.STEEL, level=1), waist))
    # Polo collar and placket.
    nw, nd, ncx, ncy = m.section(body, 0.548, xmin=-0.045, xmax=0.045)
    out.append((ring(nw + 0.004, nd + 0.004, 0.0075, 0.546, m.WHITE, centre=(ncx, ncy), flat=1.4), collar))
    for sx in (1, -1):
        out.append((blob((0.03, 0.008, 0.024), (sx * 0.018, ncy - nd - 0.006, 0.537), m.WHITE, rot=(0.3, 0, sx * 0.55), level=1), collar))
    at, n = on_surface(body, 0, 0.512, 0.001)
    out.append((blob((0.018, 0.006, 0.04), at, m.POLO_DARK, rot=facing(n), level=1), chest))
    for dz in (0.008, -0.01):
        out.append((ball(0.0045, at - n * 0.004 + Vector((0, 0, dz)), m.WHITE, scale=(1, 0.5, 1), segments=8), chest))
    # The car wash badge on the chest: a white disc with an aqua bubble.
    at, n = on_surface(body, 0.05, 0.488, 0.0)
    out.append((ball(0.02, at, m.WHITE, scale=(1, 0.3, 1), rot=facing(n), segments=16), chest))
    out.append((ball(0.009, at - n * 0.004 + Vector((-0.002, 0, 0.001)), m.BUBBLE, scale=(1, 0.4, 1), rot=facing(n), segments=12), chest))
    out.append((ball(0.0045, at - n * 0.004 + Vector((0.009, 0, 0.008)), m.BUBBLE, scale=(1, 0.4, 1), rot=facing(n), segments=8), chest))
    # A spray bottle clipped to the left hip.
    bx, by = w + 0.008, cy - 0.004
    out.append((blob((0.022, 0.03, 0.044), (bx, by, 0.36), m.BOTTLE, level=2), waist))
    out.append((blob((0.02, 0.026, 0.016), (bx, by, 0.39), m.WHITE, level=1), waist))
    out.append((blob((0.01, 0.022, 0.01), (bx, by - 0.02, 0.394), m.WHITE, level=1), waist))
    # A pink towel tucked into the right back pocket.
    back = cy + d
    out.append((blob((0.05, 0.012, 0.022), (-0.042, back + 0.004, 0.384), m.TOWEL, level=1), waist))
    out.append((blob((0.046, 0.01, 0.07), (-0.042, back + 0.008, 0.343), m.TOWEL, rot=(-0.1, 0, 0), level=1), waist))
    out.append((blob((0.047, 0.011, 0.008), (-0.042, back + 0.012, 0.318), m.WHITE, rot=(-0.1, 0, 0), level=1), waist))
    return out
