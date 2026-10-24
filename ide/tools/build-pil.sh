#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
git clone -q --depth 1 https://github.com/Acerx-AMJ/PIL "$work/PIL"
cd "$work/PIL"
sed -i.bak 's/   long long t = std::time(nullptr);/   time_t t = std::time(nullptr);/' source/builtin.cpp
IFS=. read -r major minor patch < <(sed -n 's/^project(pil VERSION \([0-9.]*\)).*/\1/p' CMakeLists.txt)
defines=(-DPIL_MAJOR="${major:-0}" -DPIL_MINOR="${minor:-0}" -DPIL_PATCH="${patch:-0}")
${CXX:-c++} -std=c++20 -O2 -Iinclude "${defines[@]}" source/*.cpp -o "$here/bin/pil"
echo "built bin/pil @ $(git rev-parse --short HEAD)"
if [ "${1:-}" = "--wasm" ]; then
  em++ -std=c++20 -O2 -fwasm-exceptions -Wno-c++11-narrowing -Iinclude "${defines[@]}" source/*.cpp -o "$here/public/pil/pil.js" \
    -sMODULARIZE=1 -sEXPORT_NAME=createPIL -sENVIRONMENT=worker -sEXIT_RUNTIME=1 -sINVOKE_RUN=0 -sFORCE_FILESYSTEM=1 \
    -sEXPORTED_RUNTIME_METHODS=callMain,FS -sALLOW_MEMORY_GROWTH=1 -sSINGLE_FILE=1 -sASSERTIONS=0
  echo "built public/pil/pil.js (WebAssembly, for the GitHub Pages build)"
fi
