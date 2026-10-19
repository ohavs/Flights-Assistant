# The home screen widgets' layouts (android/app/src/main/res/layout), and
# for each one the preview the widget picker shows (Android 12 and up): the
# same views with sample text. RemoteViews can only reach a view by a unique
# id, so repeated rows are spelled out; writing them from here keeps every
# layout and its preview in step. Edit this, then:
#   python3 scripts/widget-layouts.py
# Only views RemoteViews allows (no Space). The look is the app's (index.css, the Payments language): a 28dp card,
# Rubik 800 titles and numbers, sticker icons on a soft square, soft chips
# and pills, stat tiles. Colours per palette: WidgetKit.theme.
import os
import re

OUT = 'android/app/src/main/res/layout/'
NS = 'xmlns:android="http://schemas.android.com/apk/res/android"'


class V:
    """A view: tag, attributes (android: added unless the name has a colon
    or is 'style'), children, and sample text/attributes for the preview."""
    def __init__(self, tag, attrs=None, kids=(), sample=None, preview=None):
        self.tag, self.attrs, self.kids = tag, dict(attrs or {}), list(kids)
        self.sample, self.preview = sample, dict(preview or {})

    def xml(self, depth, prev, root=False):
        pad = '    ' * depth
        attrs = dict(self.attrs)
        if prev:
            attrs.update(self.preview)
            if self.sample is not None:
                attrs['text'] = self.sample
        items = ([NS] if root else []) + [
            f'{k if (":" in k or k == "style") else "android:" + k}="{v}"' for k, v in attrs.items()]
        head = f'{pad}<{self.tag}\n' + '\n'.join(f'{pad}    {a}' for a in items)
        if not self.kids:
            return head + ' />\n'
        return head + '>\n' + ''.join(k.xml(depth + 1, prev) for k in self.kids) + f'{pad}</{self.tag}>\n'


def lin(id_, orient, w='match_parent', h='wrap_content', kids=(), **a):
    attrs = {'layout_width': w, 'layout_height': h, 'orientation': orient}
    if id_:
        attrs = {'id': f'@+id/{id_}', **attrs}
    attrs.update(a)
    return V('LinearLayout', attrs, kids)


def text(id_, style, w='wrap_content', h='wrap_content', sample=None, preview=None, **a):
    return V('TextView', {'id': f'@+id/{id_}', 'layout_width': w, 'layout_height': h, 'style': f'@style/{style}', **a},
             sample=sample, preview=preview)


def image(id_, src, size, **a):
    return V('ImageView', {'id': f'@+id/{id_}', 'layout_width': f'{size}dp', 'layout_height': f'{size}dp',
                           'src': f'@drawable/{src}', 'importantForAccessibility': 'no', **a})


def icon_tile(icon, size=40, inner=24, id_='icon_tile'):
    """A sticker icon on the palette's soft square, like the app's trip card."""
    return V('FrameLayout', {'id': f'@+id/{id_}', 'layout_width': f'{size}dp', 'layout_height': f'{size}dp',
                             'background': '@drawable/widget_soft'},
             [image('icon', icon, inner, layout_gravity='center')])


def root(kids, pad=(16, 14)):
    return V('LinearLayout', {'id': '@+id/root', 'layout_width': 'match_parent', 'layout_height': 'match_parent',
                              'background': '@drawable/widget_bg', 'layoutDirection': 'rtl', 'orientation': 'vertical',
                              'paddingStart': f'{pad[0]}dp', 'paddingEnd': f'{pad[0]}dp',
                              'paddingTop': f'{pad[1]}dp', 'paddingBottom': f'{pad[1]}dp'}, kids)


def header(icon, title, subtitle, chip):
    """Icon tile, a title and a line under it, and the chip at the far end."""
    return lin('header', 'horizontal', gravity='center_vertical', kids=[
        icon_tile(icon),
        lin(None, 'vertical', w='0dp', layout_weight='1', layout_marginStart='10dp', kids=[
            text('title', 'WBold.Title', w='match_parent', sample=title),
            text('subtitle', 'WText.Muted', w='match_parent', layout_marginTop='3dp', sample=subtitle),
        ]),
        text('chip', 'WBold.Chip', layout_marginStart='8dp', sample=chip),
    ])


