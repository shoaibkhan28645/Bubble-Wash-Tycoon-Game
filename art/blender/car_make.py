"""Builds one car from a spec (see cars.py): a smooth lofted body with wheel
arches, a glasshouse, wheels, lights, grille, bumpers, plates and mirrors.

Spec keys (lengths in metres, y along the car with the nose at -L/2):
  L, W            length and width of the body
  top, bottom     (y, z) points of the body's top and bottom lines
  axles, r, tyre  wheel positions along the car, radius and width
  cabin           dict: y0, y1 (foot of windscreen and rear window), roof
                  (y, z) points, base, screen and rear (where the roof
                  starts and ends), b (B pillars), half (half width),
                  lean, a_pillar, c_pillar
  head, tail      lamp heights; bumpers: (front z, back z)
  mirror          (y, z) of the wing mirrors
  paint           the body colour (PAINT: the game paints it)
  n, end          body boxiness and how round its nose and tail are
  skirt           how far down the sides the dark sill starts (0 halfway, 1 the bottom)
  doors           y of the door shut lines along the side (front edge, between doors, back
                  edge); a handle near the back of each door
  hood, boot      y of the bonnet's front edge and the boot lid's back edge (their lines run
                  back to the windscreen and forward to the rear window)
  fuel            y of the fuel cap on the right rear quarter
  seal            the colour of the strip under the side windows (rubber, or chrome)
"""
import math

import bpy  # noqa: F401,I001
import car_kit as ck
from car_kit import CHROME, GLASS, LIGHT, PAINT, PLATE, TAIL, TRIM, AMBER  # noqa: F401


SHOULDER = 1.05
"""Where the bonnet's and boot lid's side lines run, round the body from the side (radians)."""


def body_rule(s, extra=None):
    """Paint, with a dark sill along the bottom of the sides, and panel lines: the doors, the bonnet
    and the boot lid (and `extra(y, t, normal, centre)` first)."""
    paint = s.get('paint', PAINT)
    skirt = s.get('skirt', 0.62)
    doors = s.get('doors', ())
    c = s.get('cabin') or {}
    hood, boot = s.get('hood'), s.get('boot')
    near = ck.GAP + 1e-3

    def rule(y, t, normal, centre):
        if extra:
            col = extra(y, t, normal, centre)
            if col:
                return col
        if t < 0:
            return paint
        up = math.sin(t)
        if up < -skirt:
            return TRIM
        side = abs(math.cos(t)) > 0.3 and up < 0.86
        if side and any(abs(y - d) < near for d in doors):
            return ck.SEAM
        on_shoulder = min(abs(t - SHOULDER), abs(t - (math.pi - SHOULDER))) < 1e-3
        top = up > math.sin(SHOULDER) - 0.02
        for start, end in ((hood, c.get('y0')), (c.get('y1'), boot)):
            if start is None or end is None:
                continue
            lo, hi = min(start, end), max(start, end)
            if on_shoulder and lo <= y <= hi:
                return ck.SEAM
            if top and abs(y - (hood if start == hood else boot)) < near:
                return ck.SEAM
        return paint
    return rule


def _seam_stations(s):
    """Stations either side of each panel line across the car, so the line is a thin row of its own."""
    ys = [d for d in s.get('doors', ())] + [v for v in (s.get('hood'), s.get('boot')) if v is not None]
    return [y + k * ck.GAP for y in ys for k in (-1, 1)]


