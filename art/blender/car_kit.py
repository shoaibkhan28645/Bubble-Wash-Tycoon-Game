"""Smooth, rounded car parts for cars.py: bodies and cabins lofted through
rounded cross-sections (so hoods, roofs and sides curve), wheel arches cut
into the body, round tyres with spoked rims, and soft lights and bumpers.
Everything is smooth shaded; colour edges stay crisp (each face carries one
colour), and a face is painted by a rule that knows where on the car it is.

Cars are modelled nose to -Y, standing on the ground (z = 0), centred on x.
"""
import math

import bpy  # noqa: I001
import bmesh

import kit

PAINT = '#ff00ff'
GLASS = '#2c4258'
TYRE = '#26292f'
WALL = '#30343c'
RIM = '#dfe4ea'
DISH = '#7f8996'
TRIM = '#2a2f37'
CHROME = '#eef2f6'
LIGHT = '#fff6d8'
TAIL = '#e5303c'
AMBER = '#ffa630'
PLATE = '#f2f4f7'
ARCH = '#16191e'


def spline(points, y):
    """Smooth curve through (y, value) points (Catmull-Rom), flat beyond the ends."""
    if y <= points[0][0]:
        return points[0][1]
    if y >= points[-1][0]:
        return points[-1][1]
    for i in range(len(points) - 1):
        (y1, v1), (y2, v2) = points[i], points[i + 1]
        if y <= y2:
            v0 = points[i - 1][1] if i > 0 else v1
            v3 = points[i + 2][1] if i + 2 < len(points) else v2
            t = (y - y1) / (y2 - y1)
            return 0.5 * (2 * v1 + (-v0 + v2) * t + (2 * v0 - 5 * v1 + 4 * v2 - v3) * t * t + (-v0 + 3 * v1 - 3 * v2 + v3) * t ** 3)
    return points[-1][1]


def _se(t, n):
    """A superellipse point (cos, sin) at angle t: n = 2 is round, larger is boxier."""
    c, s = math.cos(t), math.sin(t)
    return math.copysign(abs(c) ** (2 / n), c), math.copysign(abs(s) ** (2 / n), s)


def stations(y0, y1, count, extra=()):
    """Positions along the car, closer together towards the ends (where it rounds off), plus `extra` ones."""
    ys = {round(y0 + (y1 - y0) * (1 - math.cos(math.pi * i / count)) / 2, 4) for i in range(count + 1)}
    ys |= {round(y, 4) for y in extra if y0 < y < y1}
    return sorted(ys)


