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
        text('when', 'WText.Muted', w='match_parent', textSize='14sp', layout_marginTop='2dp',
             sample='יום ג׳ 3.11 · 07:30'),
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
def plan(prev):
    return root([
        header('ic_ws_map', 'היום · יום 2 מתוך 4', 'פריז עם הילדים · מוזיאונים', 'יום ד׳ 4.11'),
        lin('list', 'vertical', h='0dp', layout_weight='1', layout_marginTop='4dp', kids=[
            *rows('plan', 8, PLAN_SAMPLES, show=5),
            text('plan_more', 'WText.Muted', w='match_parent', layout_marginTop='8dp', visibility='gone'),
        ]),
    ])


REM_SAMPLES = [('היום 18:00', 'להזמין מונית לשדה'), ('מחר 09:00', 'להדפיס כרטיסים'), ('', 'מטען נייד'),
               ('', 'לקנות מתאם'), ('', 'להשאיר מפתח לשכנים')]


def reminders(prev):
    return root([
        header('ic_ws_bell', 'תזכורות', 'פריז עם הילדים', '3 פתוחות'),
        lin('list', 'vertical', h='0dp', layout_weight='1', layout_marginTop='4dp', kids=[
            *rows('rem', 5, REM_SAMPLES, ring_always=True, show=3),
            text('rem_more', 'WText.Muted', w='match_parent', layout_marginTop='8dp', visibility='gone'),
        ]),
    ])


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
    'widget_message': (message, 'In place of any widget\'s content: signed out, nothing ahead, or a snapshot it cannot read.'),
}
PREVIEWS = ['widget_trip', 'widget_big', 'widget_pack', 'widget_plan', 'widget_reminders']

HEAD = '<?xml version="1.0" encoding="utf-8"?>\n<!-- Written by scripts/widget-layouts.py; edit there. {} -->\n'
for name, (make, about) in LAYOUTS.items():
    with open(OUT + name + '.xml', 'w') as f:
        f.write(HEAD.format(about) + make(False).xml(0, False, root=True))
    if name in PREVIEWS:
        with open(OUT + name + '_preview.xml', 'w') as f:
            f.write(HEAD.format('The widget picker\'s preview: ' + name + ' with sample text.') + make(True).xml(0, True, root=True))
    print(OUT + name + '.xml')
