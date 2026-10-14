# Publishing the Pixel Buddy freebie

The source contains the app improvements, promotional website, a desktop build workflow, and a verified Bash downloader. No GitHub release or public website is created by editing these files locally.

## 1. Put the changes on GitHub

Review and commit the changes, then merge them to `main`. The website's Bash command reads `scripts/download.sh` from `main`, so that file must exist on GitHub before you share the command.

Run `npm ci`, `npm test`, and `npm run build` first. Desktop tests cover reset, snooze and break behavior, disabled monitoring, offline breaks, hydration changes, daily resets, release asset selection, and checksum rejection.

Keep the repository **public**: GitHub's standard hosted runners are free for public repositories. The release workflow skips private repositories to avoid billable usage. It uses no larger runners, paid signing services, Apple membership, or custom secrets. Intermediate artifacts expire after three days; published GitHub release assets remain available. See [GitHub runner billing](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

## 2. Build a release

Keep the version in `package.json` and `package-lock.json` synchronized. The tag must equal `v` followed by the version **in the tagged commit**; the workflow validates both files and the tag. Changing only the tag name does not update the application's version.

For each new release, choose an unused version and update both files before committing. For example:

```bash
npm version 1.0.4 --no-git-tag-version
```

If the files already contain that version, skip this command. Review, commit, and push the version files together with all release fixes. Run the workflow manually against `main` and check all four build jobs before creating the tag. From the same tested commit, derive the tag from the package version:

```bash
release_tag="v$(node -p "require('./package.json').version")"
git tag "$release_tag"
git push origin "$release_tag"
```

If that tag already exists, choose an unused version and repeat the version update and commit steps. Do not force-push existing tags. Re-running a failed tag uses its original commit; it does not pick up fixes pushed to `main`.

The `Build desktop release` workflow builds:

- `pixel-buddy-<version>-windows-x64.exe`
- `pixel-buddy-<version>-mac-arm64.dmg`
- `pixel-buddy-<version>-mac-x64.dmg`
- `pixel-buddy-<version>-linux-x86_64.AppImage`
- `pixel-buddy-<version>-linux-amd64.deb`
- `SHA256SUMS`

The release job starts only after all build jobs pass. It verifies each platform's checksums, requires all five current-version installers, and creates a draft with a combined `SHA256SUMS`. A manual run (**Actions → Build desktop release → Run workflow**) builds downloadable artifacts with per-platform checksums without creating a release, even when run against a tag. Start with a manual run before tagging.

Windows x64 builds on `windows-2022`, Apple silicon on `macos-15`, and Intel Mac on `macos-15-intel`. Each job uses Node 22, `npm ci`, the existing build scripts, an explicit target architecture, and `--publish never`. Linux builds remain on `ubuntu-22.04`. The lockfile includes the build tool's required transitive packages; existing dependency versions and application behavior are preserved.

Mac jobs verify and mount the DMG, copy the app out, and launch that copy. Windows runs the actual NSIS installer silently in a temporary directory and launches the installed EXE. The smoke script checks React rendering, preload/settings/scheduler IPC, native `uiohook-napi` loading, and normal quit. It uses a temporary loopback debugging endpoint only for that test invocation, without modifying the shipped application. The script is restricted to disposable GitHub runners because normal app startup initializes settings and login items.

These are startup checks of locally built files, not proof that internet-downloaded apps pass Gatekeeper, SmartScreen, or every enterprise policy. Linux receives build and unit-test checks, not a graphical smoke test. Permissions, tray interactions, and reminders still require a real-desktop check.

Download and open each installer on a matching OS. Check launch, buddy display, presets, water logging, optional permission, tray controls, and quitting. macOS packaging needs a Mac; Linux packaging uses the Ubuntu runner; Windows packaging uses the Windows runner.

These builds intentionally have no trusted signature or notarization. See [security limitations](code_signing.md) for warnings that cannot be removed under this zero-cost approach. Do not disable OS security protections to test them.

### Local builds and checksums

Use the matching host OS. The Mac command without an architecture flag still produces both architectures as before; CI splits them so each is tested natively.

```bash
npm run build:mac -- --x64 --publish never
npm run build:mac -- --arm64 --publish never
npm run build:win -- --x64 --publish never
npm run release:checksums
```

Use a clean `release/` directory, or pass a separate output directory to electron-builder with `--config.directories.output=release-check` and then run `npm run release:checksums -- release-check`. The checksum command rejects stale versions and unrelated installers; move old artifacts aside rather than mixing releases. It hashes only installers, excluding blockmaps and unpacked directories. To require the complete five-installer release, run `node scripts/release-checksums.mjs installers --all`.

### Verify a download

Download the installer and `SHA256SUMS` from the same official release into one directory. For example, in macOS Terminal:

```bash
shasum -a 256 pixel-buddy-1.0.1-mac-arm64.dmg
```

Compare the entire 64-character result with the entry for that exact filename in `SHA256SUMS`. For a directory containing all files listed in the manifest, use `shasum -a 256 -c SHA256SUMS` (macOS) or `sha256sum -c SHA256SUMS` (Linux).

On Windows, PowerShell can compare the exact entry automatically:

```powershell
$file = 'pixel-buddy-1.0.1-windows-x64.exe'
$entries = @(Get-Content .\SHA256SUMS | Where-Object { $_ -match ('^[a-fA-F0-9]{64}  ' + [regex]::Escape($file) + '$') })
if ($entries.Count -ne 1) { throw 'Missing or ambiguous checksum entry' }
$expected = $entries[0].Substring(0, 64)
if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ine $expected) { throw 'Checksum mismatch' }
'Checksum verified'
```

Stop if verification fails. Checksums establish file integrity relative to the manifest, not publisher identity or malware clearance. The existing Bash downloader performs this verification automatically.

## 3. Publish the draft

Open the repository's Releases page, inspect the draft's files and notes, and publish it as a regular release (not a prerelease). The website and downloader use GitHub's latest published release API. Draft and prerelease builds are not selected.

The website shows available files from the API. Missing builds get a clear status and a Releases link. The Bash downloader requires exactly one matching installer plus `SHA256SUMS`; it stops if either is missing or a checksum differs.

## 4. Host the website publicly

In the repository's **Settings → Pages**, choose **GitHub Actions** as the publishing source. Run `Publish download website`, or push a website change to `main`. The workflow deploys only `website/dist/`.

The default project Pages address is `https://harshit-kandoi.github.io/pixel-buddy/`, unless the repository's Pages configuration uses a custom domain. Treat the workflow's successful deployment URL as the verified address.

The site also has an owner-private Sites project reserved in `website/.openai/hosting.json`. Its initial source upload was not approved, and it has not been deployed. That reserved address is not a public giveaway link. GitHub Pages is the included public hosting route.

## 5. Share

Share the verified public website link or `https://github.com/Harshit-Kandoi/pixel-buddy/releases`. Visitors can choose their device without giving an email address. The project is MIT licensed; include `LICENSE` when redistributing source or binaries.
