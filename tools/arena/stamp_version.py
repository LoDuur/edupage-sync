import json
import os
import re
import sys

ARENA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "docs", "arena")
THREE = "https://cdn.jsdelivr.net/npm/three@0.170.0/"


def stamp(version):
    modules = sorted(
        os.path.relpath(os.path.join(root, name), ARENA)
        for root, _, names in os.walk(ARENA)
        for name in names
        if name.endswith(".js") and name != "main.js"
    )
    imports = {"three": THREE + "build/three.module.js", "three/addons/": THREE + "examples/jsm/"}
    imports.update({f"./{m}": f"./{m}?v={version}" for m in modules})
    block = '<script type="importmap">\n' + json.dumps({"imports": imports}, indent=1, ensure_ascii=False) + "\n</script>"
    path = os.path.join(ARENA, "index.html")
    with open(path, encoding="utf-8") as f:
        html = f.read()
    html = re.sub(r'<script type="importmap">.*?</script>', lambda _: block, html, flags=re.S)
    html = re.sub(r'(main\.js|arena\.css)\?v=\d+', lambda m: f"{m.group(1)}?v={version}", html)
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    viewmodel = os.path.join(ARENA, "render", "viewmodel.js")
    with open(viewmodel, encoding="utf-8") as f:
        code = f.read()
    with open(viewmodel, "w", encoding="utf-8") as f:
        f.write(re.sub(r'\.glb\?v=\d+', f".glb?v={version}", code))
    print(f"stamped v={version} on {len(modules)} modules")


if __name__ == "__main__":
    if len(sys.argv) != 2 or not sys.argv[1].isdigit():
        sys.exit("usage: python3 tools/arena/stamp_version.py <version>")
    stamp(int(sys.argv[1]))