def rows(prefix, n, samples, ring_always=False, show=None):
    """n rows; the widget hides those it has nothing for. A plan row: a time
    pill, or a ring when there is no time, then the title. A reminder row:
    a ring, the text, and its time at the end when it has one."""
    out = []
    for i in range(1, n + 1):
        time, title = samples[i - 1] if i <= len(samples) else ('', '')
        shown = show is None or i <= show
        pill = text(f'{prefix}_time_{i}', 'WBold.Pill', sample=time or None,
                    preview={} if time else {'visibility': 'gone'})
        ring = image(f'{prefix}_ring_{i}', 'widget_dot', 14, layout_marginStart='3dp', layout_marginEnd='3dp')
        title_v = text(f'{prefix}_title_{i}', 'WText', w='0dp', layout_weight='1', layout_marginStart='8dp',
                       sample=title or None)
        if ring_always:
            pill.attrs['layout_marginStart'] = '8dp'
            kids = [ring, title_v, pill]
        else:
            ring.attrs['visibility'] = 'gone'
            ring.preview = {} if time else {'visibility': 'visible'}
            kids = [pill, ring, title_v]
        out.append(V('LinearLayout', {'id': f'@+id/{prefix}_row_{i}', 'layout_width': 'match_parent',
                                      'layout_height': 'wrap_content', 'layout_marginTop': '4dp',
                                      'gravity': 'center_vertical', 'orientation': 'horizontal'},
                     kids, preview={} if shown else {'visibility': 'gone'}))
    return out


def tile(id_, icon, value, label, second):
    """A stat tile: icon, a bold number and its word; a second line under it."""
    return lin(id_, 'vertical', w='0dp', layout_weight='1', background='@drawable/widget_tile',
               paddingStart='12dp', paddingEnd='12dp', paddingTop='10dp', paddingBottom='10dp', gravity='center_vertical',
               kids=[
                   lin(None, 'horizontal', gravity='center_vertical', kids=[
                       image(f'{id_}_icon', icon, 20),
                       text(f'{id_}_value', 'WBold', layout_marginStart='7dp', sample=value),
                       text(f'{id_}_label', 'WText.Muted', w='0dp', layout_weight='1', layout_marginStart='5dp', sample=label),
                   ]),
                   second,
               ])


PLAN_SAMPLES = [('בוקר', 'הלובר'), ('צהריים', 'גני טווילרי'), ('', 'גלידה ברטיון'), ('ערב', 'מסעדה ליד הסיין'),
                ('לילה', 'מגדל אייפל בלילה'), ('', 'שוק פשפשים'), ('', 'סיבוב בסירה'), ('', 'מונמארטר')]


# ── The trip widget (TripWidget): the next flight, or today's plan ─────────
def trip(prev):
    flight = lin('flight_block', 'vertical', h='match_parent', gravity='center_vertical', kids=[
        V('LinearLayout', {'id': '@+id/route_row', 'layout_width': 'match_parent', 'layout_height': '0dp',
                           'layout_weight': '1', 'gravity': 'center_vertical', 'layoutDirection': 'ltr',
                           'orientation': 'horizontal'}, [
            text('from', 'WBold.Hero', w='0dp', h='match_parent', layout_weight='1',
                 gravity='left|center_vertical', textAlignment='gravity', sample='TLV'),
            image('route_line', 'widget_route', 24, layout_width='64dp', layout_marginStart='6dp',
                  layout_marginEnd='6dp', scaleType='fitCenter'),
            text('to', 'WBold.Hero', w='0dp', h='match_parent', layout_weight='1',
                 gravity='right|center_vertical', textAlignment='gravity', sample='CDG'),
        ]),
        text('when', 'WText', w='match_parent', textSize='15sp', layout_marginTop='2dp',
             sample='יום ג׳ 3.11 · המראה 07:30 · נחיתה 10:45'),
        text('flight_info', 'WText.Muted', w='match_parent', textSize='13sp', layout_marginTop='2dp',
             sample='שער B12 · בזמן'),
    ])
    plan = lin('plan_block', 'vertical', h='match_parent', visibility='gone', kids=[
        *rows('plan', 6, PLAN_SAMPLES),
        text('plan_more', 'WText.Muted', w='match_parent', layout_marginTop='6dp', visibility='gone'),
    ])
    body = V('FrameLayout', {'id': '@+id/body', 'layout_width': 'match_parent', 'layout_height': '0dp',
                             'layout_weight': '1', 'layout_marginTop': '4dp'}, [flight, plan])
    bar = V('ProgressBar', {'id': '@+id/packed_bar', 'style': '@android:style/Widget.ProgressBar.Horizontal',
                            'layout_width': 'match_parent', 'layout_height': '8dp', 'layout_marginTop': '8dp',
                            'max': '100', 'progressDrawable': '@drawable/widget_progress'},
            preview={'progress': '55'})
    bottom = lin('bottom', 'horizontal', layout_marginTop='10dp', kids=[
        tile('packed', 'ic_ws_checklist', '12/22', 'נארזו', bar),
        V('FrameLayout', {'layout_width': '8dp', 'layout_height': '1dp'}),
        tile('rem', 'ic_ws_bell', '3', 'תזכורות',
             text('rem_next', 'WText.Muted', w='match_parent', textSize='12sp', layout_marginTop='5dp',
                  sample='להזמין מונית לשדה')),
    ])
    return root([header('ic_ws_plane', 'פריז עם הילדים', 'טיסת הלוך · LY 323', 'בעוד 5 ימים'), body, bottom])


