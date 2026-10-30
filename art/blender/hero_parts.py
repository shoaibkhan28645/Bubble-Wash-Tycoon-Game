"""The hero's head, cap, hands, boots and clothing details (see hero.py),
and the little shape makers they are built from.

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


def hug(part, obj, depth):
    """Bends a flat decal onto `obj`'s front: each point keeps `depth` above the surface behind it."""
    for v in part.data.vertices:
        try:
            hit, _ = surface(obj, v.co.x, v.co.z)
        except RuntimeError:
            continue
        v.co.y += hit.y - depth - _centre_y(part)
    return part


def _centre_y(part):
    ys = [v.co.y for v in part.data.vertices]
    return (max(ys) + min(ys)) / 2


def head():
    a, b, c = m.HEAD

    def chubby(co):
        # Fuller cheeks and jaw, a flatter back.
        low = smoothstep(HZ + 0.01, HZ - 0.08, co.z)
        co.x *= 1 + 0.08 * low
        if co.y > 0:
            co.y *= 0.92
        return co

    skull = blob((2 * a, 2 * b, 2 * c), (0, 0, HZ), m.SKIN, level=3, shape=chubby)
    parts = [skull]
    for sx in (1, -1):
        # Eyes: tall dark ovals with a shine.
        at, n = on_surface(skull, sx * 0.039, HZ + 0.012, 0.004)
        parts.append(ball(0.0145, at, m.EYE, scale=(1, 0.55, 1.55), rot=facing(n), segments=12))
        parts.append(ball(0.0052, at - n * 0.008 + Vector((-sx * 0.004, 0, 0.011)), m.WHITE, segments=8))
        # Rosy cheeks.
        at, n = on_surface(skull, sx * 0.066, HZ - 0.028, 0.004)
        parts.append(ball(0.018, at, m.CHEEK, scale=(1, 0.4, 0.75), rot=facing(n), segments=12))
        # Ears and sideburns.
        parts.append(ball(0.024, (sx * 0.111, 0.008, HZ - 0.004), m.SKIN, scale=(0.55, 0.85, 1.2), segments=12))
        parts.append(ball(0.008, (sx * 0.12, 0.006, HZ - 0.004), m.NOSE, scale=(0.5, 0.8, 1.3), segments=8))
        parts.append(blob((0.016, 0.03, 0.052), (sx * 0.1, -0.026, HZ + 0.012), m.HAIR, level=2))
    # A big round nose.
    at, n = on_surface(skull, 0, HZ - 0.016, 0.014)
    parts.append(ball(0.03, at, m.NOSE, scale=(1.1, 0.95, 0.9), segments=16))
    # A wide grin.
    at, n = on_surface(skull, 0, HZ - 0.064, 0.0)
    grin = arc(0.03, 0.0058, (0, at.y, HZ - 0.036), m.MOUTH, -math.pi + 0.45, -0.45)
    parts.append(hug(grin, skull, -0.002))
    # Hair at the back, under the cap.
    parts.append(ball(0.09, (0, 0.046, HZ - 0.006), m.HAIR, scale=(1.08, 0.66, 0.62), segments=16))
    return [(p, 'head') for p in parts] + cap()


def cap():
    a, b, c = m.HEAD
    top = HZ + 0.04
    crown = ball(1.0, (0, 0.004, top), m.RED, scale=(a + 0.01, b + 0.012, c * 0.9), segments=32)
    cut = top + 0.004
    bm = bmesh.new()
    bm.from_mesh(crown.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < cut], context='VERTS')
    bm.to_mesh(crown.data)
    bm.free()

    def panel(cen):
        # The white foam front panel.
        if abs(math.atan2(cen.x, -cen.y)) < math.radians(52) and cen.z < top + 0.075:
            return m.WHITE
        return m.RED

    m.paint_faces(crown, panel)
    parts = [crown]
    # The bubble logo on the panel.
    for x, z, r in ((0.0, top + 0.03, 0.02), (0.027, top + 0.052, 0.011), (-0.024, top + 0.054, 0.008)):
        at, n = on_surface(crown, x, z, 0.002)
        parts.append(ball(r, at, m.BUBBLE, scale=(1, 0.3, 1), rot=facing(n), segments=14))
    at, n = on_surface(crown, -0.007, top + 0.038, -0.001)
    parts.append(ball(0.006, at, m.WHITE, scale=(1, 0.4, 1), rot=facing(n), segments=8))

    # The brim: a rounded D that sticks out front, curved down at the sides.
    back, length = -0.07, 0.1

    def brim_shape(co):
        f = smoothstep(back, back - length, co.y)
        co.x *= 1 - 0.3 * f * f
        co.z -= 0.018 * (co.x / 0.1) ** 2 + 0.012 * f
        return co

    parts.append(blob((0.19, length, 0.013), (0, back - length / 2, top + 0.008), m.RED, level=2, shape=brim_shape))
    parts.append(ball(0.011, (0, 0.004, top + c * 0.9), m.RED_DARK, scale=(1, 1, 0.6), segments=10))
    return [(p, 'head') for p in parts]


