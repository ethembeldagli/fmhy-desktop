"""
Stage the release assets and the manifest the in-app updater reads.

Collection and naming live together here on purpose. The updater fetches one
`latest.json` and follows the URLs in it, so a file staged under one name and
referenced under another is a release that installs on nobody. One script
deciding both makes that impossible.

Three things this exists to get right:

* **Both macOS builds produce the same file name.** The updater payload is
  `<productName>.app.tar.gz`, with no architecture in it, so the Intel and
  Apple Silicon tarballs collide the moment they share a directory. They are
  renamed by architecture on the way in.
* **Asset names are not file names.** GitHub rewrites spaces to dots when a
  file becomes a release asset, so "FMHY Desktop_0.1.0_aarch64.app.tar.gz" is
  served as "FMHY.Desktop_0.1.0_aarch64.app.tar.gz". A URL built from the file
  name would 404.
* **The update payload is not always the installer.** macOS updates from a
  tarball of the .app, Linux replaces the AppImage in place, and Windows reruns
  the NSIS installer. Only the last of those is also a file people download.

Usage:
    python3 scripts/stage-release.py <artifacts-dir> <release-dir> <tag> <owner/repo>

Exits non-zero if any platform is missing its payload or signature, so a
release never ships a manifest that would strand one of them on an old version.
"""

import json
import pathlib
import shutil
import sys
from datetime import datetime, timezone

#: Files that are downloads in their own right.
INSTALLERS = ("*.dmg", "*.deb", "*.rpm", "*.AppImage", "*.msi", "*.exe", "*.flatpak")

#: Updater platform key -> where its files arrive, what the payload looks like,
#: and what to rename it to. A `None` rename means the file is already
#: unambiguous and keeps the name the bundler gave it.
PLATFORMS = {
    "darwin-aarch64": ("macos-arm64", ".app.tar.gz", "FMHY Desktop_{version}_aarch64.app.tar.gz"),
    "darwin-x86_64": ("macos-x64", ".app.tar.gz", "FMHY Desktop_{version}_x64.app.tar.gz"),
    "linux-x86_64": ("linux-x86_64", ".AppImage", None),
    "windows-x86_64": ("windows-x64", "-setup.exe", None),
}


def asset_url(repo: str, tag: str, filename: str) -> str:
    """The URL GitHub will serve this file from once it is a release asset."""
    return f"https://github.com/{repo}/releases/download/{tag}/{filename.replace(' ', '.')}"


def sole_match(root: pathlib.Path, suffix: str) -> pathlib.Path:
    matches = [p for p in root.rglob(f"*{suffix}") if not p.name.endswith(".sig")]
    if not matches:
        raise FileNotFoundError(f"nothing matching *{suffix}")
    if len(matches) > 1:
        raise ValueError(f"several files match *{suffix}: {sorted(m.name for m in matches)}")
    return matches[0]


def main() -> None:
    artifacts = pathlib.Path(sys.argv[1])
    release = pathlib.Path(sys.argv[2])
    tag, repo = sys.argv[3], sys.argv[4]
    version = tag.lstrip("v")

    release.mkdir(parents=True, exist_ok=True)

    staged = []
    for pattern in INSTALLERS:
        for path in sorted(artifacts.rglob(pattern)):
            # An uploaded artifact arrives as a *directory* named after the
            # artifact, with the real file inside — and the Flatpak job names
            # its artifact "…-x86_64.flatpak", so the directory itself matches
            # the glob. Only real files are assets.
            if not path.is_file():
                continue
            shutil.copy2(path, release / path.name)
            staged.append(path.name)

    platforms = {}
    problems = []

    for key, (directory, suffix, rename) in PLATFORMS.items():
        root = artifacts / directory
        try:
            payload = sole_match(root, suffix)
        except (FileNotFoundError, ValueError) as error:
            problems.append(f"{key}: {error}")
            continue

        signature = payload.with_name(payload.name + ".sig")
        if not signature.exists():
            problems.append(f"{key}: {payload.name} was bundled without a signature")
            continue

        name = rename.format(version=version) if rename else payload.name
        if not (release / name).exists():
            shutil.copy2(payload, release / name)
            staged.append(name)

        platforms[key] = {
            "signature": signature.read_text().strip(),
            "url": asset_url(repo, tag, name),
        }

    if problems:
        print("cannot stage the release:", file=sys.stderr)
        for problem in problems:
            print(f"  {problem}", file=sys.stderr)
        raise SystemExit(1)

    manifest = {
        "version": version,
        "notes": f"See https://github.com/{repo}/releases/tag/{tag}",
        "pub_date": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "platforms": platforms,
    }
    (release / "latest.json").write_text(json.dumps(manifest, indent=2) + "\n")

    print(f"staged {len(staged)} assets into {release}/:")
    for name in sorted(set(staged)):
        print(f"  {name}")
    print("\nupdate manifest:")
    for key, entry in manifest["platforms"].items():
        print(f"  {key:<16} {entry['url'].rsplit('/', 1)[-1]}")


if __name__ == "__main__":
    main()
