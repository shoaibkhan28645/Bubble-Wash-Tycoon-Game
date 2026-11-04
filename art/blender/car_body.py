"""The car's body (see car_make.py): a real car's cross-section lofted
along it, and where things sit on it (the sides, the nose and the tail).
"""
import math

from car_kit import PAINT, _loft, spline, stations

SEAM = '#262a31'
#: Half the width of a panel line, in metres along the car.
GAP = 0.016

#: The body's cross-section, from the middle underneath round the right side to the middle on top
#: (the left side mirrors it). A face's `t` is the index of the point it starts from plus a half.
SECTION = ('under', 'under-edge', 'rocker', 'sill', 'waist', 'upper', 'shoulder', 'shoulder-2', 'edge', 'seam', 'top', 'crown')
ROWS = {i + 0.5: name for i, name in enumerate(('under', 'rocker', 'sill', 'lower-side', 'upper-side', 'shoulder', 'shoulder',
                                                 'shoulder', 'seam', 'top', 'crown'))}


class Shape:
    """A car body: straight sides with a crease at the waist, a rounded shoulder into a gently crowned
    bonnet, roof-line and boot, a flat sill, square ends with rounded corners (in plan) and a nose and
    tail that lean back. `top` and `bottom` are (y, z) points along it, nose at -L/2."""

    def __init__(self, L, W, top, bottom, corner=(0.34, 0.3), rake=(0.12, 0.07), crown=0.035, tumble=0.035, taper=0.97):
        self.L, self.W, self.top, self.bottom = L, W, top, bottom
        self.corner, self.rake, self.crown, self.tumble, self.taper = corner, rake, crown, tumble, taper

    def half(self, y):
        """Half the body's width at y: full width along the sides, rounding off at the corners."""
        L, W = self.L, self.W
        a = W / 2 * (1 - (1 - self.taper) * (abs(y) / (L / 2)) ** 2)
        for d, R in ((y + L / 2, self.corner[0]), (L / 2 - y, self.corner[1])):
            if d < R:
                a -= R - math.sqrt(max(0.0, R * R - (R - d) ** 2))
        return a

    def section(self, y):
        """The right half of the cross-section at y: (x, z, lean back) for each of SECTION."""
        a = self.half(y)
        zb, zt = spline(self.bottom, y), spline(self.top, y)
        h = zt - zb
        k = 1 - self.tumble
        pts = [(0.0, zb), (a * 0.86, zb), (a * 0.965, zb + 0.05), (a * 0.99, zb + min(0.16, 0.3 * h)), (a, zb + 0.55 * h),
               (a * (1 - self.tumble * 0.5), zt - 0.07), (a * (1 - self.tumble * 0.8), zt - 0.035), (a * k - 0.015, zt - 0.01),
               (a * k - 0.04, zt), (a * k - 0.075, zt + 0.003), (a * 0.45, zt + self.crown * 0.75), (0.0, zt + self.crown)]
        # The nose and tail lean back towards the top.
        lean = 0.0
        df, dr = y + self.L / 2, self.L / 2 - y
        if df < self.corner[0]:
            lean = self.rake[0] * (1 - df / self.corner[0])
        elif dr < self.corner[1]:
            lean = -self.rake[1] * (1 - dr / self.corner[1])
        return [(px, pz, lean * (pz - zb) / max(h, 1e-3)) for px, pz in pts]

    def side(self, y, frac):
        """A point on the right side at y, `frac` of the way up from the sill to the shoulder."""
        pts = self.section(y)
        lo, hi = pts[3], pts[6]
        return lo[0] + (hi[0] - lo[0]) * frac, lo[1] + (hi[1] - lo[1]) * frac

    def face(self, z, front=True):
        """How far along the car the nose (or the tail) is at height z."""
        y = -self.L / 2 if front else self.L / 2
        zb, zt = spline(self.bottom, y), spline(self.top, y)
        lean = self.rake[0] if front else -self.rake[1]
        return y + lean * (z - zb) / max(zt - zb, 1e-3)


def body(shape, x=0.0, rule=None, count=22, extra=()):
    """The car's lower body, lofted through `shape`'s cross-sections."""
    L = shape.L
    ys = stations(-L / 2, L / 2, count, extra)
    ys[0] += 0.002
    ys[-1] -= 0.002
    rings = []
    for y in ys:
        right = shape.section(y)
        pts = [(x + px, pz, i, dy) for i, (px, pz, dy) in enumerate(right)]
        pts += [(x - px, pz, i, dy) for i, (px, pz, dy) in list(reversed(list(enumerate(right))))[1:-1]]
        rings.append(pts)
    return _loft(rings, ys, 'body', rule or (lambda *a: PAINT))
