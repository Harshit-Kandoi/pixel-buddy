#!/usr/bin/env bash
# Builds resources/mac/mic-in-use (see native/mac/mic-in-use.swift) as one universal binary
# for Apple silicon and Intel Macs. Runs as part of `npm run build:mac`; does nothing elsewhere.
set -euo pipefail
[ "$(uname)" = "Darwin" ] || { echo "Skipping the macOS microphone helper (not on macOS)."; exit 0; }
cd "$(dirname "$0")/.."
src=native/mac/mic-in-use.swift
out=resources/mac/mic-in-use
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p resources/mac
for arch in arm64 x86_64; do
  swiftc -O -target "$arch-apple-macos12.0" "$src" -o "$tmp/mic-in-use-$arch"
done
lipo -create "$tmp/mic-in-use-arm64" "$tmp/mic-in-use-x86_64" -output "$out"
# Every binary on Apple silicon must carry a signature; an ad-hoc one is enough (the app isn't signed either).
codesign --force --sign - "$out"
echo "Built $out ($(lipo -archs "$out")): mic in use = $("$out")"
