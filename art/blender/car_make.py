"""Builds one car from a spec (see cars.py): a body lofted through a real
car's cross-section (car_kit.Shape) with wheel arches cut in, a glasshouse,
big wheels flush with the sides, lamps and grille set into the nose and
tail, door handles, mirrors and wipers.

Spec keys (lengths in metres, y along the car with the nose at -L/2):
  L, W            length and width of the body
  top, bottom     (y, z) points of the body's top (bonnet, waist, boot) and bottom lines
  corner, rake    plan-view corner radius and how far the nose and tail lean back (front, back)
  axles, r, tyre  wheel positions along the car, radius and width
  cabin           dict: y0, y1 (foot of windscreen and rear window), roof (y, z) points, base,
                  screen and rear (where the roof starts and ends), b (B pillars), half (half
                  width as a share of the body's), lean, corner
  head, tail      lamp heights
  mirror          y of the wing mirrors (they sit at the foot of the side windows)
  paint           the body colour (PAINT: the game paints it)
  doors           y of the door shut lines (front edge, between doors, back edge); a handle
                  near the back of each door
  hood, boot      y of the bonnet's front edge and the boot lid's back edge
  fuel            y of the fuel cap on the right rear quarter
  seal            the colour of the strip under the side windows (rubber, or chrome)
  bumper          TRIM for black bumper bars (trucks); otherwise bumpers are part of the body
  grille          the grille's colour
  strip           colour of a rubbing strip along the doors (none if missing)
  sunroof         a glass sunroof; flaps: mud flaps behind the wheels and a tow hitch
  bed             a pickup's load bed (no tail-light corners reaching round into it)
"""
import math

import bpy  # noqa: F401,I001
import car_body as cb
import car_kit as ck
from car_kit import AMBER, CHROME, GLASS, LIGHT, PAINT, PLATE, TAIL, TRIM  # noqa: F401

UNDER = '#1b1e23'


def shape(s):
    return cb.Shape(s['L'], s['W'], s['top'], s['bottom'], corner=s.get('corner', (0.34, 0.3)), rake=s.get('rake', (0.12, 0.07)),
                    crown=s.get('crown', 0.035), tumble=s.get('tumble', 0.035))


def body_rule(s, extra=None):
    """Paint, dark underneath and along the rocker, with panel lines: the doors, the bonnet and the
    boot lid (and `extra(y, row, normal, centre)` first)."""
    paint = s.get('paint', PAINT)
    doors = s.get('doors', ())
    c = s.get('cabin') or {}
    near = cb.GAP + 1e-3
    lids = [(s['hood'], c.get('y0')) if s.get('hood') is not None and c else None,
            (c.get('y1'), s['boot']) if s.get('boot') is not None and c else None]

    def rule(y, t, normal, centre):
        row = cb.ROWS.get(t)
        if extra:
            col = extra(y, row, normal, centre)
            if col:
                return col
        if row in ('under', 'rocker'):
            return UNDER if row == 'under' else TRIM
        if row in ('lower-side', 'upper-side') and any(abs(y - d) < near for d in doors):
            return cb.SEAM
        for lid in lids:
            if not lid:
                continue
            lo, hi = min(lid), max(lid)
            edge = lid[0] if lid[0] == s.get('hood') else lid[1]
            if row == 'seam' and lo <= y <= hi:
                return cb.SEAM
            if row in ('seam', 'top', 'crown') and abs(y - edge) < near:
                return cb.SEAM
        return paint
    return rule


def _seam_stations(s):
    """Stations either side of each panel line across the car, so the line is a thin row of its own."""
    ys = list(s.get('doors', ())) + [v for v in (s.get('hood'), s.get('boot')) if v is not None]
    return [y + k * cb.GAP for y in ys for k in (-1, 1)]