def car(X, s, extra_rule=None):
    """All of a car's parts (unjoined), from its spec."""
    L, W = s['L'], s['W']
    r = s.get('r', 0.33)
    paint = s.get('paint', PAINT)
    seams = (SHOULDER,) if s.get('hood') is not None or s.get('boot') is not None else ()
    b = ck.body(L, W, s['top'], s['bottom'], x=X, n=s.get('n', 4.2), end=s.get('end', 0.26), rule=body_rule(s, extra_rule),
                extra=_seam_stations(s), seams_t=seams)
    if s.get('arches', True):
        ck.cut_arches(b, X, W / 2, s['axles'], r + 0.05, r)
    parts = [b]
    c = s.get('cabin')
    if c:
        rule = ck.windows(c['screen'], c['rear'], b_pillars=c.get('b', ()), body=paint, seal=s.get('seal', TRIM))
        extra = [c['screen'], c['rear']] + [v for p in c.get('b', ()) for v in (p - 0.05, p + 0.05)]
        parts.append(ck.cabin(c['y0'], c['y1'], c.get('half', 0.84) * W / 2, c['base'], c['roof'], x=X, lean=c.get('lean', 0.82),
                              corner=c.get('corner', 0.14), extra=extra, rule=rule))
    if s.get('wheels', True):
        parts += ck.wheels(X, W / 2, s['axles'], r, w=s.get('tyre', 0.28), rim=s.get('rim', ck.RIM), dish=s.get('dish', ck.DISH))
    parts += front_and_back(X, s)
    parts += sides(X, s)
    if c:
        parts += wipers_and_aerial(X, c)
    if 'mirror' in s:
        my, mz = s['mirror']
        half = (c.get('half', 0.84) if c else 0.9) * W / 2
        for sx in (-1, 1):
            parts.append(ck.soft((0.13, 0.09, 0.08), (X + sx * (half + 0.04), my, mz), paint))
            parts.append(ck.kit.box((0.02, 0.07, 0.06), (X + sx * (half + 0.105), my + 0.02, mz), GLASS, bevel=0.0))
    return parts


def front_and_back(X, s):
    """Headlights, indicators, grille, bumpers and plates at the front; tail lights, bumper and plate at the back."""
    L, W = s['L'], s['W']
    f, r = -L / 2, L / 2
    zh, zt = s.get('head', 0.6), s.get('tail', 0.66)
    zbf, zbb = s.get('bumpers', (0.36, 0.38))
    paint = s.get('paint', PAINT)
    bumper = s.get('bumper', paint)
    box = ck.kit.box
    p = []
    for sx in (-1, 1):
        # Headlight: a clear lens in a dark housing, with the indicator at its outer end.
        p.append(ck.soft((0.38, 0.15, 0.15), (X + sx * (W / 2 - 0.3), f + 0.11, zh), TRIM))
        p.append(ck.soft((0.32, 0.15, 0.11), (X + sx * (W / 2 - 0.31), f + 0.09, zh + 0.005), LIGHT))
        p.append(box((0.1, 0.1, 0.07), (X + sx * (W / 2 - 0.1), f + 0.15, zh - 0.02), AMBER, bevel=0.02))
        # Tail light: red, with a white reversing lamp on its inner end.
        p.append(ck.soft((0.32, 0.14, 0.13), (X + sx * (W / 2 - 0.27), r - 0.07, zt), TAIL))
        p.append(box((0.09, 0.1, 0.07), (X + sx * (W / 2 - 0.47), r - 0.05, zt), '#f4f6f9', bevel=0.015))
        # Fog lights in the front bumper.
        p.append(box((0.12, 0.05, 0.06), (X + sx * (W / 2 - 0.3), f + 0.02, zbf + 0.005), LIGHT, bevel=0.015))
    grille = s.get('grille', TRIM)
    p.append(ck.soft((W * 0.38, 0.12, 0.13), (X, f + 0.06, zh - 0.06), grille))
    if grille == TRIM:
        for k in range(3):
            p.append(box((W * 0.34, 0.13, 0.016), (X, f + 0.055, zh - 0.1 + k * 0.04), CHROME, bevel=0.0))
    p.append(ck.kit.cylinder(0.05, 0.04, (X, f + 0.005, zh - 0.06), CHROME, verts=12, rot=(math.pi / 2, 0, 0)))
    p.append(ck.soft((W * 0.92, 0.18, 0.12), (X, f + 0.1, zbf), bumper, round_=0.45))
    p.append(box((W * 0.42, 0.05, 0.05), (X, f + 0.02, zbf - 0.025), TRIM, bevel=0.01))
    p.append(ck.soft((W * 0.92, 0.18, 0.12), (X, r - 0.1, zbb), bumper, round_=0.45))
    p.append(ck.kit.cylinder(0.04, 0.14, (X - W / 2 + 0.38, r - 0.02, zbb - 0.07), CHROME, verts=10, rot=(math.pi / 2, 0, 0)))
    if s.get('plates', True):
        for y, z, k in ((f, zbf + 0.02, -1), (r, zbb + 0.1, 1)):
            p.append(box((0.36, 0.04, 0.11), (X, y, z), PLATE, bevel=0.015))
            p.append(box((0.24, 0.01, 0.035), (X, y + k * 0.022, z), '#3a4250', bevel=0.0))
    return p


