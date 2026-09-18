#!/usr/bin/env bash
# Builds the native PIL interpreter (github.com/Acerx-AMJ/PIL) into server/bin/pil for the sandbox runner.
set -euo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
git clone -q --depth 1 https://github.com/Acerx-AMJ/PIL "$work/PIL"
cd "$work/PIL"
sed -i.bak 's/   long long t = std::time(nullptr);/   time_t t = std::time(nullptr);/' source/builtin.cpp
mkdir -p "$here/server/bin"
${CXX:-c++} -std=c++20 -O2 -Iinclude source/*.cpp -o "$here/server/bin/pil"
rm -rf "$work"
echo "built server/bin/pil"