def hands():
    out = []
    for side, sx in (('left', 1), ('right', -1)):
        hand = f'hand-{side}'
        out.append((blob((0.06, 0.054, 0.064), (sx * 0.147, -0.01, 0.238), m.SKIN, level=2), hand))
        out.append((ball(0.016, (sx * 0.126, -0.036, 0.25), m.SKIN, scale=(0.9, 0.9, 1.35), rot=(0.3, 0, sx * 0.3), segments=10), hand))
    return out


def boots():
    """Boots on the foot bones; the shaft (None) follows the body round the ankle."""
    out = []
    for side, sx in (('left', 1), ('right', -1)):
        x = sx * 0.058
        foot = f'foot-{side}'

        def toe(co):
            # A big round toe.
            f = smoothstep(-0.03, -0.09, co.y)
            co.z = 0.012 + (co.z - 0.012) * (1 + 0.15 * f)
            return co

        out.append((blob((0.08, 0.142, 0.062), (x, -0.024, 0.042), m.BOOT, level=2, shape=toe), foot))
        out.append((blob((0.084, 0.144, 0.022), (x, -0.024, 0.012), m.SOLE, level=2), foot))
        # The shaft and its cuff bend with the ankle, under the trouser leg.
        out.append((blob((0.07, 0.068, 0.046), (x, 0.004, 0.078), m.BOOT, level=2), None))
        out.append((ring(0.036, 0.035, 0.008, 0.098, m.LEATHER_DARK, centre=(x, 0.004), flat=1.3), None))
        out.append((blob((0.03, 0.01, 0.022), (x, -0.06, 0.066), m.LEATHER, rot=(0.6, 0, 0), level=1), foot))
    return out


def clothes(body):
    """Belt, pouches, sponge, collar, bib pocket, buttons and trouser cuffs."""
    waist, chest, collar = {'hips': 0.65, 'spine': 0.35}, {'chest': 0.7, 'spine': 0.3}, {'chest': 0.8, 'neck': 0.2}
    out = []
    w, d, cx, cy = m.section(body, 0.31)
    out.append((ring(w + 0.004, d + 0.004, 0.011, 0.31, m.LEATHER, centre=(cx, cy), flat=1.5, segments=32), waist))
    front = cy - d
    out.append((blob((0.036, 0.014, 0.032), (0, front - 0.006, 0.31), m.BRASS, level=1), waist))
    out.append((blob((0.022, 0.008, 0.016), (0, front - 0.012, 0.31), m.LEATHER_DARK, level=1), waist))
    for sx in (1, -1):
        out.append((blob((0.046, 0.036, 0.052), (sx * (w - 0.004), cy - 0.036, 0.288), m.LEATHER_DARK, rot=(0, 0, sx * 0.5), level=2), waist))
        out.append((blob((0.048, 0.012, 0.014), (sx * (w - 0.008), cy - 0.05, 0.31), m.LEATHER, rot=(0, 0, sx * 0.5), level=1), waist))
    out.append((blob((0.04, 0.03, 0.05), (0.06, cy + d - 0.004, 0.29), m.SPONGE, level=1), waist))
    # Shirt collar: a red band and two points.
    nw, nd, ncx, ncy = m.section(body, 0.468, xmin=-0.05, xmax=0.05)
    out.append((ring(nw + 0.004, nd + 0.004, 0.0075, 0.465, m.RED, centre=(ncx, ncy), flat=1.3), collar))
    for sx in (1, -1):
        out.append((blob((0.036, 0.01, 0.03), (sx * 0.022, ncy - nd - 0.008, 0.457), m.RED, rot=(0.3, 0, sx * 0.55), level=1), collar))
    # Overalls: a bib pocket and brass buttons where the straps meet the bib.
    bw, bd, bcx, bcy = m.section(body, 0.39, xmin=-0.03, xmax=0.03)
    bib = bcy - bd
    out.append((blob((0.054, 0.01, 0.036), (0, bib - 0.002, 0.388), m.DENIM_DARK, level=1), chest))
    for sx in (1, -1):
        out.append((ball(0.0095, (sx * 0.054, bib + 0.004, 0.41), m.BRASS, scale=(1, 0.6, 1), segments=10), chest))
        lw, ld, lcx, lcy = m.section(body, 0.098, xmin=min(0, sx), xmax=max(0, sx))
        out.append((ring(lw + 0.004, ld + 0.004, 0.01, 0.098, m.DENIM_DARK, centre=(lcx, lcy), flat=1.4), None))
    return out