def sides(X, s):
    """Door handles (near the back of each door), a fuel cap on the right rear quarter, and indicator
    repeaters on the front wings, all sitting on the body's curved skin."""
    L, W, n, end = s['L'], s['W'], s.get('n', 4.2), s.get('end', 0.26)
    box = ck.kit.box
    at = lambda y, up: ck.surface(L, W, s['top'], s['bottom'], y, math.asin(up ** (n / 2)), n, end, x=0.0)  # noqa: E731
    p = []
    doors = s.get('doors', ())
    for i in range(1, len(doors)):
        y = doors[i] - 0.17
        x, z = at(y, 0.5)
        for sx in (-1, 1):
            p.append(box((0.02, 0.2, 0.055), (X + sx * (x + 0.002), y, z), TRIM, bevel=0.0))
            p.append(box((0.035, 0.16, 0.035), (X + sx * (x + 0.016), y, z), CHROME, bevel=0.012))
    if 'fuel' in s:
        y = s['fuel']
        x, z = at(y, 0.55)
        p.append(ck.kit.cylinder(0.075, 0.02, (X + x + 0.003, y, z), ck.SEAM, verts=14, rot=(0, math.pi / 2, 0)))
        p.append(ck.kit.cylinder(0.06, 0.02, (X + x + 0.008, y, z), s.get('paint', PAINT), verts=14, rot=(0, math.pi / 2, 0)))
    if doors:
        y = doors[0] - 0.12
        x, z = at(y, 0.3)
        for sx in (-1, 1):
            p.append(box((0.025, 0.08, 0.035), (X + sx * (x + 0.006), y, z), AMBER, bevel=0.01))
    return p


def wipers_and_aerial(X, c):
    """Two wipers lying at the foot of the windscreen, and a little aerial fin at the back of the roof."""
    p = []
    y = c['y0'] + 0.1
    z = ck.spline(c['roof'], y) + 0.012
    for dx, rot in ((-0.22, 0.12), (0.26, 0.12)):
        p.append(ck.kit.box((0.5, 0.025, 0.018), (X + dx, y, z), TRIM, bevel=0.0, rot=(0.4, 0, rot)))
    yr = c['rear'] - 0.12
    p.append(ck.soft((0.05, 0.16, 0.06), (X, yr, ck.spline(c['roof'], yr) + 0.025), TRIM, round_=0.45))
    return p


def paint_preview(obj, colour):
    """For pictures only: the game's paint colour in place of the magenta marker."""
    col = ck.kit.colour(colour)
    for item in obj.data.color_attributes['Col'].data:
        c = item.color
        if c[0] > 0.9 and c[1] < 0.1 and c[2] > 0.9:
            item.color = col


def tread(X, s, r, w, lugs=10, out=1.0):
    """Chunky tread blocks round big tyres (the monster truck)."""
    p = []
    for y in s['axles']:
        for sx in (-1, 1):
            wx = X + sx * out
            for k in range(lugs):
                a = k * 2 * math.pi / lugs
                p.append(ck.kit.box((w * 0.96, 0.16, 0.09), (wx, y + r * math.sin(a), r + r * math.cos(a)), '#1a1c21', bevel=0.02, rot=(-a, 0, 0)))
    return p
