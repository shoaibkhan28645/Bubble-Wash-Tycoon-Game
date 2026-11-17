"""Helpers for models with moving parts (Skyport International's planes, vehicles and props).

A model stands on its own named base (an empty) at x = `x`; its static parts
are joined into one mesh, and each moving part into a mesh of its own inside
an empty named <model>_<part> at its pivot, nested where it rides on another
part (a wheel on its gear leg). Markers are empties named <model>_<name> (a
light, a seat). See art/blender/park.py, which first did it this way.

Also: lofted bodies (a fuselage, a nacelle, a fuel tank: rings of points
along Y, each its own height and size, bridged and smooth shaded), tapered
wings with an airfoil section, rods between two points, painting by rule.
"""
import math

import kit
import bmesh
from mathutils import Vector

bpy = kit.bpy
models = []
bases = []


def smooth(obj):
    obj.data.shade_smooth()
    return obj


def empty(name, parent, at):
    node = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(node)
    node.parent = parent
    node.location = at
    return node


class Model:
    """A model on its own named base at x = `x`; its moving parts nest in empties at their pivots."""

    def __init__(self, name, x=0.0, y=0.0):
        self.name = name
        self.x = x
        self.base = empty(name, None, (x, y, 0))
        bases.append(self.base)
        self.pivots = {None: (x, y, 0)}
        self.holders = {None: self.base}

    def mesh(self, parts, part=None):
        """Joins `parts` into the static mesh, or into a moving part's mesh."""
        parts = [p for p in parts if p is not None]
        if not parts:
            return None
        label = f'{self.name}_mesh' if part is None else f'{self.name}_{part}_mesh'
        obj = kit.join(parts, label)
        kit.set_origin(obj, self.pivots[part])
        obj.parent = self.holders[part]
        obj.location = (0, 0, 0)
        models.append(obj)
        return obj

    def part(self, part, pivot, parts, on=None):
        """A moving part turning about `pivot` (absolute), riding on part `on` (or the base)."""
        parent = self.pivots[on]
        holder = empty(f'{self.name}_{part}', self.holders[on], tuple(p - q for p, q in zip(pivot, parent)))
        self.pivots[part] = tuple(pivot)
        self.holders[part] = holder
        self.mesh(parts, part)

    def marker(self, name, at, on=None):
        parent = self.pivots[on]
        empty(f'{self.name}_{name}', self.holders[on], tuple(p - q for p, q in zip(at, parent)))