def car(X, s, extra_rule=None):
    """All of a car's parts (unjoined), from its spec."""
    W = s['W']
    r = s.get('r', 0.34)
    paint = s.get('paint', PAINT)
    sh = shape(s)
    b = cb.body(sh, x=X, rule=body_rule(s, extra_rule), extra=_seam_stations(s) + list(s.get('stations', ())))
    if s.get('arches', True):
        ck.cut_arches(b, X, W / 2, s['axles'], r + 0.045, r)
    parts = [b]
    c = s.get('cabin')
    if c:
        rule = ck.windows(c['screen'], c['rear'], b_pillars=c.get('b', ()), body=paint, seal=s.get('seal', TRIM))
        extra = [c['screen'], c['rear']] + [v for p in c.get('b', ()) for v in (p - 0.05, p + 0.05)]
        half = c.get('half', 0.86) * W / 2
        parts.append(ck.cabin(c['y0'], c['y1'], half, c['base'], c['roof'], x=X, lean=c.get('lean', 0.84),
                              corner=c.get('corner', 0.07), extra=extra, rule=rule))
        parts += roof_and_glass(X, s, c)
        if 'mirror' in s:
            my = s['mirror']
            for sx in (-1, 1):
                mx = X + sx * (half + 0.06)
                parts.append(ck.soft((0.15, 0.09, 0.1), (mx, my, c['base'] + 0.07), paint, round_=0.35))
                parts.append(ck.kit.box((0.09, 0.035, 0.03), (mx - sx * 0.08, my + 0.01, c['base'] + 0.045), TRIM, bevel=0.0))
                parts.append(ck.kit.box((0.11, 0.015, 0.075), (mx + sx * 0.005, my + 0.046, c['base'] + 0.07), GLASS, bevel=0.0))
    if s.get('wheels', True):
        parts += ck.wheels(X, W / 2, s['axles'], r, w=s.get('tyre', 0.27), inset=0.14, rim=s.get('rim', ck.RIM), dish=s.get('dish', ck.DISH))
    parts += nose_and_tail(X, s, sh)
    parts += sides(X, s, sh)
    return parts


def _on_face(sh, z, front, sink=0.012):
    """Where a part set into the nose (or tail) goes along the car at height z, and its tilt."""
    y = sh.face(z, front)
    lean = sh.rake[0] if front else -sh.rake[1]
    end = -sh.L / 2 if front else sh.L / 2
    h = ck.spline(sh.top, end) - ck.spline(sh.bottom, end)
    return y + (sink if front else -sink), -math.atan2(lean, h)


