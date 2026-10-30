"""A person's head (see people.py): the face, a hairstyle, and maybe a
beard, glasses or a cap, all pinned to the head bone.

Hair is a shell over the skull, cut along a smooth tilted hairline, plus
the pieces of each style (a quiff, a fringe or bangs, a bob's sides, long
hair down the back, a ponytail, a bun, curls).
"""
import math

import bpy  # noqa: I001
from mathutils import Vector

import kit
import person_body as pb
from shapes import arc, ball, bake, blob, copy_of, cut, down_onto, drape, facing, mix, on_surface, shade, smoothstep

HZ = pb.HZ
EYE = '#1d2027'
WHITE = '#f6f8fb'


def head(look):
    a, b, c = pb.HEAD
    skin = look['skin']

    def jaw(co):
        # Full cheeks, a soft jaw, a flatter back of the head.
        low = smoothstep(HZ + 0.01, HZ - 0.08, co.z)
        co.x *= 1 + 0.07 * low
        if co.y > 0:
            co.y *= 0.9
        return co

    skull = blob((2 * a, 2 * b, 2 * c), (0, 0, HZ), skin, level_=3, shape=jaw)
    parts = [skull]
    brows = shade(look['hair_colour'], 0.8)
    for sx in (1, -1):
        eye, n = on_surface(skull, sx * 0.031, HZ + 0.004, 0.003)
        parts.append(ball(0.0115, eye, EYE, scale=(1, 0.55, 1.45), rot=facing(n), segments=12))
        parts.append(ball(0.0042, eye - n * 0.007 + Vector((-sx * 0.003, 0, 0.007)), WHITE, segments=8))
        if look['lashes']:
            parts.append(blob((0.012, 0.004, 0.0045), eye - n * 0.003 + Vector((sx * 0.011, 0, 0.014)), EYE, rot=(0, -sx * 0.6, 0), level_=1))
        at, n = on_surface(skull, sx * 0.034, HZ + 0.038, -0.001)
        parts.append(blob((0.028, 0.009, 0.0085), at, brows, rot=(0, sx * 0.12, 0), level_=1))
        at, n = on_surface(skull, sx * 0.054, HZ - 0.03, 0.003)
        parts.append(ball(0.013, at, mix(skin, '#ff6f7a', 0.45), scale=(1, 0.4, 0.72), rot=facing(n), segments=12))
        parts.append(ball(0.02, (sx * 0.09, 0.006, HZ - 0.02), skin, scale=(0.5, 0.8, 1.15), segments=12))
        parts.append(ball(0.007, (sx * 0.097, 0.004, HZ - 0.02), shade(skin, 0.88), scale=(0.5, 0.8, 1.3), segments=8))
    at, n = on_surface(skull, 0, HZ - 0.016, 0.006)
    parts.append(ball(0.016, at, shade(skin, 0.9), scale=(1, 0.95, 0.9), segments=12))
    face = skull
    if look['beard']:
        face = beard(skull, look)
        parts.append(face)
    at, n = on_surface(face, 0, HZ - 0.06, 0.0)
    mouth = '#b8404f' if look['lashes'] else '#6e2230'
    grin = arc(0.021, 0.0045, (0, at.y, HZ - 0.04), mouth, -math.pi + 0.5, -0.5)
    parts.append(drape(grin, face, -0.0015))
    parts += hair(skull, look)
    if look['glasses']:
        parts += glasses(skull, look['glasses'])
    if look['cap']:
        parts += cap(skull, look['cap'])
    return [(p, 'head') for p in parts]


def shell(skull, colour, front, back, grow=(1.13, 1.12, 1.06), quiff=0.0, thickness=0.012):
    """Hair hugging the skull above a hairline: `front` high over the forehead, `back` low at the nape."""
    hair = copy_of(skull)
    for v in hair.data.vertices:
        co = Vector((v.co.x * grow[0], v.co.y * grow[1] + 0.006, HZ + (v.co.z - HZ) * grow[2] + 0.008))
        if quiff:
            # The quiff: the hair over the front of the crown swells up and forward, off-centre.
            up = smoothstep(HZ + 0.02, HZ + 0.09, co.z) * math.exp(-(((co.x - 0.014) / 0.085) ** 2 + ((co.y + 0.05) / 0.075) ** 2))
            co += Vector((0, -0.016 * up, 0.024 * up)) * quiff
        v.co = co
    p, q = Vector((0, -0.1, front)), Vector((0, 0.1, back))
    normal = Vector((0, -(p.z - q.z), p.y - q.y)).normalized()
    cut(hair, p, normal if normal.z > 0 else -normal)
    bake(hair, ('SOLIDIFY', {'thickness': thickness, 'offset': -1}))
    kit._paint(hair, colour)
    return hair


