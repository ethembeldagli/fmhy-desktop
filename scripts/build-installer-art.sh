#!/usr/bin/env bash
#
# Render the artwork the installers display.
#
# Windows wants BMPs at exact sizes, and the installer UI draws its own text
# over them in black — so the halves those dialogs write on stay light, and the
# brand panel goes where nothing is drawn:
#
#   banner.bmp   493x58   interior dialogs; title text sits on the left
#   dialog.bmp   493x312  welcome/exit pages; body text sits on the right
#   header.bmp   150x57   NSIS header, top-right corner only
#   sidebar.bmp  164x314  NSIS welcome/finish panel; nothing is drawn over it
#
# macOS gets a Finder window background instead, sized to the DMG window.
#
# Output is committed, so building the app needs none of this. Re-run it only
# when the artwork changes:
#
#   ./scripts/build-installer-art.sh
#
# Needs librsvg and ImageMagick (brew install librsvg imagemagick).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
win="$root/src-tauri/installer/windows"
mac="$root/src-tauri/installer/macos"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

for tool in rsvg-convert magick; do
  command -v "$tool" >/dev/null || { echo "missing $tool" >&2; exit 1; }
done

mkdir -p "$win" "$mac"

# The play mark, as a reusable SVG group. $1 scales it, $2/$3 place it.
mark() {
  local scale="$1" x="$2" y="$3" id="$4"
  cat <<MARK
  <g transform="translate($x,$y) scale($scale)">
    <defs>
      <filter id="glow-$id" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="6"/>
      </filter>
    </defs>
    <g filter="url(#glow-$id)" stroke-width="14" stroke-linecap="round">
      <line x1="62" y1="40" x2="166" y2="100" stroke="#c834c9"/>
      <line x1="166" y1="100" x2="62" y2="160" stroke="#5b5ba1"/>
      <line x1="62" y1="160" x2="62" y2="40" stroke="#137689"/>
    </g>
    <path d="M62 40 L166 100 L62 160 Z" fill="#ffffff"/>
  </g>
MARK
}

# The brand gradient FMHY uses on its own wordmark.
wordmark_defs() {
  cat <<'DEFS'
    <linearGradient id="word" x1="0" y1="1" x2="1" y2="0">
      <stop offset="30%" stop-color="#c4b5fd"/>
      <stop offset="100%" stop-color="#7bc5e4"/>
    </linearGradient>
DEFS
}

render() { # svg-file out-bmp width height
  rsvg-convert -w "$3" -h "$4" "$1" -o "$work/tmp.png"
  # WiX and NSIS both require uncompressed 24-bit BMPs; anything else is
  # silently ignored and the stock artwork is used instead.
  magick "$work/tmp.png" -background white -alpha remove -alpha off -type TrueColor "BMP3:$2"
}

# ---- banner: light, brand panel on the right ------------------------------
cat > "$work/banner.svg" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="493" height="58" viewBox="0 0 493 58">
  <defs>$(wordmark_defs)
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#f2f2f7"/>
    </linearGradient>
  </defs>
  <rect width="493" height="58" fill="url(#bg)"/>
  <rect x="392" y="0" width="101" height="58" fill="#0d0d0d"/>
  <rect x="388" y="0" width="4" height="58" fill="#5b5ba1" opacity="0.5"/>
  $(mark 0.17 402 12 b)
  <text x="443" y="34" font-family="Segoe UI, Helvetica Neue, sans-serif" font-size="13"
        font-weight="600" fill="url(#word)">FMHY</text>
</svg>
SVG
render "$work/banner.svg" "$win/banner.bmp" 493 58

# ---- dialog: dark panel on the left, text space kept white -----------------
cat > "$work/dialog.svg" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="493" height="312" viewBox="0 0 493 312">
  <defs>$(wordmark_defs)
    <radialGradient id="bloom" cx="50%" cy="45%" r="60%">
      <stop offset="0%" stop-color="#47caff" stop-opacity="0.55"/>
      <stop offset="55%" stop-color="#7f7ae0" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="#c4b5fd" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="493" height="312" fill="#ffffff"/>
  <rect x="0" y="0" width="164" height="312" fill="#0d0d0d"/>
  <circle cx="82" cy="126" r="86" fill="url(#bloom)"/>
  $(mark 0.42 40 84 d)
  <text x="82" y="232" text-anchor="middle" font-family="Segoe UI, Helvetica Neue, sans-serif"
        font-size="17" font-weight="700" fill="url(#word)">FMHY Desktop</text>
  <text x="82" y="252" text-anchor="middle" font-family="Segoe UI, Helvetica Neue, sans-serif"
        font-size="10" fill="#8b8b93">Unofficial client</text>
  <rect x="164" y="0" width="3" height="312" fill="#5b5ba1" opacity="0.45"/>
