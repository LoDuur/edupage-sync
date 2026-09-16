import html
import re

SECTION_RE = re.compile(r'<div class="section[^"]*">(.*?)</div>\s*</div>\s*</div>', re.S)
HEADER_RE = re.compile(r'<div class="header">.*?<span[^>]*>(.*?)</span>', re.S)
ROW_RE = re.compile(r'<div class="row\s*([a-z]*)\s*">\s*<div class="period">\s*<span[^>]*>(.*?)</span>\s*</div>\s*<div class="info">\s*<span[^>]*>(.*?)</span>', re.S)


def _text(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def parse(page_html, class_short, fix_name=lambda s: s, date=None):
    rows = []
    for section in SECTION_RE.findall(page_html):
        header = HEADER_RE.search(section)
        if not header or _text(header.group(1)) != class_short:
            continue
        for kind, period, info in ROW_RE.findall(section):
            rows.append({
                "date": date,
                "period": _text(period),
                "text": fix_name(_text(info)),
                "kind": kind or "change",
            })
    return rows


def key(row):
    return f"{row['date']}|{row['period']}|{row['text']}"
