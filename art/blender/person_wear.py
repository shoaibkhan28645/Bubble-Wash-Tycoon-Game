"""A person's hands, shoes and outfit details (see people.py).

Each maker returns a list of (object, bones): a bone name (or a blend,
{bone: weight}) pins the part; None lets it take the body's weights where
it sits.
"""
from mathutils import Vector

import person_body as pb
from shapes import ball, blob, drape, facing, flare, on_surface, ring, shade, smoothstep

WHITE = '#f6f8fb'
STEEL = '#d5dbe3'
BUBBLE = '#8fe3ff'
WAIST = {'hips': 0.65, 'spine': 0.35}
CHEST = {'chest': 0.7, 'spine': 0.3}
COLLAR = {'chest': 0.8, 'neck': 0.2}


def hands(look):
    """Mitten hands with a thumb: bare, or in rubber gloves with a flared cuff."""
    colour = look['gloves'] or look['skin']
    out = []
    for side, sx in (('left', 1), ('right', -1)):
        hand = f'hand-{side}'
        x = sx * 0.148

        def curl(co):
            # Fingers curl in towards the palm at the bottom.
            co.y -= 0.012 * smoothstep(0.31, 0.27, co.z)
            return co

        size = (0.06, 0.054, 0.08) if look['gloves'] else (0.052, 0.048, 0.07)
        out.append((blob(size, (x, -0.006, 0.315), colour, level_=2, shape=curl), hand))
        out.append((ball(0.016, (x - sx * 0.026, -0.028, 0.326), colour, scale=(0.85, 0.9, 1.35), rot=(0.3, 0, sx * 0.35), segments=12), hand))
        if look['gloves']:
            out.append((flare(0.041, 0.033, 0.383, 0.349, shade(colour, 0.9), centre=(sx * 0.144, -0.002)), hand))
    return out


def feet(body, look):
    """Rubber boots, trainers or smart shoes, on the foot bones."""
    out = []
    style, colour, sole = look['shoes'], look['shoe_colour'], look['sole']
    for side, sx in (('left', 1), ('right', -1)):
        x = sx * pb.LEG_X
        foot = f'foot-{side}'

        def toe(co):
            co.z = 0.01 + (co.z - 0.01) * (1 + 0.12 * smoothstep(-0.02, -0.08, co.y))
            return co

        if style == 'boots':
            out.append((blob((0.078, 0.13, 0.058), (x, -0.026, 0.04), colour, level_=2, shape=toe), foot))
            out.append((blob((0.074, 0.074, 0.066), (x, 0.004, 0.07), colour, level_=2), foot))
            out.append((blob((0.084, 0.136, 0.02), (x, -0.026, 0.01), sole, level_=2), foot))
            w, d, cx, cy = pb.section(body, pb.BOOT_TOP, xmin=min(0, sx), xmax=max(0, sx))
            out.append((ring(w + 0.001, d + 0.001, 0.006, pb.BOOT_TOP, shade(colour, 0.9), centre=(cx, cy), flat=1.8), {f'shin-{side}': 1.0}))
        else:
            smart = style == 'shoes'
            upper = (0.066, 0.122, 0.04) if smart else (0.074, 0.128, 0.048)
            out.append((blob(upper, (x, -0.026, 0.032), colour, level_=2, shape=toe), foot))
            out.append((blob((0.066, 0.068, 0.046), (x, 0.004, 0.06), colour, level_=2), foot))
            out.append((blob((upper[0] + 0.006, upper[1] + 0.006, 0.016 if smart else 0.022), (x, -0.026, 0.009), sole, level_=2), foot))
            if not smart:
                out.append((blob((0.032, 0.04, 0.008), (x, -0.046, 0.056), sole, rot=(0.45, 0, 0), level_=1), foot))
    return out


