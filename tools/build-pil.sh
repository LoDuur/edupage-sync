#!/usr/bin/env bash
# Builds the PIL interpreter (github.com/Acerx-AMJ/PIL) to WebAssembly for docs/compiler/pil/pil.js.
# Needs emscripten (brew install emscripten).
set -euo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
git clone -q --depth 1 https://github.com/Acerx-AMJ/PIL "$work/PIL"
cd "$work/PIL"
sed -i.bak 's/   long long t = std::time(nullptr);/   time_t t = std::time(nullptr);/' source/builtin.cpp
em++ -std=c++20 -O2 -fwasm-exceptions -Iinclude source/*.cpp -o "$here/docs/compiler/pil/pil.js" \
  -sMODULARIZE=1 -sEXPORT_NAME=createPIL -sENVIRONMENT=worker -sEXIT_RUNTIME=1 -sINVOKE_RUN=0 \
  -sFORCE_FILESYSTEM=1 -sEXPORTED_RUNTIME_METHODS=callMain,FS -sALLOW_MEMORY_GROWTH=1 -sSINGLE_FILE=1 -sASSERTIONS=0
git rev-parse --short HEAD > "$here/docs/compiler/pil/VERSION"
rm -rf "$work"
echo "built docs/compiler/pil/pil.js @ $(cat "$here/docs/compiler/pil/VERSION")"