# ── Small: a big countdown (TripWidget when narrow, CountdownWidget) ───────
def big(prev, icon='ic_ws_plane', chip='טיסת הלוך', number='5 ימים', caption='עד הטיסה לפריז · TLV → CDG'):
    return root([
        lin('header', 'horizontal', gravity='center_vertical', kids=[
            icon_tile(icon, 38, 23),
            V('FrameLayout', {'layout_width': '0dp', 'layout_height': '1dp', 'layout_weight': '1'}),
            text('chip', 'WBold.Chip', layout_marginStart='6dp', sample=chip),
        ]),
        text('big', 'WBold.Hero', w='match_parent', h='0dp', layout_weight='1', gravity='start|center_vertical',
             autoSizeMaxTextSize='72sp', sample=number),
        text('caption', 'WText.Muted', w='match_parent', maxLines='2', sample=caption),
    ], pad=(16, 14))


# ── Packing (PackWidget) ─────────────────────────────────────────────────
def pack(prev):
    bar = V('ProgressBar', {'id': '@+id/packed_bar', 'style': '@android:style/Widget.ProgressBar.Horizontal',
                            'layout_width': 'match_parent', 'layout_height': '10dp', 'layout_marginTop': '10dp',
                            'max': '100', 'progressDrawable': '@drawable/widget_progress'},
            preview={'progress': '55'})
    return root([
        lin('header', 'horizontal', gravity='center_vertical', kids=[
            icon_tile('ic_ws_checklist', 38, 23),
            V('FrameLayout', {'layout_width': '0dp', 'layout_height': '1dp', 'layout_weight': '1'}),
            text('chip', 'WBold.Chip', layout_marginStart='6dp', sample='55%'),
        ]),
        text('big', 'WBold.Hero', w='match_parent', h='0dp', layout_weight='1', gravity='start|center_vertical',
             autoSizeMaxTextSize='72sp', sample='12/22'),
        text('caption', 'WText.Muted', w='match_parent', sample='נארזו · פריז עם הילדים'),
        bar,
    ], pad=(16, 14))


# ── A list under a header: today's plan (PlanWidget), reminders ───────────
# On the home screen the list is a ListView that scrolls (ListWidgetService
# fills it, one widget_list_item per row). The picker's preview cannot run
# a service, so it shows sample rows instead.
def listed(prev, prefix, n, samples, ring_always, show, empty):
    if prev:
        return lin('list', 'vertical', h='0dp', layout_weight='1', layout_marginTop='4dp', kids=[
            *rows(prefix, n, samples, ring_always=ring_always, show=show)])
    return V('FrameLayout', {'layout_width': 'match_parent', 'layout_height': '0dp', 'layout_weight': '1',
                             'layout_marginTop': '6dp'}, [
        V('ListView', {'id': '@+id/list', 'layout_width': 'match_parent', 'layout_height': 'match_parent',
                       'divider': '@null', 'dividerHeight': '0dp', 'scrollbars': 'none',
                       'listSelector': '@android:color/transparent'}),
        text('empty', 'WText.Muted', w='match_parent', h='match_parent', gravity='center', textSize='15sp',
             visibility='gone', sample=empty),
    ])