def extras(body, look):
    """Belt, collar, tie, hood, badge, apron, skirt, and the hero's spray bottle and towel."""
    out = []
    w, d, cx, cy = pb.section(body, pb.WAIST)
    top, trim = look['top_colour'], look['trim'] or look['top_colour']
    if look['bottoms'] == 'skirt':
        out.append((flare(w + 0.006, w + 0.042, pb.WAIST + 0.006, 0.272, look['bottoms_colour'], centre=(cx, cy),
                          squash=(d + 0.03) / (w + 0.04), thickness=0.006, verts=24), {'hips': 1.0}))
    elif look['belt']:
        out.append((ring(w + 0.003, d + 0.003, 0.011, pb.WAIST, look['belt'], centre=(cx, cy), flat=1.3, segments=32), WAIST))
        out.append((blob((0.036, 0.012, 0.028), (0, cy - d - 0.007, pb.WAIST), STEEL, level_=1), WAIST))
    nw, nd, ncx, ncy = pb.section(body, 0.548, xmin=-0.045, xmax=0.045)
    if look['top'] in ('polo', 'shirt'):
        # A collar and its points; a polo's placket with two buttons, or a tie.
        out.append((ring(nw + 0.004, nd + 0.004, 0.0075, 0.546, trim, centre=(ncx, ncy), flat=1.4), COLLAR))
        for sx in (1, -1):
            out.append((blob((0.03, 0.008, 0.024), (sx * 0.018, ncy - nd - 0.006, 0.537), trim, rot=(0.3, 0, sx * 0.55), level_=1), COLLAR))
        at, n = on_surface(body, 0, 0.512, 0.001)
        if look['tie']:
            out.append((blob((0.016, 0.008, 0.02), at + Vector((0, 0, 0.02)), look['tie'], level_=1), CHEST))
            tie = blob((0.022, 0.008, 0.09), (0, at.y, 0.475), look['tie'], level_=1, shape=lambda co: Vector((co.x * (0.6 + 0.4 * smoothstep(0.52, 0.44, co.z)), co.y, co.z)))
            out.append((drape(tie, body, -0.004), CHEST))
        elif look['top'] == 'polo':
            out.append((blob((0.018, 0.006, 0.04), at, shade(top, 0.85), rot=facing(n), level_=1), CHEST))
            for dz in (0.008, -0.01):
                out.append((ball(0.0045, at - n * 0.004 + Vector((0, 0, dz)), WHITE, scale=(1, 0.5, 1), segments=8), CHEST))
    elif look['top'] == 'hoodie':
        _, back_d, _, back_cy = pb.section(body, 0.53, xmin=-0.05, xmax=0.05)
        out.append((blob((0.12, 0.05, 0.07), (0, back_cy + back_d + 0.008, 0.535), shade(top, 0.92), level_=2), COLLAR))
        for sx in (1, -1):
            at, n = on_surface(body, sx * 0.022, 0.5, -0.002)
            out.append((blob((0.006, 0.006, 0.04), at, WHITE, level_=1), CHEST))
    if look['badge']:
        # The car wash's badge: a white disc with an aqua bubble.
        at, n = on_surface(body, 0.05, 0.488, 0.0)
        out.append((ball(0.02, at, WHITE, scale=(1, 0.3, 1), rot=facing(n), segments=16), CHEST))
        out.append((ball(0.009, at - n * 0.004 + Vector((-0.002, 0, 0.001)), BUBBLE, scale=(1, 0.4, 1), rot=facing(n), segments=12), CHEST))
    if look['apron']:
        # The bib is painted on the body (person_body.py); the apron hangs on below it, tied at the waist.
        _, fd, _, fcy = pb.section(body, 0.31, xmin=-0.07, xmax=0.07)
        out.append((blob((0.15, 0.008, 0.1), (0, fcy - fd - 0.008, 0.282), look['apron'], level_=1), {'hips': 1.0}))
        out.append((ring(w + 0.004, d + 0.004, 0.006, pb.WAIST + 0.01, shade(look['apron'], 0.85), centre=(cx, cy), flat=1.2), WAIST))
    if look['gear']:
        # A spray bottle clipped to the left hip, a towel tucked into the right back pocket.
        bx, by = w + 0.008, cy - 0.004
        out.append((blob((0.022, 0.03, 0.044), (bx, by, 0.36), '#3f8ff0', level_=2), WAIST))
        out.append((blob((0.02, 0.026, 0.016), (bx, by, 0.39), WHITE, level_=1), WAIST))
        out.append((blob((0.01, 0.022, 0.01), (bx, by - 0.02, 0.394), WHITE, level_=1), WAIST))
        back = cy + d
        out.append((blob((0.05, 0.012, 0.022), (-0.042, back + 0.004, 0.384), '#ff7fb0', level_=1), WAIST))
        out.append((blob((0.046, 0.01, 0.07), (-0.042, back + 0.008, 0.343), '#ff7fb0', rot=(-0.1, 0, 0), level_=1), WAIST))
        out.append((blob((0.047, 0.011, 0.008), (-0.042, back + 0.012, 0.318), WHITE, rot=(-0.1, 0, 0), level_=1), WAIST))
    return out
