#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/build"
SVG_PATH="$BUILD_DIR/logo.svg"
BASE_PNG="$BUILD_DIR/icon.png"
ICONSET_DIR="$BUILD_DIR/icon.iconset"
ICNS_PATH="$BUILD_DIR/icon.icns"

if [[ ! -f "$SVG_PATH" ]]; then
  echo "Missing $SVG_PATH"
  exit 1
fi

# Render SVG to 1024x1024 PNG using macOS QuickLook.
qlmanage -t -s 1024 -o "$BUILD_DIR" "$SVG_PATH" >/dev/null 2>&1
mv -f "$BUILD_DIR/logo.svg.png" "$BASE_PNG"

rm -rf "$ICONSET_DIR"
mkdir -p "$ICONSET_DIR"

sips -z 16 16     "$BASE_PNG" --out "$ICONSET_DIR/icon_16x16.png" >/dev/null
sips -z 32 32     "$BASE_PNG" --out "$ICONSET_DIR/icon_16x16@2x.png" >/dev/null
sips -z 32 32     "$BASE_PNG" --out "$ICONSET_DIR/icon_32x32.png" >/dev/null
sips -z 64 64     "$BASE_PNG" --out "$ICONSET_DIR/icon_32x32@2x.png" >/dev/null
sips -z 128 128   "$BASE_PNG" --out "$ICONSET_DIR/icon_128x128.png" >/dev/null
sips -z 256 256   "$BASE_PNG" --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null
sips -z 256 256   "$BASE_PNG" --out "$ICONSET_DIR/icon_256x256.png" >/dev/null
sips -z 512 512   "$BASE_PNG" --out "$ICONSET_DIR/icon_256x256@2x.png" >/dev/null
sips -z 512 512   "$BASE_PNG" --out "$ICONSET_DIR/icon_512x512.png" >/dev/null
cp "$BASE_PNG" "$ICONSET_DIR/icon_512x512@2x.png"

iconutil -c icns "$ICONSET_DIR" -o "$ICNS_PATH"
rm -rf "$ICONSET_DIR"

# Also produce a Linux-friendly 512x512 icon.
sips -z 512 512 "$BASE_PNG" --out "$BUILD_DIR/icon-512.png" >/dev/null

echo "Generated:"
echo "- $BASE_PNG"
echo "- $BUILD_DIR/icon-512.png"
echo "- $ICNS_PATH"
