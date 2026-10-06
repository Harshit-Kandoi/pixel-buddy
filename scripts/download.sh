#!/usr/bin/env bash
# Download a released desktop installer. Requires curl and Python 3.
set -euo pipefail
repo='Harshit-Kandoi/pixel-buddy'
platform='auto'
outdir='.'
usage() {
  cat <<'HELP'
Pixel Buddy — download a free desktop companion
Usage: bash download.sh [--platform auto|windows|mac-arm64|mac-x64|linux|linux-deb] [--output DIRECTORY]
Downloads the latest published GitHub release and verifies its SHA-256 checksum.
Does not run the installer. Requires curl and Python 3.
HELP
}
while [ "$#" -gt 0 ]; do
  case "$1" in
    --platform|--output)
      if [ "$#" -lt 2 ]; then usage >&2; exit 2; fi
      if [ "$1" = '--platform' ]; then platform="$2"; else outdir="$2"; fi
      shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done
for tool in curl python3; do
  command -v "$tool" >/dev/null || { echo "Please install $tool first." >&2; exit 1; }
done
if [ "$platform" = 'auto' ]; then
  case "$(uname -s)" in
    Darwin) case "$(uname -m)" in arm64) platform='mac-arm64' ;; x86_64) platform='mac-x64' ;; *) echo 'Unsupported Mac architecture.' >&2; exit 1 ;; esac ;;
    Linux) case "$(uname -m)" in x86_64) platform='linux' ;; *) echo 'Linux builds currently require x64.' >&2; exit 1 ;; esac ;;
    MINGW*|MSYS*|CYGWIN*) platform='windows' ;;
    *) echo 'Choose your device with --platform. See --help.' >&2; exit 1 ;;
  esac
fi
case "$platform" in windows|mac-arm64|mac-x64|linux|linux-deb) ;; *) echo 'Unsupported platform. See --help.' >&2; exit 2 ;; esac
workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT
api="https://api.github.com/repos/$repo/releases/latest"
if ! curl --fail --silent --show-error --location --retry 2 --connect-timeout 15 --max-time 90 "$api" -o "$workdir/release.json"; then
  echo "No release could be downloaded. Check https://github.com/$repo/releases" >&2
  exit 1
fi
python3 - "$workdir/release.json" "$platform" "$workdir" <<'PY'
import json, pathlib, re, sys
release_file, platform, destination = sys.argv[1:]
patterns = {'windows': r'windows-x64\.exe$', 'mac-arm64': r'mac-arm64\.dmg$', 'mac-x64': r'mac-x64\.dmg$', 'linux': r'linux-x64\.AppImage$', 'linux-deb': r'linux-(x64|amd64)\.deb$'}
assets = json.loads(pathlib.Path(release_file).read_text()).get('assets', [])
selected = [a for a in assets if a.get('state') == 'uploaded' and a.get('name', '').startswith('pixel-buddy-') and re.search(patterns[platform], a['name'])]
checksums = [a for a in assets if a.get('state') == 'uploaded' and a.get('name') == 'SHA256SUMS']
if len(selected) != 1 or len(checksums) != 1:
    sys.exit('This release has no matching installer or SHA256SUMS. Please check GitHub Releases.')
for key, asset in [('installer', selected[0]), ('checksums', checksums[0])]:
    url = asset.get('browser_download_url', '')
    if not url.startswith('https://github.com/Harshit-Kandoi/pixel-buddy/releases/download/'):
        sys.exit('Unexpected download URL in release.')
    pathlib.Path(destination, key + '.url').write_text(url)
name = selected[0]['name']
if not re.fullmatch(r'[A-Za-z0-9._-]+', name):
    sys.exit('Invalid installer filename.')
pathlib.Path(destination, 'filename').write_text(name)
PY
filename=$(cat "$workdir/filename")
mkdir -p "$outdir"
if [ -e "$outdir/$filename" ]; then echo "Already exists: $outdir/$filename. Choose a different --output directory." >&2; exit 1; fi
printf 'Downloading %s…\n' "$filename"
curl --fail --silent --show-error --location --retry 2 --connect-timeout 15 --max-time 1800 "$(cat "$workdir/installer.url")" -o "$workdir/$filename"
curl --fail --silent --show-error --location --retry 2 --connect-timeout 15 --max-time 90 "$(cat "$workdir/checksums.url")" -o "$workdir/SHA256SUMS"
python3 - "$workdir" "$filename" "$outdir" <<'PY'
import hashlib, pathlib, shutil, sys
working, name, output = sys.argv[1:]
working = pathlib.Path(working)
lines = (working / 'SHA256SUMS').read_text().splitlines()
expected = [parts[0] for line in lines if len(parts := line.split()) == 2 and parts[1].lstrip('*') == name]
with (working / name).open('rb') as stream:
    hasher = hashlib.sha256()
    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
        hasher.update(chunk)
    digest = hasher.hexdigest()
if len(expected) != 1 or digest.lower() != expected[0].lower():
    sys.exit('Checksum verification failed. The download was not saved.')
dest = pathlib.Path(output) / name
with dest.open('xb') as target, (working / name).open('rb') as source:
    shutil.copyfileobj(source, target)
print(f'Verified and saved: {dest.resolve()}')
print('Open the installer when ready. On Linux: chmod +x the AppImage, then open it.')
PY
