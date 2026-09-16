import colorsys
import hashlib
from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

DAYS = ["Pirmdiena", "Otrdiena", "Trešdiena", "Ceturtdiena", "Piektdiena", "Sestdiena", "Svētdiena"]
HUES = [212, 262, 340, 14, 32, 48, 150, 175, 192, 285]
FONT_CANDIDATES = {
    "regular": ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf", "/Library/Fonts/Arial.ttf"],
    "bold": ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/Library/Fonts/Arial Bold.ttf"],
}
S = 2
COL_W = 560 * S
PAD = 20 * S
BG = (242, 242, 247)
CARD = (255, 255, 255)
TEXT = (28, 28, 30)
TEXT2 = (110, 110, 115)
TEXT3 = (174, 174, 178)
AMBER = (255, 159, 10)
LINE = (229, 229, 234)


def font(kind, size):
    for path in FONT_CANDIDATES[kind]:
        if Path(path).exists():
            return ImageFont.truetype(path, size * S)
    return ImageFont.load_default()


F_TITLE = font("bold", 26)
F_SUB = font("regular", 14)
F_LESSON = font("bold", 16)
F_META = font("regular", 13)
F_TIME = font("regular", 13)
F_SMALL = font("regular", 11)
F_HEAD = font("bold", 18)


def hue_for(summary):
    key = summary.split(" (")[0]
    h = 0
    for c in key:
        h = (h * 31 + ord(c)) & 0xFFFFFFFF
    return HUES[h % len(HUES)]


def hsl(h, s, l):
    r, g, b = colorsys.hls_to_rgb(h / 360, l / 100, s / 100)
    return int(r * 255), int(g * 255), int(b * 255)


def hm(iso):
    return iso[11:16]


def to_min(iso):
    return int(iso[11:13]) * 60 + int(iso[14:16])


def dname(iso):
    d = date.fromisoformat(iso)
    return f"{DAYS[d.weekday()]}, {d:%d.%m.}"


def rounded(draw, box, radius, fill, outline=None):
    draw.rounded_rectangle(box, radius=radius * S, fill=fill, outline=outline, width=S if outline else 0)


def ellipsize(draw, text, f, max_w):
    if draw.textlength(text, font=f) <= max_w:
        return text
    while text and draw.textlength(text + "…", font=f) > max_w:
        text = text[:-1]
    return text + "…"


def draw_column(draw, x, y, w, iso, events, subs, show_head=True):
    inner_w = w - 2 * PAD
    if show_head:
        draw.text((x + PAD, y), dname(iso), font=F_HEAD, fill=TEXT)
        y += 30 * S
    events = sorted(events, key=lambda e: e["start"])
    if not events:
        rounded(draw, (x + PAD, y, x + w - PAD, y + 44 * S), 10, CARD)
        draw.text((x + w / 2, y + 22 * S), "Nav stundu", font=F_META, fill=TEXT3, anchor="mm")
        return y + 52 * S
    prev_end = None
    lunch = lambda e: "pusdienas" in e["summary"].lower()
    for e in events:
        if prev_end is not None:
            gap = to_min(e["start"]) - prev_end
            if gap >= 5:
                label = f"Starpbrīdis · {gap} min" if gap <= 45 else f"Brīvstunda · {gap} min"
                draw.text((x + w / 2, y + 9 * S), label, font=F_SMALL, fill=TEXT3, anchor="mm")
                y += 18 * S
        h = 58 * S
        hue = hue_for(e["summary"])
        bg = (245, 245, 247) if lunch(e) else hsl(hue, 55, 93)
        bar = TEXT3 if lunch(e) else hsl(hue, 70, 52)
        fg = TEXT2 if lunch(e) else hsl(hue, 60, 30)
        rounded(draw, (x + PAD, y, x + w - PAD, y + h), 10, bg)
        draw.rounded_rectangle((x + PAD, y, x + PAD + 4 * S, y + h), radius=2 * S, fill=bar)
        tx = x + PAD + 14 * S
        draw.text((tx, y + 9 * S), f"{hm(e['start'])}–{hm(e['end'])}", font=F_TIME, fill=fg)
        draw.text((x + w - PAD - 10 * S, y + 9 * S), f"{e['periods']} st.", font=F_TIME, fill=fg, anchor="ra")
        draw.text((tx, y + 26 * S), ellipsize(draw, e["summary"], F_LESSON, inner_w - 30 * S), font=F_LESSON, fill=fg)
        meta = " · ".join(v for v in [e.get("location", ""), ", ".join(e.get("teachers", []))] if v)
        if meta:
            h += 16 * S
            draw.rounded_rectangle((x + PAD, y + 58 * S - 12 * S, x + w - PAD, y + h), radius=10 * S, fill=bg)
            draw.rounded_rectangle((x + PAD, y, x + PAD + 4 * S, y + h), radius=2 * S, fill=bar)
            draw.text((tx, y + 48 * S), ellipsize(draw, meta, F_META, inner_w - 30 * S), font=F_META, fill=fg)
        y += h + 6 * S
        prev_end = to_min(e["end"])
    if subs:
        y += 6 * S
        box_h = (22 + 18 * len(subs)) * S
        rounded(draw, (x + PAD, y, x + w - PAD, y + box_h), 10, (255, 244, 224), outline=AMBER)
        draw.text((x + PAD + 12 * S, y + 6 * S), "AIZVIETOŠANA", font=F_SMALL, fill=AMBER)
        for i, s in enumerate(subs):
            draw.text((x + PAD + 12 * S, y + (22 + 18 * i) * S), ellipsize(draw, f"{s['period']}. {s['text']}", F_META, inner_w - 24 * S), font=F_META, fill=TEXT)
        y += box_h + 6 * S
    if any(e.get("dayType") == "short" for e in events):
        draw.text((x + PAD, y + 4 * S), "Pirmssvētku diena · 30 min stundas", font=F_SMALL, fill=AMBER)
        y += 20 * S
    return y


def _canvas(width):
    img = Image.new("RGB", (width, 2600 * S), BG)
    return img, ImageDraw.Draw(img)


def _finish(img, y, path, footer, draw):
    draw.text((PAD, y + 8 * S), footer, font=F_SUB, fill=TEXT3)
    img = img.crop((0, 0, img.width, y + 36 * S))
    img.save(path, optimize=True)
    return path


def day_image(class_name, iso, events, subs, path, footer):
    img, draw = _canvas(COL_W)
    draw.text((PAD, PAD), dname(iso), font=F_TITLE, fill=TEXT)
    draw.text((PAD, PAD + 34 * S), class_name, font=F_SUB, fill=TEXT2)
    y = draw_column(draw, 0, PAD + 62 * S, COL_W, iso, events, subs, show_head=False)
    return _finish(img, y, path, footer, draw)


def week_image(class_name, title, days, subs_by_date, path, footer):
    cols = len(days)
    img, draw = _canvas(COL_W * cols)
    draw.text((PAD, PAD), title, font=F_TITLE, fill=TEXT)
    draw.text((PAD, PAD + 34 * S), class_name, font=F_SUB, fill=TEXT2)
    top = PAD + 62 * S
    bottom = top
    for i, (iso, events) in enumerate(days):
        bottom = max(bottom, draw_column(draw, i * COL_W, top, COL_W, iso, events, subs_by_date.get(iso, [])))
    return _finish(img, bottom, path, footer, draw)
