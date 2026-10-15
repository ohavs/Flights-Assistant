# The widgets' fonts (android/app/src/main/res/font): Rubik, the app's font
# (OFL), as two static weights for RemoteViews, which cannot take a variable
# font: 600 for text, 800 for titles and numbers. Each is the Hebrew and
# Latin subsets of the variable font merged into one small TTF, like the
# PDF's (pdf-fonts.py).
#   pip install fonttools brotli && python3 scripts/widget-fonts.py
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.merge import Merger
import os, tempfile

SRC = 'node_modules/@fontsource-variable/rubik/files/'
OUT = 'android/app/src/main/res/font/'
tmp = tempfile.mkdtemp()
for w, name in ((600, 'rubik_semibold'), (800, 'rubik_extrabold')):
    parts = []
    for sub in ('hebrew', 'latin'):
        f = TTFont(SRC + f'rubik-{sub}-wght-normal.woff2')
        f.flavor = None
        inst = instancer.instantiateVariableFont(f, {'wght': w})
        for t in ('GSUB', 'GPOS', 'GDEF', 'STAT', 'HVAR', 'MVAR'):   # the merger trips on them
            if t in inst: del inst[t]
        p = os.path.join(tmp, f'{sub}-{w}.ttf')
        inst.save(p)
        parts.append(p)
    merged = Merger().merge(parts)
    merged['OS/2'].usWeightClass = w
    merged.save(OUT + name + '.ttf')
    print(OUT + name + '.ttf')
