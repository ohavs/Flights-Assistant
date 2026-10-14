#!/usr/bin/env python3
"""Generates the Android launcher icons and splash screens from the PWA icon
(public/pwa-512x512.png: a white plane on navy). Run from the repo root:
    python3 scripts/android-icons.py
Needs Pillow. Output goes to android/app/src/main/res/."""
from pathlib import Path
from PIL import Image, ImageDraw

SRC = Path('public/pwa-512x512.png')
RES = Path('android/app/src/main/res')
NAVY = (9, 14, 52)

src = Image.open(SRC).convert('RGB')
w, h = src.size
# The plane: white pixels inside the navy square (the rounded corners are cut off).
inner = src.crop((w // 10, h // 10, w - w // 10, h - h // 10)).convert('L')
nl = sum(NAVY) // 3
alpha = inner.point(lambda v: max(0, min(255, (v - nl) * 255 // (255 - nl))))
plane = Image.new('RGBA', inner.size, (255, 255, 255, 0))
plane.putalpha(alpha)
plane = plane.crop(alpha.getbbox())


def placed(size, frac, bg=None):
    """The plane centred on a size×size canvas, its longer side frac of it."""
    canvas = Image.new('RGBA', (size, size), bg + (255,) if bg else (0, 0, 0, 0))
    scale = size * frac / max(plane.size)
    p = plane.resize((round(plane.width * scale), round(plane.height * scale)), Image.LANCZOS)
    canvas.alpha_composite(p, ((size - p.width) // 2, (size - p.height) // 2))
    return canvas


def rounded(img, radius):
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, img.width - 1, img.height - 1), radius, fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.paste(img, mask=mask)
    return out


for density, legacy in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
    d = RES / f'mipmap-{density}'
    # Adaptive icon foreground: 108dp canvas, keep the plane inside the 66dp safe zone.
    placed(legacy * 108 // 48, 0.5).save(d / 'ic_launcher_foreground.png')
    big = placed(legacy * 4, 0.6, NAVY)
    rounded(big, legacy * 4 // 5).resize((legacy, legacy), Image.LANCZOS).save(d / 'ic_launcher.png')
    circle = Image.new('L', big.size, 0)
    ImageDraw.Draw(circle).ellipse((0, 0, big.width - 1, big.height - 1), fill=255)
    round_icon = Image.new('RGBA', big.size, (0, 0, 0, 0))
    round_icon.paste(big, mask=circle)
    round_icon.resize((legacy, legacy), Image.LANCZOS).save(d / 'ic_launcher_round.png')

# Splash: navy with the plane in the middle, every size the template ships.
for f in RES.glob('drawable*/splash.png'):
    sw, sh = Image.open(f).size
    side = min(sw, sh)
    splash = Image.new('RGBA', (sw, sh), NAVY + (255,))
    mark = placed(side, 0.32)
    splash.alpha_composite(mark, ((sw - side) // 2, (sh - side) // 2))
    splash.convert('RGB').save(f)

(RES / 'values/ic_launcher_background.xml').write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
    '    <color name="ic_launcher_background">#090E34</color>\n</resources>\n')
print('icons and splash written')