def _loft(rings, ys, name, rule):
    """Joins rings of (x, z, t) points (one per y, all the same length, going round) into a closed
    mesh, capped at both ends, and paints each face by rule(y, t, normal, centre)."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    bm = bmesh.new()
    verts = [[bm.verts.new((pt[0], y + (pt[3] if len(pt) > 3 else 0.0), pt[1])) for pt in ring] for ring, y in zip(rings, ys)]
    params = {}
    count = len(rings[0])
    for i in range(len(rings) - 1):
        for j in range(count):
            k = (j + 1) % count
            f = bm.faces.new([verts[i][j], verts[i][k], verts[i + 1][k], verts[i + 1][j]])
            tj, tk = rings[i][j][2], rings[i][k][2]
            t = -1 if min(tj, tk) < 0 else (tj + tk) / 2 if abs(tj - tk) < 3 else 0
            params[f] = ((ys[i] + ys[i + 1]) / 2, t)
    for i, ring in ((0, rings[0]), (len(rings) - 1, rings[-1])):
        cx = sum(p[0] for p in ring) / count
        cz = sum(p[1] for p in ring) / count
        dy = sum(p[3] if len(p) > 3 else 0.0 for p in ring) / count
        centre = bm.verts.new((cx, ys[i] + dy, cz))
        for j in range(count):
            f = bm.faces.new([verts[i][j], verts[i][(j + 1) % count], centre])
            params[f] = (ys[i], -2)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    attr_cols = [rule(params[f][0], params[f][1], f.normal.copy(), f.calc_center_median()) for f in bm.faces]
    bm.to_mesh(mesh)
    bm.free()
    attr = mesh.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    cache = {}
    for poly, col in zip(mesh.polygons, attr_cols):
        rgba = cache.get(col) or cache.setdefault(col, kit.colour(col))
        for li in poly.loop_indices:
            attr.data[li].color = rgba
    mesh.color_attributes.active_color = attr
    return obj


def cabin(y0, y1, half_w, base, roof, x=0.0, lean=0.82, corner=0.14, count=10, extra=(), rule=None, n=None):
    """The glasshouse: from the windscreen's foot (y0) to the rear window's (y1), rising from `base`
    (just under the body's top) to the `roof` (y, z) points; its sides lean in towards the top and
    round over into the roof. Each ring is the same row by row (sill, side window, the rounded frame,
    the roof), so window edges run cleanly along the rows: the rule gets the row's kind as `t`
    (0-1 sill, 1-2 side window, 2-3.5 frame, 3.5+ roof; -1 underneath)."""
    ys = stations(y0, y1, count, extra)
    ys[0] += 0.002
    ys[-1] -= 0.002
    rings = []
    for y in ys:
        h = max(0.004, spline(roof, y) - base)
        c = min(corner, 0.45 * h)
        top = half_w * lean
        right = [(half_w, base, 0), (half_w - (half_w - top) * 0.1, base + 0.1 * h, 1),
                 (top + c * 0.3, base + h - c, 2)]
        for k in (1, 2):
            a = math.pi / 2 * k / 3
            right.append((top - c + c * math.cos(a) + c * 0.3 * (1 - k / 3), base + h - c + c * math.sin(a), 2 + k * 0.5))
        right.append((top - c, base + h, 3.5))
        right.append((top * 0.4, base + h + 0.012, 4))
        pts = right + [(0.0, base + h + 0.018, 4)] + [(-px, pz, k) for px, pz, k in reversed(right)]
        pts += [(px, base, -1) for px in (-half_w / 2, 0.0, half_w / 2)]
        rings.append([(x + px, pz, k) for px, pz, k in pts])
    return _loft(rings, ys, 'cabin', rule or (lambda *a: GLASS))


def windows(y_screen, y_rear, b_pillars=(), pillar=0.05, body=PAINT, seal=TRIM):
    """A painting rule for a cabin: glass windscreen, side and rear windows; painted roof, pillars and
    window frames, and a rubber (or chrome) `seal` along the bottom of the side windows."""
    def rule(y, t, normal, centre):
        if t < 0:
            return body
        if t < 1:
            return seal if y_screen - 0.1 < y < y_rear + 0.1 else body
        front, back = y < y_screen, y > y_rear
        if t < 2:
            return body if not (front or back) and any(abs(y - b) < pillar for b in b_pillars) else GLASS
        if t < 3.5:
            return body
        return GLASS if front or back else body
    return rule


def cut_arches(obj, x, half, axles, radius, centre, depth=0.34):
    """Cuts a wheel arch into each side of the body at each axle, lined dark."""
    cutters = []
    for y in axles:
        for sx in (-1, 1):
            c = kit.cylinder(radius, depth + 0.3, (x + sx * (half + 0.15 - depth / 2), y, centre), ARCH, verts=28, rot=(0, math.pi / 2, 0))
            cutters.append(c)
    for c in cutters:
        mod = obj.modifiers.new('arch', 'BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.solver = 'EXACT'
        mod.object = c
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(c)
    # Whatever the cut made: dark inside the arch.
    attr = obj.data.color_attributes['Col']
    dark = kit.colour(ARCH)
    for poly in obj.data.polygons:
        c = poly.center
        inside = any(math.hypot(c.y - y, c.z - centre) < radius + 0.012 for y in axles)
        # The arch's curved lining and its back wall, not the body's side round it.
        if inside and poly.normal.z < 0.5 and (abs(poly.normal.x) < 0.5 or abs(abs(c.x - x) - (half - depth)) < 0.02):
            for li in poly.loop_indices:
                attr.data[li].color = dark
    return obj


def wheel(at, r, w, side, rim=RIM, dish=DISH, spokes=5, segs=20):
    """A tyre with rounded shoulders and a spoked rim facing out on `side` (+1 or -1)."""
    x, y, z = at
    c = min(0.07, w / 3)
    ri = r * 0.64
    prof = [(-w / 2, ri), (-w / 2, r - c)]
    for k in (1,):
        a = math.pi / 4
        prof.append((-w / 2 + c - c * math.cos(a), r - c + c * math.sin(a)))
    prof += [(-w / 2 + c, r), (w / 2 - c, r)]
    for k in (1,):
        a = math.pi / 4
        prof.append((w / 2 - c + c * math.sin(a), r - c + c * math.cos(a)))
    prof += [(w / 2, r - c), (w / 2, ri)]
    tyre = _lathe(prof, segs, 'tyre', lambda cx, cr: TYRE if cr > r - 0.02 else WALL)
    o = w / 2 * 0.9
    disc = [(o, ri * 1.02), (o + 0.012, ri * 0.95), (o - 0.03, ri * 0.84), (o - 0.05, ri * 0.25), (o - 0.03, 0.0)]
    hub = _lathe(disc, segs, 'rim', lambda cx, cr: rim if cr > ri * 0.9 else dish)
    parts = [tyre, hub]
    for k in range(spokes):
        a = 2 * math.pi * k / spokes
        p = kit.box((0.05, ri * 0.72, 0.075 * r / 0.33), (o - 0.03, -math.sin(a) * ri * 0.5, math.cos(a) * ri * 0.5), rim, bevel=0.0, rot=(a, 0, 0))
        parts.append(p)
    parts.append(kit.cylinder(ri * 0.2, 0.05, (o - 0.01, 0, 0), CHROME, verts=10, rot=(0, math.pi / 2, 0)))
    obj = kit.join(parts, 'wheel')
    if side < 0:
        obj.scale = (-1, 1, 1)
    obj.location = (x, y, z)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if side < 0:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
        bm.to_mesh(obj.data)
        bm.free()
    return obj


def wheels(x, half, axles, r, w=0.28, inset=0.13, **kw):
    """Four wheels, sitting in the arches: tread on the ground, rims out."""
    return [wheel((x + sx * (half - inset), y, r), r, w, sx, **kw) for y in axles for sx in (-1, 1)]


def _lathe(profile, segs, name, rule):
    """Spins a profile of (axial, radius) points round the X axis."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    bm = bmesh.new()
    rings = []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        rings.append([bm.verts.new((ax, rad * math.sin(a), rad * math.cos(a))) for ax, rad in profile])
    cols = []
    for i in range(segs):
        nxt = (i + 1) % segs
        for j in range(len(profile) - 1):
            f = bm.faces.new([rings[i][j], rings[i][j + 1], rings[nxt][j + 1], rings[nxt][j]])
            cols.append(rule((profile[j][0] + profile[j + 1][0]) / 2, (profile[j][1] + profile[j + 1][1]) / 2))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    attr = mesh.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    for poly, col in zip(mesh.polygons, cols):
        rgba = kit.colour(col)
        for li in poly.loop_indices:
            attr.data[li].color = rgba
    return obj


def soft(size, at, col, rot=(0, 0, 0), round_=0.4, segments=2):
    """A soft rounded block (lights, bumpers, mirrors): bevelled with a couple of segments."""
    return kit.box(size, at, col, bevel=min(size) * round_, segments=segments, rot=rot)


def pair(make, x, dx, *args, **kw):
    """`make` on both sides: at x - dx and x + dx (args after the position are passed on)."""
    return [make(x + sx * dx, *args, **kw) for sx in (-1, 1)]


def smooth(obj, angle=50):
    """Smooth shaded, with edges sharper than `angle` degrees kept crisp."""
    mesh = obj.data
    for poly in mesh.polygons:
        poly.use_smooth = True
    mesh.set_sharp_from_angle(angle=math.radians(angle))
    return obj