def nose_and_tail(X, s, sh):
    """Lamps, grille, badge, air intake, fog lights and number plates set into the nose and tail."""
    box, soft = ck.kit.box, ck.soft
    p = []
    zh, zt = s.get('head', 0.62), s.get('tail', 0.7)
    hw_f = sh.half(-sh.L / 2 + 0.004)
    hw_r = sh.half(sh.L / 2 - 0.004)
    zb_f = ck.spline(sh.bottom, -sh.L / 2)
    zb_r = ck.spline(sh.bottom, sh.L / 2)
    # Headlights: a clear lens in a dark surround, reaching round into the corner; the indicator outside.
    y, tilt = _on_face(sh, zh, True)
    lamp = min(0.4, hw_f - 0.22)
    for sx in (-1, 1):
        cx = X + sx * (hw_f - lamp / 2 + 0.05)
        p.append(soft((lamp + 0.04, 0.05, 0.15), (cx, y + 0.004, zh), TRIM, rot=(tilt, 0, 0), round_=0.3))
        p.append(soft((lamp - 0.03, 0.05, 0.1), (cx - sx * 0.02, y - 0.006, zh + 0.005), LIGHT, rot=(tilt, 0, 0), round_=0.3))
        # Two projector lenses, chrome-ringed, in each lamp.
        for k in (-1, 1):
            lx = cx - sx * 0.02 + k * lamp * 0.22
            p.append(ck.kit.cylinder(0.038, 0.02, (lx, y - 0.03, zh + 0.005), CHROME, verts=12, rot=(math.pi / 2 + tilt, 0, 0)))
            p.append(ck.kit.cylinder(0.024, 0.02, (lx, y - 0.036, zh + 0.005), LIGHT, verts=12, rot=(math.pi / 2 + tilt, 0, 0)))
        p.append(box((0.08, 0.05, 0.06), (X + sx * (hw_f + 0.04), y + 0.06, zh - 0.01), AMBER, bevel=0.012, rot=(tilt, 0, sx * 0.9)))
    # The grille between them, framed in chrome, with the badge.
    gw = 2 * (hw_f - lamp) - 0.02
    gz = zh - 0.03
    y, tilt = _on_face(sh, gz, True)
    grille = s.get('grille', TRIM)
    p.append(soft((gw + 0.04, 0.04, 0.17), (X, y + 0.006, gz), CHROME, rot=(tilt, 0, 0), round_=0.3))
    p.append(soft((gw, 0.04, 0.13), (X, y - 0.004, gz), grille, rot=(tilt, 0, 0), round_=0.3))
    if grille == TRIM:
        for k in range(3):
            p.append(box((gw - 0.03, 0.03, 0.014), (X, y - 0.016, gz - 0.04 + k * 0.04), '#3d434d', bevel=0.0, rot=(tilt, 0, 0)))
    p.append(ck.kit.cylinder(0.045, 0.03, (X, y - 0.025, gz), CHROME, verts=14, rot=(math.pi / 2 + tilt, 0, 0)))
    # Lower air intake with fog lights, and the plate above it.
    iz = zb_f + 0.1
    y, tilt = _on_face(sh, iz, True, sink=0.008)
    p.append(soft((2 * hw_f - 0.2, 0.04, 0.09), (X, y, iz), UNDER, rot=(tilt, 0, 0), round_=0.4))
    for sx in (-1, 1):
        p.append(box((0.11, 0.04, 0.05), (X + sx * (hw_f - 0.22), y - 0.012, iz), LIGHT, bevel=0.012, rot=(tilt, 0, 0)))
    if s.get('plates', True):
        pz = (iz + gz) / 2 - 0.01
        y, tilt = _on_face(sh, pz, True, sink=0.0)
        p.append(box((0.34, 0.03, 0.1), (X, y - 0.008, pz), PLATE, bevel=0.012, rot=(tilt, 0, 0)))
        p.append(box((0.22, 0.01, 0.03), (X, y - 0.024, pz), '#3a4250', bevel=0.0, rot=(tilt, 0, 0)))
    # Tail lights (with white reversing lamps), plate and exhaust.
    y, tilt = _on_face(sh, zt, False)
    for sx in (-1, 1):
        cx = X + sx * (hw_r - 0.15)
        p.append(soft((0.4, 0.05, 0.17), (cx, y - 0.012, zt), TRIM, rot=(tilt, 0, 0), round_=0.3))
        p.append(soft((0.34, 0.05, 0.12), (cx, y + 0.0, zt), TAIL, rot=(tilt, 0, 0), round_=0.3))
        p.append(box((0.09, 0.05, 0.06), (cx - sx * 0.12, y + 0.008, zt - 0.01), '#f4f6f9', bevel=0.012, rot=(tilt, 0, 0)))
        if not s.get('bed'):
            p.append(box((0.07, 0.05, 0.12), (X + sx * (hw_r + 0.05), y - 0.05, zt), '#a8161f', bevel=0.012, rot=(tilt, 0, sx * -0.9)))
    if s.get('plates', True):
        pz = zt - 0.17
        y, tilt = _on_face(sh, pz, False, sink=0.0)
        p.append(box((0.34, 0.03, 0.1), (X, y + 0.008, pz), PLATE, bevel=0.012, rot=(tilt, 0, 0)))
        p.append(box((0.22, 0.01, 0.03), (X, y + 0.024, pz), '#3a4250', bevel=0.0, rot=(tilt, 0, 0)))
    p.append(ck.kit.cylinder(0.04, 0.14, (X - hw_r + 0.25, sh.L / 2 - 0.02, zb_r + 0.02), CHROME, verts=10, rot=(math.pi / 2, 0, 0)))
    # Black bumper bars on trucks.
    if s.get('bumper') == TRIM:
        for front in (True, False):
            z = (zb_f if front else zb_r) + 0.1
            y, _ = _on_face(sh, z, front, sink=-0.03)
            hw = hw_f if front else hw_r
            p.append(soft((2 * hw + 0.12, 0.12, 0.14), (X, y, z), TRIM, round_=0.35))
    return p


