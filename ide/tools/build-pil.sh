#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
git clone -q --depth 1 https://github.com/Acerx-AMJ/PIL "$work/PIL"
cd "$work/PIL"
sed -i.bak 's/   long long t = std::time(nullptr);/   time_t t = std::time(nullptr);/' source/builtin.cpp
IFS=. read -r major minor patch < <(sed -n 's/^project(pil VERSION \([0-9.]*\)).*/\1/p' CMakeLists.txt)
${CXX:-c++} -std=c++20 -O2 -Iinclude -DPIL_MAJOR="${major:-0}" -DPIL_MINOR="${minor:-0}" -DPIL_PATCH="${patch:-0}" source/*.cpp -o "$here/bin/pil"
echo "built bin/pil @ $(git rev-parse --short HEAD)"