def plan(prev):
    return root([
        header('ic_ws_map', 'היום · מוזיאונים', 'פריז עם הילדים · יום 2 מתוך 4', 'יום ד׳ 4.11'),
        listed(prev, 'plan', 8, PLAN_SAMPLES, False, 5, 'אין פעילויות בתוכנית להיום'),
    ])


REM_SAMPLES = [('היום 18:00', 'להזמין מונית לשדה'), ('מחר 09:00', 'להדפיס כרטיסים'), ('', 'מטען נייד'),
               ('', 'לקנות מתאם'), ('', 'להשאיר מפתח לשכנים')]


def reminders(prev):
    # "+" at the end of the header: a new reminder (ReminderSheetActivity).
    head = header('ic_ws_bell', 'תזכורות', 'פריז עם הילדים', '3 פתוחות')
    head.kids.append(text('add', 'WBold.Key.Save', w='36dp', h='36dp', gravity='center', layout_marginStart='8dp',
                          background='@drawable/widget_brand', text='+', textSize='22sp',
                          contentDescription='תזכורת חדשה'))
    return root([
        head,
        listed(prev, 'rem', 5, REM_SAMPLES, True, 3, 'אין תזכורות פתוחות'),
    ])


def list_item(prev):
    """A row of a widget list: a box to tick (a ring, or the brand with a
    tick), the title in two lines at most, a line under it, and a pill."""
    return V('LinearLayout', {'id': '@+id/item', 'layout_width': 'match_parent', 'layout_height': 'wrap_content',
                              'layoutDirection': 'rtl', 'orientation': 'horizontal', 'gravity': 'center_vertical',
                              'paddingTop': '6dp', 'paddingBottom': '6dp'}, [
        V('FrameLayout', {'id': '@+id/item_box', 'layout_width': '36dp', 'layout_height': '36dp'}, [
            image('item_ring', 'widget_dot', 22, layout_gravity='center'),
            V('FrameLayout', {'id': '@+id/item_check', 'layout_width': '24dp', 'layout_height': '24dp',
                              'layout_gravity': 'center', 'background': '@drawable/widget_check_bg', 'visibility': 'gone'},
              [image('item_tick', 'widget_tick', 18, layout_gravity='center')]),
        ]),
        lin(None, 'vertical', w='0dp', layout_weight='1', layout_marginStart='8dp', kids=[
            text('item_title', 'WText', w='match_parent', textSize='17sp', maxLines='2', sample='הלובר'),
            text('item_sub', 'WText.Muted', w='match_parent', layout_marginTop='2dp', visibility='gone'),
        ]),
        text('item_pill', 'WBold.Pill', layout_marginStart='8dp', textSize='13sp', visibility='gone'),
    ])


# ── An expense from the home screen (ExpenseWidget) ──────────────────────
def key(id_, label, bg='widget_tile', style='WBold.Key', w='0dp', h='match_parent', weight='1'):
    """A keypad key. Every key has 3dp around it, so keys in rows and in
    columns line up whatever the size. Its label is in the layout itself."""
    return text(id_, style, w=w, h=h, layout_weight=weight, gravity='center', layout_margin='3dp',
                background=f'@drawable/{bg}', text=label)


def key_row(keys):
    return lin(None, 'horizontal', h='0dp', layout_weight='1', kids=[key(i, l) for i, l in keys])


