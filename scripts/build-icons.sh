#!/usr/bin/env bash
#
# Build every platform's application icon from one piece of artwork.
#
# The source is a full-bleed 1024x1024 squircle on transparency — the shape
# touches all four edges. That is the iOS convention. macOS expects the shape
# to sit inside a safe area instead, and an icon that ignores this renders
# visibly larger than everything beside it in the Dock, so the artwork is
# inset before the icon set is generated.
#
# The inset numbers are measured from stock macOS icons (Notes, Maps, Music),
# which all place an 880x880 shape in a 1024x1024 canvas at offset (72, 84) —
# the extra room at the bottom is the shadow allowance.
#
# One static icon, deliberately. macOS 26 can derive Dark/Clear/Tinted styles
# from a layered Icon Composer `.icon`, but the derived styles flatten the
# glow this artwork is built around, so the app ships the artwork as drawn and
# keeps it in every appearance.
#
# Output is committed, so building the app needs none of this. Re-run it only
# when the artwork changes:
#
#   ./scripts/build-icons.sh
#
# Needs ImageMagick (brew install imagemagick).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$root/src-tauri/icons/source/app-icon.png"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

command -v magick >/dev/null || { echo "missing imagemagick" >&2; exit 1; }
[ -f "$src" ] || { echo "missing $src" >&2; exit 1; }

CANVAS=1024
ARTWORK=880
OFFSET_X=72
OFFSET_Y=84

magick -size "${CANVAS}x${CANVAS}" xc:none \
  \( "$src" -resize "${ARTWORK}x${ARTWORK}" \) \
  -geometry "+${OFFSET_X}+${OFFSET_Y}" -composite \
  -depth 8 "PNG32:$work/inset.png"

# Tauri's own generator produces the whole set — icns, ico, the Linux PNGs and
# the Windows Store logos — in exactly the layout and names the bundler looks
# for, so it is fed the inset artwork rather than reimplemented here.
(cd "$root" && pnpm tauri icon "$work/inset.png" --output src-tauri/icons)

# The window icon the app swaps at runtime on Windows and Linux, where there is
# no system-wide icon style. Light is the artwork as drawn; dark is the same
# shape on the dark ground those desktops use.
magick "$work/inset.png" -resize 512x512 -depth 8 "PNG32:$root/src-tauri/icons/app-light.png"
magick "$work/inset.png" -resize 512x512 \
  -background '#1c1c1e' -alpha remove -alpha off \
  -depth 8 "PNG32:$root/src-tauri/icons/app-dark.png"

echo "icons written from $(basename "$src"):"
for f in icon.ico icon.png 32x32.png 128x128.png 128x128@2x.png app-light.png app-dark.png; do
  p="$root/src-tauri/icons/$f"
  [ -f "$p" ] && printf '  %-18s %s\n' "$f" "$(magick identify -format '%wx%h %m' "$p[0]")"
done
# ImageMagick has no icns delegate here, so this one is read with sips.
printf '  %-18s %s\n' icon.icns \
  "$(sips -g pixelWidth -g pixelHeight "$root/src-tauri/icons/icon.icns" 2>/dev/null | awk '/pixel/ {print $2}' | paste -sd x -)"