def blob(radii, at, col, segments=10, rot=(0, 0, 0)):
    """An ellipsoid: a sphere stretched to `radii` (x, y, z), then turned by `rot`."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=max(4, segments // 2), radius=1, location=at)
    obj = bpy.context.object
    obj.scale = radii
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return smooth(kit._finish(obj, col, rot=rot))


def rod(a, b, r, col, verts=8):
    A, B = Vector(a), Vector(b)
    d = B - A
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_euler()
    return kit.cylinder(r, d.length, tuple((A + B) / 2), col, verts=verts, rot=tuple(rot))


def tube(points, r, col, verts=8):
    """Rods joining a run of points (a handrail, a hose): one per stretch, a ball at each bend."""
    out = []
    for a, b in zip(points, points[1:]):
        out.append(rod(a, b, r, col, verts))
    for p in points[1:-1]:
        out.append(kit.sphere(r * 1.02, p, col, segments=6))
    return out


def ring_of(n, radius, z, make, centre=(0, 0), start=0.0):
    out = []
    for i in range(n):
        a = start + i * 2 * math.pi / n
        out.append(make(centre[0] + radius * math.cos(a), centre[1] + radius * math.sin(a), z, a, i))
    return out


def loft(sections, col, verts=32, cap=True, name='loft'):
    """A body of revolution's cousin: `sections` are (y, cx, cz, rx, rz) rings along Y (centre (cx, cz),
    half width rx, half height rz), bridged; the ends closed with a fan. Smooth shaded. Points run
    round from the top (angle 0) towards +X."""
    bm = bmesh.new()
    rings = []
    for y, cx, cz, rx, rz in sections:
        ring = []
        for i in range(verts):
            a = 2 * math.pi * i / verts
            ring.append(bm.verts.new((cx + rx * math.sin(a), y, cz + rz * math.cos(a))))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for i in range(verts):
            j = (i + 1) % verts
            bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
    if cap:
        for ring, (y, cx, cz, _, _), flip in ((rings[0], sections[0], True), (rings[-1], sections[-1], False)):
            centre = bm.verts.new((cx, y, cz))
            for i in range(verts):
                j = (i + 1) % verts
                f = (ring[i], ring[j], centre) if not flip else (ring[j], ring[i], centre)
                bm.faces.new(f)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    kit._paint(obj, col)
    return smooth(obj)


# A wing section: (fraction along the chord from the leading edge, height over the chord line), top
# side front to back, then the bottom back to front.
AIRFOIL_TOP = ((0.0, 0.0), (0.03, 0.045), (0.1, 0.075), (0.25, 0.09), (0.45, 0.085), (0.7, 0.055), (1.0, 0.008))
AIRFOIL_BOTTOM = ((1.0, -0.004), (0.7, -0.012), (0.45, -0.025), (0.25, -0.032), (0.1, -0.03), (0.03, -0.02))


def wing(root, tip, col, both=True):
    """A tapered wing. `root` and `tip` are (x, y_leading, z, chord, thickness_scale): the section at the
    root and at the tip (the tip's x is the half span). With `both`, mirrored to -x as one piece."""
    bm = bmesh.new()

    def section(x, y0, z, chord, k):
        pts = list(AIRFOIL_TOP) + list(AIRFOIL_BOTTOM)
        return [bm.verts.new((x, y0 + u * chord, z + h * chord * k)) for u, h in pts]

    rx, ry, rz, rc, rk = root
    tx, ty, tz, tc, tk = tip
    secs = [section(-tx, ty, tz, tc, tk)] if both else []
    secs += [section(rx, ry, rz, rc, rk), section(tx, ty, tz, tc, tk)]
    n = len(secs[0])
    for s0, s1 in zip(secs, secs[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((s0[i], s0[j], s1[j], s1[i]))
    for s in (secs[0], secs[-1]):
        bm.faces.new(s)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new('wing')
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new('wing', mesh)
    bpy.context.scene.collection.objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    kit._paint(obj, col)
    return obj


# A fin's thickness either side of x = 0, over the wing section's (an 11% thick fin at its thickest).
FIN_THICK = 0.6


def _fin_half(u):
    """The fin section's half thickness over its chord, `u` of the way along the chord from the leading edge."""
    for (u0, h0), (u1, h1) in zip(AIRFOIL_TOP, AIRFOIL_TOP[1:]):
        if u <= u1:
            return h0 + (h1 - h0) * (max(u, u0) - u0) / (u1 - u0)
    return AIRFOIL_TOP[-1][1]


def fin(root, tip, col):
    """A vertical surface, the same either side of x = 0 (a tail fin, a winglet): `root` and `tip` are
    (z, y_leading, chord, thickness scale)."""
    bm = bmesh.new()
    outline = list(AIRFOIL_TOP) + [(u, -h) for u, h in reversed(AIRFOIL_TOP[1:])]

    def section(z, y0, chord, k):
        return [bm.verts.new((h * chord * k * FIN_THICK, y0 + u * chord, z)) for u, h in outline]

    s0 = section(*root)
    s1 = section(*tip)
    n = len(s0)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((s0[i], s0[j], s1[j], s1[i]))
    bm.faces.new(s0)
    bm.faces.new(s1)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new('fin')
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new('fin', mesh)
    bpy.context.scene.collection.objects.link(obj)
    kit._paint(obj, col)
    return obj


def fin_side(root, tip, y, z):
    """How far out from x = 0 the side of the fin (`root`, `tip` as for fin()) is at (y, z)."""
    z0, y0, c0, k0 = root
    z1, y1, c1, k1 = tip
    t = (z - z0) / (z1 - z0)
    lead = y0 + (y1 - y0) * t
    chord = c0 + (c1 - c0) * t
    u = min(max((y - lead) / chord, 0.0), 1.0)
    return _fin_half(u) * (c0 * k0 + (c1 * k1 - c0 * k0) * t) * FIN_THICK


def fin_inside(root, tip, centre, radius):
    """How far a disc of `radius` at `centre` (y, z) on the fin stays in from its edges (negative: past one)."""
    z0, y0, c0, _ = root
    z1, y1, c1, _ = tip
    room = math.inf
    for i in range(48):
        a = 2 * math.pi * i / 48
        y = centre[0] + radius * math.cos(a)
        z = centre[1] + radius * math.sin(a)
        t = (z - z0) / (z1 - z0)
        lead = y0 + (y1 - y0) * t
        trail = lead + c0 + (c1 - c0) * t
        room = min(room, y - lead, trail - y, z - z0, z1 - z)
    return room


def _fin_decal(root, tip, side, rim, centre, lift, col, rings=2):
    """A flat shape laid on one side of a fin, following its surface `lift` out from it: `rim` its outline
    ((dy, dz) round its middle, anticlockwise seen from +x), in rings to its middle."""
    bm = bmesh.new()
    yc, zc = centre

    def at(dy, dz):
        y = yc + dy
        z = zc + dz
        return bm.verts.new((side * (fin_side(root, tip, y, z) + lift), y, z))

    middle = at(0.0, 0.0)
    loops = [[at(dy * f, dz * f) for dy, dz in rim] for f in (k / rings for k in range(1, rings + 1))]
    n = len(rim)
    order = (lambda q: q) if side > 0 else (lambda q: list(reversed(q)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new(order([middle, loops[0][i], loops[0][j]]))
        for a, b in zip(loops, loops[1:]):
            bm.faces.new(order([a[i], b[i], b[j], a[j]]))
    mesh = bpy.data.meshes.new('decal')
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new('decal', mesh)
    bpy.context.scene.collection.objects.link(obj)
    kit._paint(obj, col)
    return obj


def fin_logo(root, tip, centre, radius, star, disc_col, star_col):
    """An airline's logo on both sides of a fin: a disc of `radius` at `centre` (y, z) with a five-pointed star
    on it (`star`: its points' and its notches' radii), point up, laid on the fin's surface."""
    if fin_inside(root, tip, centre, radius) < 0.05:
        raise ValueError(f'the logo at {centre} runs off its fin')
    disc = [(radius * math.cos(2 * math.pi * i / 28), radius * math.sin(2 * math.pi * i / 28)) for i in range(28)]
    outer, inner = star
    corners = [((outer if i % 2 == 0 else inner) * math.cos(math.pi / 2 + math.pi * i / 5), (outer if i % 2 == 0 else inner) * math.sin(math.pi / 2 + math.pi * i / 5)) for i in range(10)]
    # (Each edge of the star in two, so it follows the fin's curve: the fin's side bends only a little under it.)
    points = []
    for i in range(10):
        a, b = corners[i], corners[(i + 1) % 10]
        points += [(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f) for f in (0.0, 0.5)]
    parts = []
    for side in (-1, 1):
        parts.append(_fin_decal(root, tip, side, disc, centre, 0.012, disc_col))
        parts.append(_fin_decal(root, tip, side, points, centre, 0.026, star_col))
    return parts


def paint(obj, rule):
    """Paints each face by `rule(centre)` → colour (corner colours, so the edges stay crisp)."""
    mesh = obj.data
    attr = mesh.color_attributes.get('Col') or mesh.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    cache = {}
    for poly in mesh.polygons:
        c = rule(obj.matrix_world @ poly.center)
        rgba = cache.get(c) or cache.setdefault(c, kit.colour(c))
        for li in poly.loop_indices:
            attr.data[li].color = rgba
    mesh.color_attributes.active_color = attr
    return obj


_toy = []


def export_all(path, chosen_bases=None):
    if not _toy:
        _toy.append(kit.toy_material('toy'))
        for obj in models:
            kit.use_material(obj, _toy[0])
    chosen = chosen_bases if chosen_bases is not None else bases
    kit.export(chosen + [d for b in chosen for d in b.children_recursive], str(path))
    print('triangles', {b.name: kit.triangles([d for d in b.children_recursive if d.type == 'MESH']) for b in chosen})


def contact_sheet(path, chosen, size=(420, 320), cols=5, ground='#cfd6de', samples=16):
    """Renders each model on its own from the game's camera angle (fitted to its size), and puts the
    pictures side by side in one sheet at `path`. Not exported; for looking at the models."""
    import os
    import tempfile
    from mathutils import Vector as V
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.device = 'CPU'
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new('sky')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = kit.colour('#bfe9ff')
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
    scene.world = world
    bpy.ops.object.light_add(type='SUN', location=(0, 0, 30))
    sun = bpy.context.object
    sun.data.energy = 3.2
    sun.rotation_euler = (math.radians(40), math.radians(-25), math.radians(30))
    bpy.ops.mesh.primitive_plane_add(size=2000, location=(0, 0, 0))
    plane = bpy.context.object
    kit._paint(plane, ground)
    kit.use_material(plane, kit.toy_material('ground'))
    bpy.ops.object.camera_add()
    cam = bpy.context.object
    cam.data.lens = 50
    scene.camera = cam
    tmp = tempfile.mkdtemp()
    shots = []
    for b in chosen:
        meshes = [d for d in b.children_recursive if d.type == 'MESH']
        if not meshes:
            continue
        lo = V((1e9, 1e9, 1e9))
        hi = V((-1e9, -1e9, -1e9))
        for o in meshes:
            for c in o.bound_box:
                w = o.matrix_world @ V(c)
                lo = V((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
                hi = V((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
        centre = (lo + hi) / 2
        radius = max((hi - lo).length / 2, 0.4)
        d = V((0.45, -1, 1.05)).normalized()
        cam.location = centre + d * radius * 3.1
        cam.rotation_euler = (centre - cam.location).to_track_quat('-Z', 'Y').to_euler()
        out = os.path.join(tmp, f'{b.name}.png')
        scene.render.filepath = out
        bpy.ops.render.render(write_still=True)
        shots.append((b.name, out))
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        print('no PIL: shots in', tmp)
        return
    rows = (len(shots) + cols - 1) // cols
    sheet = Image.new('RGB', (size[0] * cols, size[1] * rows), 'white')
    draw = ImageDraw.Draw(sheet)
    for i, (name, f) in enumerate(shots):
        x, y = (i % cols) * size[0], (i // cols) * size[1]
        sheet.paste(Image.open(f), (x, y))
        draw.text((x + 8, y + 6), name, fill='black')
    sheet.save(path)
    print('sheet', path)