def expense(prev):
    # 1 2 3 | currency
    # 4 5 6 |
    # 7 8 9 | המשך
    # . 0 ⌫ |
    cur = key('key_cur', 'EUR', bg='widget_chip', style='WBold.Key.Cur')
    cur.sample = 'EUR'
    pad = lin('keypad', 'vertical', h='0dp', layout_weight='1', layout_marginTop='5dp', layoutDirection='ltr', kids=[
        lin(None, 'horizontal', h='0dp', layout_weight='1',
            kids=[key('key_1', '1'), key('key_2', '2'), key('key_3', '3'), cur]),
        lin(None, 'horizontal', h='0dp', layout_weight='3', kids=[
            lin(None, 'vertical', w='0dp', h='match_parent', layout_weight='3', kids=[
                key_row([('key_4', '4'), ('key_5', '5'), ('key_6', '6')]),
                key_row([('key_7', '7'), ('key_8', '8'), ('key_9', '9')]),
                key_row([('key_dot', '.'), ('key_0', '0'), ('key_back', '⌫')]),
            ]),
            key('key_save', 'המשך', bg='widget_brand', style='WBold.Key.Save'),
        ]),
    ])
    return root([
        lin('header', 'horizontal', gravity='center_vertical', kids=[
            icon_tile('ic_ws_wallet', 34, 21),
            text('title', 'WText.Muted', w='0dp', layout_weight='1', layout_marginStart='10dp',
                 sample='הוצאה · פריז עם הילדים'),
        ]),
        text('amount', 'WBold.Hero', w='match_parent', h='46dp', layout_marginTop='4dp', gravity='start|center_vertical',
             autoSizeMaxTextSize='40sp', sample='42.50 €'),
        pad,
    ], pad=(13, 12))


# ── A message in place of the content: signed out, nothing ahead ──────────
def message(prev):
    return root([
        icon_tile('ic_ws_plane', 40, 24),
        V('LinearLayout', {'layout_width': 'match_parent', 'layout_height': '0dp', 'layout_weight': '1',
                           'gravity': 'bottom', 'orientation': 'vertical'}, [
            text('title', 'WBold.Title', w='match_parent', maxLines='2', textSize='20sp', sample='אין טיול קרוב'),
            text('subtitle', 'WText.Muted', w='match_parent', maxLines='2', textSize='14sp',
                 layout_marginTop='4dp', sample='לחצו כדי לתכנן את הבא'),
        ]),
    ])


LAYOUTS = {
    'widget_trip': (trip, 'The trip widget (TripWidget): the next flight with its airports big, or during the trip today\'s plan; packing and reminders in two tiles. WidgetKit sizes it.'),
    'widget_big': (big, 'One big number (TripWidget when narrow, CountdownWidget): days to the flight, or the day of the trip.'),
    'widget_pack': (pack, 'Packing (PackWidget): how much of the checklist is packed.'),
    'widget_plan': (plan, 'Today\'s plan (PlanWidget), or the first day\'s before the trip.'),
    'widget_reminders': (reminders, 'Open reminders (RemindersWidget), the soonest first.'),
    'widget_expense': (expense, 'An expense from the home screen (ExpenseWidget): the amount on a keypad, the currency, then "המשך" opens ExpenseSheetActivity.'),
    'widget_list_item': (list_item, 'A row of the plan and reminders lists (ListWidgetService): a box to tick, the title, a line under it, a pill.'),
    'widget_message': (message, 'In place of any widget\'s content: signed out, nothing ahead, or a snapshot it cannot read.'),
}
PREVIEWS = ['widget_trip', 'widget_big', 'widget_pack', 'widget_plan', 'widget_reminders', 'widget_expense']

HEAD = '<?xml version="1.0" encoding="utf-8"?>\n<!-- Written by scripts/widget-layouts.py; edit there. {} -->\n'

# ── Light or dark by the app's own setting, not the phone's ────────────────
# The app can be set to light or dark whatever the phone is (ThemeContext).
# A widget's colours come from resources the launcher resolves by the
# phone's mode, so for each fixed theme there is a copy of every layout and
# of every drawable it uses, with the colours of that theme spelled out
# (w_text_dark, widget_tile_dark, …). WidgetThemes.java picks the copy.
RES = 'android/app/src/main/res/'
THEMES = ('light', 'dark')
THEMED = ['widget_bg', 'widget_tile', 'widget_soft', 'widget_chip', 'widget_brand', 'widget_dot', 'widget_progress',
          'widget_route', 'widget_check_bg', 'widget_tick', 'ic_ws_plane', 'ic_ws_map', 'ic_ws_checklist', 'ic_ws_bell', 'ic_ws_wallet']
# The colour (and background) each text style gives, so a copy can say it outright.
STYLE_COLOR = {'WText': 'w_text', 'WText.Muted': 'w_muted', 'WBold': 'w_text', 'WBold.Title': 'w_text',
               'WBold.Hero': 'w_text', 'WBold.Key': 'w_text', 'WBold.Chip': 'w_accent', 'WBold.Pill': 'w_accent',
               'WBold.Key.Cur': 'w_accent', 'WBold.Key.Save': 'w_on_brand'}