def sides(X, s, sh):
    """Door handles (near the back of each door), a fuel cap on the right rear quarter, and indicator
    repeaters on the front wings, all on the body's side."""
    box = ck.kit.box
    p = []
    doors = s.get('doors', ())
    for i in range(1, len(doors)):
        y = doors[i] - 0.17
        x, z = sh.side(y, 0.78)
        for sx in (-1, 1):
            p.append(box((0.02, 0.19, 0.05), (X + sx * (x + 0.002), y, z), TRIM, bevel=0.0))
            p.append(box((0.03, 0.15, 0.032), (X + sx * (x + 0.014), y, z), CHROME, bevel=0.01))
    if 'fuel' in s:
        y = s['fuel']
        x, z = sh.side(y, 0.85)
        p.append(ck.kit.cylinder(0.075, 0.02, (X + x + 0.002, y, z), cb.SEAM, verts=14, rot=(0, math.pi / 2, 0)))
        p.append(ck.kit.cylinder(0.062, 0.02, (X + x + 0.007, y, z), s.get('paint', PAINT), verts=14, rot=(0, math.pi / 2, 0)))
    if doors:
        y = doors[0] - 0.14
        x, z = sh.side(y, 0.75)
        for sx in (-1, 1):
            p.append(box((0.02, 0.08, 0.03), (X + sx * (x + 0.006), y, z), AMBER, bevel=0.008))
    if doors and s.get('strip'):
        y0, y1 = doors[0] + 0.04, doors[-1] - 0.04
        x, z = sh.side((y0 + y1) / 2, 0.42)
        for sx in (-1, 1):
            p.append(box((0.025, y1 - y0, 0.04), (X + sx * (x + 0.006), (y0 + y1) / 2, z), s['strip'], bevel=0.008))
    if s.get('flaps'):
        r = s.get('r', 0.34)
        for y in s['axles']:
            for sx in (-1, 1):
                p.append(box((0.24, 0.02, 0.2), (X + sx * (s['W'] / 2 - 0.14), y + r + 0.05, 0.2), TRIM, bevel=0.0))
        p.append(box((0.08, 0.16, 0.08), (X, sh.L / 2 + 0.05, ck.spline(sh.bottom, sh.L / 2) - 0.02), CHROME, bevel=0.015))
    return p


def roof_and_glass(X, s, c):
    """Two wipers lying at the foot of the windscreen, an aerial fin and a third brake light at the back
    of the roof, and a sunroof if the car has one."""
    p = []
    y = c['y0'] + 0.1
    z = ck.spline(c['roof'], y) + 0.012
    for dx in (-0.22, 0.26):
        p.append(ck.kit.box((0.5, 0.025, 0.018), (X + dx, y, z), TRIM, bevel=0.0, rot=(0.4, 0, 0.12)))
    yr = c['rear'] - 0.12
    p.append(ck.soft((0.05, 0.16, 0.06), (X, yr, ck.spline(c['roof'], yr) + 0.025), TRIM, round_=0.45))
    yb = c['rear'] - 0.02
    p.append(ck.kit.box((0.32, 0.03, 0.03), (X, yb, ck.spline(c['roof'], yb) + 0.014), TAIL, bevel=0.008))
    if s.get('sunroof'):
        y0, y1 = c['screen'] + 0.12, c['screen'] + 0.62
        z = max(ck.spline(c['roof'], y0), ck.spline(c['roof'], y1)) + 0.02
        p.append(ck.kit.box((0.62, y1 - y0 + 0.04, 0.012), (X, (y0 + y1) / 2, z - 0.002), TRIM, bevel=0.0))
        p.append(ck.kit.box((0.58, y1 - y0, 0.012), (X, (y0 + y1) / 2, z + 0.002), GLASS, bevel=0.0))
    return p


def paint_preview(obj, colour):
    """For pictures only: the game's paint colour in place of the magenta marker."""
    col = ck.kit.colour(colour)
    for item in obj.data.color_attributes['Col'].data:
        c = item.color
        if c[0] > 0.9 and c[1] < 0.1 and c[2] > 0.9:
            item.color = col
