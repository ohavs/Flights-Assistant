# Usage: python3 scripts/android-icon.py android/app/src/main/res
# Recolours the adaptive foreground (any colour, alpha kept) and rebuilds
# every density; also set values/ic_launcher_background.xml to BG.
# Android launcher icon: brand green with an ink plane, so the app is
# told apart from the navy PWA icon on the same phone.
import sys
from PIL import Image, ImageDraw
res = sys.argv[1]
BG = (0x22, 0xA4, 0x5D, 255)
INK = (0x14, 0x14, 0x14)
SIZES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
src = Image.open(f'{res}/mipmap-xxxhdpi/ic_launcher_foreground.png').convert('RGBA')
alpha = src.getchannel('A')
fg = Image.new('RGBA', src.size, INK + (0,)); fg.putalpha(alpha)   # 432 = 108dp
for d, legacy in SIZES.items():
    fsize = legacy * 108 // 48
    fg.resize((fsize, fsize), Image.LANCZOS).save(f'{res}/mipmap-{d}/ic_launcher_foreground.png')
    # Legacy (pre-8.0) icons: the adaptive icon, masked.
    big = Image.new('RGBA', fg.size, BG); big.alpha_composite(fg)
    inset = fg.size[0] * 6 // 108   # plane at ~55% of the icon, clear of a round mask
    crop = big.crop((inset, inset, fg.size[0] - inset, fg.size[0] - inset))
    S = crop.size[0]
    for name, shape in (('ic_launcher', 'rr'), ('ic_launcher_round', 'circle')):
        mask = Image.new('L', (S, S), 0); m = ImageDraw.Draw(mask)
        if shape == 'rr': m.rounded_rectangle((0, 0, S - 1, S - 1), radius=S * 0.22, fill=255)
        else: m.ellipse((0, 0, S - 1, S - 1), fill=255)
        out = Image.new('RGBA', (S, S), (0, 0, 0, 0)); out.paste(crop, (0, 0), mask)
        out.resize((legacy, legacy), Image.LANCZOS).save(f'{res}/mipmap-{d}/{name}.png')
print('ok')
