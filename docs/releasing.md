# Publishing the Pixel Buddy freebie

The source contains the app improvements, promotional website, a desktop build workflow, and a verified Bash downloader. No GitHub release or public website is created by editing these files locally.

## 1. Put the changes on GitHub

Review and commit the changes, then merge them to `main`. The website's Bash command reads `scripts/download.sh` from `main`, so that file must exist on GitHub before you share the command.

Run `npm test` and `npm run build` first. Desktop tests cover reset, snooze and break behavior, disabled monitoring, offline breaks, hydration changes, daily resets, release asset selection, and checksum rejection. Windows and Linux installer builds must be checked on their target systems.

## 2. Build the first release

Keep the version in `package.json` and `package-lock.json` synchronized. The tag must equal `v` followed by that version; the workflow validates this. For the current `1.0.0` version, after your changes are merged:

```bash
git tag v1.0.0
git push origin v1.0.0
```

If that tag already exists, increment the package version before tagging a new release. Do not replace a published tag.

The `Build desktop release` workflow builds:

- `pixel-buddy-1.0.0-windows-x64.exe`
- `pixel-buddy-1.0.0-mac-arm64.dmg`
- `pixel-buddy-1.0.0-mac-x64.dmg`
- `pixel-buddy-1.0.0-linux-x64.AppImage`
- `pixel-buddy-1.0.0-linux-x64.deb`
- `SHA256SUMS`

The release job starts only after all build jobs pass. It creates a draft. A manual workflow run builds downloadable Actions artifacts without creating a release.

Download and open each installer on a matching OS. Check launch, buddy display, presets, water logging, optional permission, tray controls, and quitting. macOS packaging needs a Mac; Linux packaging uses the Ubuntu runner; Windows packaging uses the Windows runner.

These builds are unsigned because no signing credentials are configured. See [code signing](code_signing.md) to add signing before a broader distribution. Keep signing credentials in repository secrets, never in source.

## 3. Publish the draft

Open the repository's Releases page, inspect the draft's files and notes, and publish it as a regular release (not a prerelease). The website and downloader use GitHub's latest published release API. Draft and prerelease builds are not selected.

The website shows available files from the API. Missing builds get a clear status and a Releases link. The Bash downloader requires exactly one matching installer plus `SHA256SUMS`; it stops if either is missing or a checksum differs.

## 4. Host the website publicly

In the repository's **Settings → Pages**, choose **GitHub Actions** as the publishing source. Run `Publish download website`, or push a website change to `main`. The workflow deploys only `website/dist/`.

The default project Pages address is `https://harshit-kandoi.github.io/pixel-buddy/`, unless the repository's Pages configuration uses a custom domain. Treat the workflow's successful deployment URL as the verified address.

The site also has an owner-private Sites project reserved in `website/.openai/hosting.json`. Its initial source upload was not approved, and it has not been deployed. That reserved address is not a public giveaway link. GitHub Pages is the included public hosting route.

## 5. Share

Share the verified public website link or `https://github.com/Harshit-Kandoi/pixel-buddy/releases`. Visitors can choose their device without giving an email address. The project is MIT licensed; include `LICENSE` when redistributing source or binaries.
