import html
import re

SECTION_RE = re.compile(r'<div class="section[^"]*">(.*?)</div>\s*</div>\s*</div>', re.S)
HEADER_RE = re.compile(r'<div class="header">.*?<span[^>]*>(.*?)</span>', re.S)
ROW_RE = re.compile(r'<div class="row\s*([a-z]*)\s*">\s*<div class="period">\s*<span[^>]*>(.*?)</span>\s*</div>\s*<div class="info">\s*<span[^>]*>(.*?)</span>', re.S)


def _text(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def _norm(s):
    return re.sub(r"\s+", "", (s or "")).lower()


def parse(page_html, class_names, fix_name=lambda s: s, date=None):
    """class_names: one name or several (short and full) – EduPage varies the heading."""
    if isinstance(class_names, str):
        class_names = [class_names]
    wanted = {_norm(n) for n in class_names if n}
    rows = []
    for section in SECTION_RE.findall(page_html):
        header = HEADER_RE.search(section)
        if not header:
            continue
        head = _norm(_text(header.group(1)))
        if head not in wanted and not any(head.endswith(w) and not head[-len(w) - 1].isalnum() for w in wanted if len(head) > len(w)):
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
