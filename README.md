# FMHY Desktop

An **unofficial**, third-party desktop client for [FMHY (FreeMediaHeckYeah)](https://fmhy.net).
Not affiliated with, endorsed by, or an official product of FMHY. All indexed content belongs to
the FMHY project and its contributors.

Windows · macOS · Linux.

---

## Installing

Every push builds an installer for all three platforms; releases are published from tags. Grab one
from [Releases](https://github.com/ethembeldagli/fmhy-desktop/releases).

| Platform | File |
| --- | --- |
| macOS (Apple Silicon) | `FMHY Desktop_<version>_aarch64.dmg` |
| macOS (Intel) | `FMHY Desktop_<version>_x64.dmg` |
| Windows | `FMHY Desktop_<version>_x64_en-US.msi`, or `_x64-setup.exe` |
| Debian, Ubuntu | `fmhy-desktop_<version>_amd64.deb` |
| Fedora, RHEL | `fmhy-desktop-<version>-1.x86_64.rpm` |
| Any Linux | `fmhy-desktop_<version>_amd64.AppImage` |
| Flatpak | `fmhy-desktop.flatpak` |

**Nothing is code-signed.** There is no Apple Developer or Microsoft certificate behind these
builds, so the first launch needs a nudge:

- **macOS** — right-click the app and choose Open, or
  `xattr -dr com.apple.quarantine "/Applications/FMHY Desktop.app"`
- **Windows** — SmartScreen warns; choose More info, then Run anyway

### Updating

**Settings → Updates.** The app checks once at startup so it can tell you a release exists, and
every step after that is a button — nothing downloads or installs on its own.

Releases *are* signed for the updater, which is a separate thing from OS code signing: each build
is signed with a key held by the maintainer and the app carries only the public half, so an update
that was not signed with that key is rejected before any of it runs. The manifest is the release
itself, so there is no update server to trust or keep running.

Linux updates in place only from the AppImage. A `.deb`, `.rpm` or Flatpak install belongs to the
package manager that put it there, and the app says so rather than failing obscurely.

---

## Architecture

### Browser engine: native child webviews via Tauri 2 multiwebview

External sites render in the **operating system's own webview**, embedded as a child webview
layered over the window:

| Platform | Engine |
| --- | --- |
| macOS | WKWebView |
| Windows | WebView2 (Chromium) |
| Linux | WebKitGTK (`webkit2gtk-4.1`) |

This is enabled by the `unstable` feature on the `tauri` crate (`Window::add_child` +
`WebviewBuilder`). Chosen because it is the only approach that ships no browser engine of its own,
renders JavaScript-heavy sites correctly, and is genuinely uniform across all three platforms.
Iframes were rejected outright: they are not a browser, and FMHY's own site frame-busts.

Everything engine-specific is contained in `src-tauri/src/browser/`. The rest of the app speaks in
view ids, rects and `NavigationState`.

**Two upstream constraints this layer exists to absorb:**

1. **The native session stack is reachable only asynchronously.** `Webview::with_webview` hands the
   platform handle to a callback on the UI thread and returns immediately, so back/forward state
   cannot be read inline. `browser/navigation.rs` asks the engine — `WKWebView`, `WebKitWebView`,
   `ICoreWebView2` — and pushes the answer to the chrome as an event; `browser/history.rs` models
   the stack only for the moment before the first answer arrives.

   This matters more than it sounds. An app-modelled stack traversed by re-navigating breaks
   exactly where Back is needed most: a bot check or consent interstitial redirects on the way in,
   filling the model with hops that redirect *forward* again the moment they are revisited, and a
   page that never finished loading still leaves an entry that cannot be returned to. The engine
   already knows which entries a redirect replaced rather than pushed.

   Back is two-stage: the site's own history first, then the app's route stack — so holding Back
   eventually leaves a site and returns to FMHY instead of stalling inside it. The mouse's side
   buttons run the same path (`browser/mouse.rs`), caught with an application-wide `NSEvent`
   monitor on macOS because WebKit neither acts on those buttons nor forwards them to the page.
2. **Child webviews always paint above the chrome webview.** Any overlay covering the content area
   (command palette, menus) must hide the content view first — `browser::set_overlay_active`.
   `auto_resize` is deliberately **off**: combining it with explicit positioning is a known upstream
   bug ([tauri-apps/tauri#9611](https://github.com/tauri-apps/tauri/issues/9611)), so the frontend
   is the single authority on geometry.

### Security

External content is untrusted. The `default` capability is scoped to
`"webviews": ["chrome"]`, so **content webviews have zero Tauri permissions** — a page cannot
invoke any command. Navigation is restricted to `http`/`https`; anything else (`magnet:`, custom
handlers) is blocked by the engine and raised as a consent dialog, so launching another application
is always the user's explicit choice rather than something a page can trigger.

### Overlays

Child webviews always paint *above* the chrome webview, which means any UI covering the content
area would otherwise be invisible. Two different answers, depending on intent:

- **Command palette, context menus, dialogs** hide the content view while open. Several can overlap,
  so `src/browser/overlay.ts` reference-counts them — the page returns only when the last one closes.
- **Find in page** must keep the page visible, so it occupies its own row *above* the viewport. That
  shrinks the content rect and the resize observer repositions the webview to match.

### History

Written on the Rust side from the engine's `on_navigation` handler, so it records what actually
loaded rather than what the UI requested — redirects included. Repeat visits inside a 30-minute
window collapse into one row. Recording can be paused, which is honoured at the write site rather
than by hiding rows. Nothing is ever transmitted.

### FMHY data

Sourced from FMHY's public wiki source, not scraped from the rendered site:

- `https://raw.githubusercontent.com/fmhy/edit/main/docs/<slug>.md` — the 25 wiki pages.

FMHY also publishes a concatenated `https://api.fmhy.net/single-page` endpoint, which is
edge-cached and would be one request instead of 25. It is **not** used: it joins the files without
page markers, and its per-file banner appears only 23 times, so page identity cannot be recovered
from it — and page identity is what the category UI is built on.

The markdown has a regular grammar (`# ► Page`, `## ▷ Section`, `* ⭐ **[Name](url)** - desc`), so
a line-oriented parser is used rather than a general markdown library. Cases the real corpus
forces, each covered by a test:

| Case | Count in corpus |
| --- | --- |
| Zero-width chars (U+2060/U+200B) inside link text | ~2,090 entries |
| Mirrors — `, [2](…)` and `… or [B](…)` | 7,385 |
| Supplementary links in descriptions (Discord, GitHub, …) | 4,091 |
| Starred (⭐) curated picks | 2,018 |
| Index/collection (🌐) entries | 595 |
| Cross-references (↪️) | 378 |
| Editorial notes (`* **Note** - …`) | 218 |
| `-` inside link text, which breaks a naive title split | present |

Beyond unit tests, two `#[ignore]`d tests run the parser and the full pipeline over the real
corpus and assert invariants across all ~16.6k entries:

```bash
FMHY_CORPUS=/path/to/docs cargo test corpus -- --ignored --nocapture
FMHY_CORPUS=/path/to/docs cargo test pipeline -- --ignored --nocapture
```

Stored in SQLite (`page → section → link`, plus mirrors/related) with an **FTS5** index. Measured
on the real dataset: **16,614 links across 1,073 sections indexed in ~470 ms**, and searches
returning in **under 1 ms**. User input is never interpolated into FTS5 syntax — tokens are quoted
and prefixed, so `"`, `*`, `:` and `NEAR` are searched for rather than executed. Ranking boosts
FMHY's starred entries above the rest.

Storage is cache-like and rebuilt wholesale in one transaction, so a failed sync can never leave a
half-populated index. User content (favorites, history, downloads) lives in separate tables.

### Privacy

No telemetry. History, favorites and downloads live in a local SQLite database and are never
transmitted. The only outbound requests the app makes on its own are to fetch the public FMHY
dataset.

---

## Layout

```
src/
  ui/         design system (tokens, components, shell, views)
  browser/    tab model, routes, session state
  fmhy/       FMHY catalogue + dataset layer
  search/     fuzzy matching (shared by palette and dataset search)
  platform/   the only module that talks to Tauri
src-tauri/
  browser/    engine abstraction, session history, commands
  db/         SQLite + migrations
  platform.rs per-OS window chrome
```

## Development

```bash
pnpm install
pnpm app          # run the desktop app (tauri dev)
pnpm build        # typecheck + build frontend
pnpm app:build    # produce installers
cd src-tauri && cargo test
```

### Linux build dependencies

```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

Add `rpm` for the `.rpm`, and `patchelf` plus the `gstreamer1.0-plugins-*` packages for the
AppImage, which bundles its own media framework.

### Regenerated assets

These write files that are committed, so an ordinary build runs none of them. Re-run one only when
its source artwork changes.

```bash
./scripts/build-icons.sh          # every platform's app icon, from icons/source/app-icon.png
./scripts/build-installer-art.sh  # the bitmaps the Windows and macOS installers display
node scripts/gen-emoji.mjs        # the Twemoji subset the UI uses
node scripts/gen-service-icons.mjs
```

The app icon is one static piece of artwork on all three platforms. macOS 26 can derive Dark, Clear
and Tinted styles from a layered Icon Composer `.icon`, but each derived style flattens the glow the
mark is built around, so it ships as drawn instead. Windows and Linux have no system-wide icon
style, so those two carry a light/dark switch for the *window* icon in Settings.

### Packaging

`pnpm app:build` produces every installer the host platform can make. Cross-platform builds happen
in CI — [`.github/workflows/build.yml`](.github/workflows/build.yml) builds macOS (both
architectures), Windows and Linux on every push and publishes a release from a `v*` tag. The
Flatpak is built from the `.deb` in the same run; its manifest is in
[`packaging/flatpak/`](packaging/flatpak/).

---

## Status

| Area | State |
| --- | --- |
| App shell, design system, tabs, command palette | Done |
| FMHY data layer — parse, store, FTS5 search | Done: 16,614 resources indexed |
| Native FMHY category pages | Done |
| Embedded browser — tabs, navigation, find, consent gate | Done |
| Browsing history | Done |
| Favorites | Schema exists; UI is inert |
| Downloads | Engine hook not wired |
| Discover | Not started |
| Packaging / installers | Done — see Installing |

---

## Credits and licensing

This is an **unofficial** third-party client. It is not affiliated with, endorsed by, or an
official product of FMHY.

| Component | Source | Licence |
| --- | --- | --- |
| Wiki content and structure | [fmhy/edit](https://github.com/fmhy/edit) | Content belongs to FMHY and its contributors |
| Theme values (brand scale, palette, layout) | [fmhy/edit](https://github.com/fmhy/edit) | Apache-2.0 |
| Emoji artwork | [Twemoji](https://github.com/jdecked/twemoji) via `@iconify-json/twemoji` | CC-BY 4.0 |
| Application code | this repository | MIT — see [LICENSE](LICENSE) |

Emoji are rendered as Twemoji images rather than text so that they match FMHY's site and look
identical on macOS, Windows and Linux, instead of inheriting each platform's own emoji font.
Regenerate the bundled subset with:

```bash
node scripts/gen-emoji.mjs
```

The app fetches only public FMHY content, and sends nothing anywhere. If FMHY would prefer this
client not carry their branding, or want changes to how their content is attributed, that is
straightforward to adjust — the theme is a token layer and the dataset source is a single module.
