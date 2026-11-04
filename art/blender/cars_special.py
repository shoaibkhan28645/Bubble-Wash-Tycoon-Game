"""The Car of the Day specials, in their own fixed colours (see cars.py):
a taxi with a checker band and roof sign, a police car with white doors and
a light bar, and three vans (ambulance, fire truck, ice-cream van): a
rounded cab with a box body behind it.
"""
import math

import car_kit as ck
import car_make as cm
import kit
from car_kit import CHROME, LIGHT, TRIM

YELLOW = '#ffc61a'
WHITE = '#f4f6f9'
RED = '#e23a3a'
FIRE = '#e0262e'
PASTEL = '#ffb3d9'


def build(sedan, finish, X):
    """Adds the five specials, side by side from X."""
    def checker(y, row, normal, c):
        if row == 'upper-side' and -1.3 < y < 1.3:
            return '#1d2026' if int((y + 3) / 0.17) % 2 else '#ffffff'
        return None
    p = sedan(X, paint=YELLOW, rule=checker)
    p.append(ck.soft((0.72, 0.3, 0.2), (X, 0.3, 1.46), '#fffbe8', round_=0.3))
    p.append(ck.soft((0.64, 0.32, 0.05), (X, 0.3, 1.38), TRIM))
    finish(p, 'taxi', X)

    X += 4

    def doors(y, row, normal, c):
        return WHITE if row in ('lower-side', 'upper-side', 'sill') and -0.76 < y < 0.74 else None
    p = sedan(X, paint='#22262d', rule=doors)
    p.append(ck.soft((0.92, 0.28, 0.1), (X, 0.3, 1.4), TRIM))
    for dx, col in ((-0.25, '#ff2e4c'), (0.25, '#2e7dff')):
        p.append(ck.soft((0.38, 0.24, 0.13), (X + dx, 0.3, 1.49), col, round_=0.35))
    p.append(ck.soft((1.1, 0.12, 0.26), (X, -1.9, 0.44), TRIM))
    finish(p, 'police', X)

    X += 4
    p = van(X, WHITE, L=3.72, W=1.8, box=(-0.42, 1.86, 2.1))
    for sx in (-1, 1):
        side = X + sx * 0.93
        p.append(kit.box((0.02, 2.2, 0.16), (side, 0.72, 1.06), RED, bevel=0.0))
        p.append(kit.box((0.02, 0.62, 0.18), (side, 0.85, 1.55), RED, bevel=0.0))
        p.append(kit.box((0.02, 0.18, 0.62), (side, 0.85, 1.55), RED, bevel=0.0))
    light_bar(p, X, -0.42, 2.16, ('#ff2e4c', '#2e7dff'))
    p.append(kit.box((0.04, 0.03, 1.1), (X, 1.88, 1.45), TRIM, bevel=0.0))
    finish(p, 'ambulance', X)

    X += 4.5
    p = van(X, FIRE, L=4.2, W=1.86, box=(-0.95, 2.08, 2.0), r=0.42, axles=(-1.45, 1.35), cab=(-1.98, -0.98))
    for sx in (-1, 1):
        side = X + sx * 0.95
        for i in range(3):
            p.append(kit.box((0.02, 0.86, 0.85), (side, -0.4 + i * 0.95, 1.42), '#c41f26', bevel=0.0))
            p.append(kit.box((0.03, 0.4, 0.05), (side + sx * 0.01, -0.4 + i * 0.95, 1.36), CHROME, bevel=0.0))
        p.append(kit.box((0.025, 3.0, 0.08), (side, 0.56, 0.98), CHROME, bevel=0.0))
    for sx in (-1, 1):
        p.append(ck.soft((0.06, 2.9, 0.06), (X + sx * 0.32, 0.6, 2.12), CHROME))
    for i in range(10):
        p.append(kit.box((0.64, 0.05, 0.05), (X, -0.75 + i * 0.3, 2.12), CHROME, bevel=0.0))
    light_bar(p, X, -1.5, 1.92, ('#ff2e4c', '#ff2e4c', '#ff2e4c'))
    finish(p, 'firetruck', X)

    X += 4.5
    p = van(X, PASTEL, L=3.6, W=1.78, box=(-0.3, 1.8, 2.05))
    for sx in (-1, 1):
        # Serving window with a striped awning, and a ripple of chocolate along the bottom.
        side = X + sx * 0.92
        p.append(kit.box((0.02, 1.1, 0.6), (side, 0.72, 1.45), '#cfeeff', bevel=0.0))
        p.append(kit.box((0.03, 1.2, 0.06), (side, 0.72, 1.13), WHITE, bevel=0.0))
        for i in range(6):
            p.append(kit.box((0.36, 0.2, 0.04), (X + sx * 1.07, 0.22 + i * 0.2, 1.84), 'white' if i % 2 else '#ff5fa8', bevel=0.0, rot=(0, sx * 0.4, 0)))
        for i in range(11):
            p.append(kit.sphere(0.1, (side - sx * 0.01, -0.2 + i * 0.19, 0.95), '#7a4a2e', segments=8))
    p.append(kit.cone(0.3, 0.05, 0.7, (X, 0.75, 2.4), '#e8b26a', verts=14, rot=(math.pi, 0, 0)))
    p.append(kit.sphere(0.36, (X, 0.75, 2.85), '#fff3f8', segments=14))
    p.append(kit.sphere(0.25, (X, 0.75, 3.15), '#ff8fc8', segments=12))
    p.append(kit.sphere(0.07, (X, 0.71, 3.4), RED, segments=8))
    finish(p, 'icecream', X)


def van(X, paint, L, W, box, r=0.36, axles=(-1.2, 1.2), cab=(-1.12, -0.4)):
    """A rounded cab with a glasshouse, and a tall box body from box[0] to box[1] (top at box[2])."""
    y0, y1 = cab
    s = dict(
        L=L, W=W, r=r, axles=axles, paint=paint, corner=(0.32, 0.12), rake=(0.12, 0.0),
        top=[(-L / 2, 0.72), (-L / 2 + 0.3, 0.86), (y0 + 0.2, 0.96), (y1, 1.0), (L / 2, 1.0)],
        bottom=[(-L / 2, 0.34), (-L / 2 + 0.3, 0.28), (L / 2 - 0.3, 0.28), (L / 2, 0.34)],
        cabin=dict(y0=y0 + 0.08, y1=y1 + 0.1, base=0.96, screen=y0 + 0.42, rear=y1, half=0.88,
                   roof=[(y0 + 0.08, 0.96), (y0 + 0.42, 1.58), (y0 + 0.6, 1.62), (y1 + 0.1, 1.64)]),
        head=0.7, tail=0.78, mirror=y0 + 0.36, bumper=TRIM, hood=-L / 2 + 0.32,
    )
    door = axles[0] + r + 0.08
    if y1 - door > 0.3:
        s['doors'] = (door, y1)
    p = cm.car(X, s)
    b0, b1, top = box
    p.append(ck.soft((W + 0.04, b1 - b0, top - 0.86), (X, (b0 + b1) / 2, (top + 0.86) / 2), paint, round_=0.08))
    return p


def light_bar(p, X, y, z, colours):
    p.append(ck.soft((1.2, 0.22, 0.1), (X, y, z), TRIM))
    n = len(colours)
    for i, col in enumerate(colours):
        dx = (i - (n - 1) / 2) * 0.36
        p.append(ck.soft((0.32, 0.2, 0.12), (X + dx, y, z + 0.08), col, round_=0.35))
