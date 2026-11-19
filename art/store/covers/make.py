# Makes the store covers at the exact sizes Playgama asks for, from the generated art in source/.
#   python3 art/store/covers/make.py
# square 800x800, portrait 1080x1920, landscape 1920x1080 (and the icon at 512 for other stores).
# The portrait art is 2:3: a sliver is trimmed off each side (clear of the title and the plane) and the
# sky is extended upwards to reach 9:16.
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

HERE = Path(__file__).parent
SRC = HERE / 'source'


def save(img: Image.Image, name: str) -> None:
    img.convert('RGB').save(HERE / name, quality=94, optimize=True)
    print(name, img.size)


# Square cover and icon.
save(Image.open(SRC / 'square.png').resize((800, 800), Image.LANCZOS), 'square-800x800.jpg')
save(Image.open(SRC / 'icon.png').resize((512, 512), Image.LANCZOS), 'icon-512x512.jpg')
# Playgama's square slot is the game's icon: the hero's face reads best there.
save(Image.open(SRC / 'icon.png').resize((800, 800), Image.LANCZOS), 'icon-800x800.jpg')

# Landscape: already 16:9.
save(Image.open(SRC / 'landscape.png').resize((1920, 1080), Image.LANCZOS), 'landscape-1920x1080.jpg')

# Portrait: trim the sides, scale to 1080 wide, extend the sky above.
art = Image.open(SRC / 'portrait.png').convert('RGB')
art = art.crop((40, 0, art.width - 36, art.height))
scaled = art.resize((1080, round(art.height * 1080 / art.width)), Image.LANCZOS)
extra = 1920 - scaled.height
a = np.asarray(scaled).astype(np.float32)
# The sky's colour along the top edge, column by column, fading upwards into an even deeper blue,
# so the sun's glow in the corner dies away rather than running up as a stripe.
edge = a[:24].mean(axis=0)
deep = np.median(a[:24].reshape(-1, 3), axis=0) * np.array([0.92, 0.95, 1.0])
t = np.linspace(1, 0, extra)[:, None, None] ** 1.6  # 1 at the very top, 0 at the seam
sky = edge[None] * (1 - t) + deep[None, None] * t
sky_img = Image.fromarray(np.clip(sky, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))
canvas = Image.new('RGB', (1080, 1920))
canvas.paste(sky_img, (0, 0))
canvas.paste(scaled, (0, extra))
# A soft seam: the first rows of the art fade in over the extended sky.
seam = 28
top = np.asarray(canvas).astype(np.float32)
blend = top[extra - seam:extra + seam].copy()
sky_rows = np.repeat(np.asarray(sky_img).astype(np.float32)[-1:], seam * 2, axis=0)
w = np.linspace(0, 1, seam * 2)[:, None, None]
top[extra - seam:extra + seam] = sky_rows * (1 - w) + blend * w
save(Image.fromarray(np.clip(top, 0, 255).astype(np.uint8)), 'portrait-1080x1920.jpg')