</svg>
SVG
render "$work/dialog.svg" "$win/dialog.bmp" 493 312

# ---- NSIS header: light, mark in the top-right corner ----------------------
cat > "$work/header.svg" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="150" height="57" viewBox="0 0 150 57">
  <rect width="150" height="57" fill="#ffffff"/>
  <rect x="86" y="0" width="64" height="57" fill="#0d0d0d"/>
  $(mark 0.2 96 11 h)
</svg>
SVG
render "$work/header.svg" "$win/header.bmp" 150 57

# ---- NSIS sidebar: entirely ours -------------------------------------------
cat > "$work/sidebar.svg" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="164" height="314" viewBox="0 0 164 314">
  <defs>$(wordmark_defs)
    <radialGradient id="bloom" cx="50%" cy="42%" r="62%">
      <stop offset="0%" stop-color="#47caff" stop-opacity="0.55"/>
      <stop offset="55%" stop-color="#7f7ae0" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="#c4b5fd" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="164" height="314" fill="#0d0d0d"/>
  <circle cx="82" cy="120" r="88" fill="url(#bloom)"/>
  $(mark 0.42 40 78 s)
  <text x="82" y="228" text-anchor="middle" font-family="Segoe UI, Helvetica Neue, sans-serif"
        font-size="17" font-weight="700" fill="url(#word)">FMHY Desktop</text>
  <text x="82" y="248" text-anchor="middle" font-family="Segoe UI, Helvetica Neue, sans-serif"
        font-size="10" fill="#8b8b93">Unofficial client</text>
</svg>
SVG
render "$work/sidebar.svg" "$win/sidebar.bmp" 164 314

# ---- DMG background --------------------------------------------------------
# Sized to the Finder window declared in tauri.conf.json. Kept to large soft
# shapes: the Finder scales this to the window's points, so fine detail and
# small text would only blur.
cat > "$work/dmg.svg" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="660" height="400" viewBox="0 0 660 400">
  <defs>$(wordmark_defs)
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#121216"/><stop offset="100%" stop-color="#0a0a0c"/>
    </linearGradient>
    <radialGradient id="bloom" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#47caff" stop-opacity="0.30"/>
      <stop offset="55%" stop-color="#7f7ae0" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#c4b5fd" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="660" height="400" fill="url(#bg)"/>
  <!-- Centred on the app icon, which the bundler places at (180, 170). -->
  <circle cx="180" cy="170" r="150" fill="url(#bloom)"/>
  <text x="330" y="48" text-anchor="middle" font-family="Helvetica Neue, sans-serif"
        font-size="26" font-weight="700" fill="url(#word)">FMHY Desktop</text>
  <text x="330" y="74" text-anchor="middle" font-family="Helvetica Neue, sans-serif"
        font-size="13" fill="#7d7d87">Drag the app into Applications to install</text>
  <!-- Between the two icons, clear of both their 128px boxes. -->
  <path d="M296 170 L360 170" stroke="#4a4a55" stroke-width="3" stroke-linecap="round"/>
  <path d="M352 162 L362 170 L352 178" stroke="#4a4a55" stroke-width="3"
        stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <text x="330" y="352" text-anchor="middle" font-family="Helvetica Neue, sans-serif"
        font-size="11" fill="#55555e">Unofficial third-party client. Not affiliated with FMHY.</text>
</svg>
SVG
rsvg-convert -w 660 -h 400 "$work/dmg.svg" -o "$mac/dmg-background.png"

echo "wrote:"
for f in "$win"/*.bmp "$mac"/dmg-background.png; do
  printf '  %-44s %s\n' "${f#$root/}" "$(magick identify -format '%wx%h %m' "$f")"
done
