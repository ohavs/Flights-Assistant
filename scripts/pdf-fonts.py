# The PDF's fonts: Rubik (the app's font, OFL) as three static weights,
# 400/500/700, each the Hebrew and Latin subsets of the variable font
# merged into one ~38KB TTF. jsPDF needs static TrueType.
#   pip install fonttools brotli && python3 scripts/pdf-fonts.py
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.merge import Merger
import os, tempfile

SRC = 'node_modules/@fontsource-variable/rubik/files/'
tmp = tempfile.mkdtemp()
for w in (400, 500, 700):
    parts = []
    for sub in ('hebrew', 'latin'):
        f = TTFont(SRC + f'rubik-{sub}-wght-normal.woff2')
        f.flavor = None
        inst = instancer.instantiateVariableFont(f, {'wght': w})
        for t in ('GSUB', 'GPOS', 'GDEF', 'STAT', 'HVAR', 'MVAR'):   # jsPDF ignores them; the merger trips on them
            if t in inst: del inst[t]
        p = os.path.join(tmp, f'{sub}-{w}.ttf')
        inst.save(p)
        parts.append(p)
    merged = Merger().merge(parts)
    merged.save(f'public/fonts/Rubik-{w}.ttf')
    print(f'public/fonts/Rubik-{w}.ttf')
