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
"""
import math

import bpy  # noqa: F401,I001
import car_kit as ck
from car_kit import CHROME, GLASS, LIGHT, PAINT, PLATE, TAIL, TRIM, AMBER  # noqa: F401


def body_rule(s, extra=None):
    """Paint, with a dark sill along the bottom of the sides (and `extra(y, t, normal, centre)` first)."""
    paint = s.get('paint', PAINT)
    skirt = s.get('skirt', 0.62)

    def rule(y, t, normal, c):
        if extra:
            col = extra(y, t, normal, c)
            if col:
                return col
        if t >= 0 and math.sin(t) < -skirt:
            return TRIM
        return paint
    return rule


def car(X, s, extra_rule=None):
    """All of a car's parts (unjoined), from its spec."""
    L, W = s['L'], s['W']
    r = s.get('r', 0.33)
    paint = s.get('paint', PAINT)
    b = ck.body(L, W, s['top'], s['bottom'], x=X, n=s.get('n', 4.2), end=s.get('end', 0.26), rule=body_rule(s, extra_rule))
    if s.get('arches', True):
        ck.cut_arches(b, X, W / 2, s['axles'], r + 0.05, r)
    parts = [b]
    c = s.get('cabin')
    if c:
        rule = ck.windows(c['screen'], c['rear'], b_pillars=c.get('b', ()), body=paint)
        extra = [c['screen'], c['rear']] + [v for p in c.get('b', ()) for v in (p - 0.05, p + 0.05)]
        parts.append(ck.cabin(c['y0'], c['y1'], c.get('half', 0.84) * W / 2, c['base'], c['roof'], x=X, lean=c.get('lean', 0.82),
                              corner=c.get('corner', 0.14), extra=extra, rule=rule))
    if s.get('wheels', True):
        parts += ck.wheels(X, W / 2, s['axles'], r, w=s.get('tyre', 0.28), rim=s.get('rim', ck.RIM), dish=s.get('dish', ck.DISH))
    parts += front_and_back(X, s)
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
    bumper = s.get('bumper', TRIM)
    p = []
    for sx in (-1, 1):
        p.append(ck.soft((0.34, 0.16, 0.12), (X + sx * (W / 2 - 0.3), f + 0.09, zh), LIGHT))
        p.append(ck.kit.box((0.12, 0.1, 0.07), (X + sx * (W / 2 - 0.09), f + 0.14, zh - 0.02), AMBER, bevel=0.02))
        p.append(ck.soft((0.3, 0.14, 0.12), (X + sx * (W / 2 - 0.27), r - 0.07, zt), TAIL))
    grille = s.get('grille', TRIM)
    p.append(ck.soft((W * 0.38, 0.12, 0.13), (X, f + 0.06, zh - 0.06), grille))
    if grille == TRIM:
        p.append(ck.kit.box((W * 0.36, 0.13, 0.025), (X, f + 0.05, zh - 0.03), CHROME, bevel=0.0))
    p.append(ck.soft((W * 0.92, 0.18, 0.12), (X, f + 0.1, zbf), bumper, round_=0.45))
    p.append(ck.soft((W * 0.92, 0.18, 0.12), (X, r - 0.1, zbb), bumper, round_=0.45))
    if s.get('plates', True):
        p.append(ck.kit.box((0.36, 0.04, 0.11), (X, f, zbf + 0.02), PLATE, bevel=0.015))
        p.append(ck.kit.box((0.36, 0.04, 0.11), (X, r, zbb + 0.1), PLATE, bevel=0.015))
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