STYLE_BG = {'WBold.Chip': 'widget_chip', 'WBold.Pill': 'widget_chip'}
COLOR_REF = re.compile(r'@color/(w_\w+)')


def themed_value(val, t):
    val = COLOR_REF.sub(lambda m: f'@color/{m.group(1)}_{t}', val)
    if val.startswith('@drawable/') and val[len('@drawable/'):] in THEMED:
        val = f'{val}_{t}'
    return val


def themed(view, t):
    attrs = {k: themed_value(v, t) if isinstance(v, str) else v for k, v in view.attrs.items()}
    style = attrs.get('style', '')
    if style.startswith('@style/'):
        name = style[len('@style/'):]
        assert name in STYLE_COLOR, f'widget-layouts.py: no colour for style {name}'
        attrs.setdefault('textColor', f'@color/{STYLE_COLOR[name]}_{t}')
        if name in STYLE_BG:
            attrs.setdefault('background', f'@drawable/{STYLE_BG[name]}_{t}')
    return V(view.tag, attrs, [themed(k, t) for k in view.kids], view.sample, view.preview)


def colors(path):
    return re.findall(r'<color name="(w_\w+)">([^<]+)</color>', open(path, encoding='utf8').read())


with open(RES + 'values/widget_colors_fixed.xml', 'w') as f:
    f.write('<?xml version="1.0" encoding="utf-8"?>\n<!-- Written by scripts/widget-layouts.py from widget_colors.xml '
            '(light) and values-night (dark); edit those. The widgets\' colours in one theme whatever the phone\'s. -->\n<resources>\n')
    for t, path in (('light', RES + 'values/widget_colors.xml'), ('dark', RES + 'values-night/widget_colors.xml')):
        for name, value in colors(path):
            f.write(f'    <color name="{name}_{t}">{value}</color>\n')
    f.write('</resources>\n')
for d in THEMED:
    src = open(RES + 'drawable/' + d + '.xml', encoding='utf8').read()
    for t in THEMES:
        body = COLOR_REF.sub(lambda m: f'@color/{m.group(1)}_{t}', src)
        body = body.replace('<?xml version="1.0" encoding="utf-8"?>\n',
                            f'<?xml version="1.0" encoding="utf-8"?>\n<!-- Written by scripts/widget-layouts.py from {d}.xml, {t}; edit that. -->\n', 1)
        with open(RES + 'drawable/' + d + '_' + t + '.xml', 'w') as f:
            f.write(body)

java = ['package com.ohavs.flightsassistant.widget;', '', 'import com.ohavs.flightsassistant.R;', '',
        '/** Written by scripts/widget-layouts.py; edit there. A layout or drawable in the app\'s light or dark theme. */',
        'final class WidgetThemes {', '    private WidgetThemes() {}', '',
        '    static int layout(int base, boolean dark) {']
for name in LAYOUTS:
    java.append(f'        if (base == R.layout.{name}) return dark ? R.layout.{name}_dark : R.layout.{name}_light;')
java += ['        return base;', '    }', '', '    static int drawable(int base, boolean dark) {']
for d in THEMED:
    java.append(f'        if (base == R.drawable.{d}) return dark ? R.drawable.{d}_dark : R.drawable.{d}_light;')
java += ['        return base;', '    }', '}', '']
with open('android/app/src/main/java/com/ohavs/flightsassistant/widget/WidgetThemes.java', 'w') as f:
    f.write('\n'.join(java))

for name, (make, about) in LAYOUTS.items():
    with open(OUT + name + '.xml', 'w') as f:
        f.write(HEAD.format(about) + make(False).xml(0, False, root=True))
    for t in THEMES:
        with open(OUT + name + '_' + t + '.xml', 'w') as f:
            f.write(HEAD.format(f'{name}, always {t} (the app set to {t}).') + themed(make(False), t).xml(0, False, root=True))
    if name in PREVIEWS:
        with open(OUT + name + '_preview.xml', 'w') as f:
            f.write(HEAD.format('The widget picker\'s preview: ' + name + ' with sample text.') + make(True).xml(0, True, root=True))
    print(OUT + name + '.xml')