def hair(skull, look):
    style, colour = look['hair'], look['hair_colour']
    if style == 'none':
        return []
    if style == 'bald':
        # Just a ring of short hair round the back and sides.
        ring_ = shell(skull, colour, HZ + 0.02, HZ - 0.045, grow=(1.06, 1.06, 1.03), thickness=0.006)
        return [cut(ring_, Vector((0, 0, HZ + 0.02)), Vector((0, 0, -1)))]
    if style == 'buzz':
        parts = [shell(skull, colour, HZ + 0.048, HZ - 0.05, grow=(1.05, 1.05, 1.03), thickness=0.006)]
    elif style in ('bob', 'long'):
        parts = [shell(skull, colour, HZ + 0.046, HZ - 0.08, grow=(1.14, 1.13, 1.07))]
        for sx in (1, -1):
            parts.append(blob((0.03, 0.1, 0.12), (sx * 0.092, 0.008, HZ - 0.022), colour, level_=2))
        parts.append(blob((0.17, 0.06, 0.1), (0, 0.062, HZ - 0.035), colour, level_=2))
        if style == 'long':
            def taper(co):
                return Vector((co.x * (0.85 + 0.15 * smoothstep(HZ - 0.2, HZ - 0.06, co.z)), co.y, co.z))
            parts.append(blob((0.16, 0.05, 0.2), (0, 0.072, HZ - 0.11), colour, rot=(0.12, 0, 0), level_=2, shape=taper))
    else:
        quiff = 1.0 if style == 'quiff' else 0.0
        grow = (1.18, 1.16, 1.1) if style == 'curly' else (1.13, 1.12, 1.06)
        parts = [shell(skull, colour, HZ + 0.05, HZ - 0.045, grow=grow, quiff=quiff)]
        if style == 'curly':
            for x, y in ((-0.05, -0.05), (0.0, -0.06), (0.05, -0.05), (-0.065, 0.0), (0.0, -0.005), (0.065, 0.0), (-0.04, 0.05), (0.04, 0.05)):
                parts.append(ball(0.03, down_onto(parts[0], x, y) - Vector((0, 0, 0.012)), shade(colour, 1.08 if (x + y) > 0 else 1.0), segments=10))
        elif style == 'ponytail':
            parts.append(ball(0.016, (0, 0.1, HZ + 0.004), look['accent'] or colour, segments=10))
            parts.append(blob((0.046, 0.042, 0.12), (0, 0.112, HZ - 0.06), colour, rot=(-0.25, 0, 0), level_=2))
        elif style == 'bun':
            parts.append(ball(0.042, (0, 0.034, HZ + 0.104), colour, segments=14))
    fringe = look['fringe']
    if fringe == 'side':
        part = blob((0.13, 0.026, 0.04), (0.004, -0.1, HZ + 0.054), colour, rot=(0, -0.3, 0), level_=2)
        parts.append(drape(part, parts[0], -0.002))
    elif fringe == 'bangs':
        part = blob((0.15, 0.024, 0.036), (0, -0.1, HZ + 0.052), colour, level_=2)
        parts.append(drape(part, parts[0], -0.002))
    return parts


def beard(skull, look):
    """A short full beard round the jaw, and a moustache over the smile."""
    colour = shade(look['hair_colour'], 0.95)
    hair = copy_of(skull)
    for v in hair.data.vertices:
        v.co = Vector((v.co.x * 1.07, v.co.y * 1.08 - 0.002, HZ + (v.co.z - HZ) * 1.04 - 0.002))
    cut(hair, Vector((0, 0, HZ - 0.022)), Vector((0, 0, -1)))
    cut(hair, Vector((0, 0.03, 0)), Vector((0, -1, 0)))
    bake(hair, ('SOLIDIFY', {'thickness': 0.008, 'offset': -1}))
    kit._paint(hair, colour)
    at, n = on_surface(skull, 0, HZ - 0.03, -0.004)
    tache = blob((0.044, 0.014, 0.013), at, colour, level_=2)
    return kit.join([hair, tache], 'beard')


def glasses(skull, colour):
    parts = []
    for sx in (1, -1):
        at, n = on_surface(skull, sx * 0.032, HZ + 0.006, -0.011)
        bpy.ops.mesh.primitive_torus_add(major_radius=0.018, minor_radius=0.003, major_segments=16, minor_segments=5, location=at, rotation=(math.pi / 2, 0, 0))
        rim = bpy.context.object
        bake(rim)
        kit._paint(rim, colour)
        parts.append(rim)
        parts.append(blob((0.004, 0.085, 0.004), (sx * 0.086, at.y + 0.045, HZ + 0.012), colour, level_=1))
    at, n = on_surface(skull, 0, HZ + 0.01, -0.012)
    parts.append(blob((0.03, 0.004, 0.004), at, colour, level_=1))
    return parts


def cap(skull, colour):
    """A baseball cap: a crown over the top of the head and a brim at the front."""
    crown = copy_of(skull)
    for v in crown.data.vertices:
        v.co = Vector((v.co.x * 1.16, v.co.y * 1.15 + 0.004, HZ + (v.co.z - HZ) * 1.08 + 0.012))
    p, q = Vector((0, -0.1, HZ + 0.03)), Vector((0, 0.1, HZ + 0.005))
    normal = Vector((0, -(p.z - q.z), p.y - q.y)).normalized()
    cut(crown, p, normal if normal.z > 0 else -normal)
    bake(crown, ('SOLIDIFY', {'thickness': 0.006, 'offset': -1}))
    kit._paint(crown, colour)
    back, length = -0.07, 0.085

    def peak(co):
        f = smoothstep(back, back - length, co.y)
        co.x *= 1 - 0.3 * f * f
        co.z -= 0.012 * (co.x / 0.09) ** 2 + 0.006 * f
        return co

    brim = blob((0.17, length, 0.012), (0, back - length / 2, HZ + 0.034), shade(colour, 0.85), rot=(0.12, 0, 0), level_=2, shape=peak)
    top = ball(0.009, (0, 0.004, HZ + 0.118), shade(colour, 0.85), scale=(1, 1, 0.6), segments=8)
    return [crown, brim, top]

