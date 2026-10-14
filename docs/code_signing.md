# Free releases and operating-system security

Pixel Buddy's release workflow uses no signing certificates, Apple Developer membership, paid signing service, or signing secrets. The only release credential is GitHub's automatic, short-lived `GITHUB_TOKEN`.

## macOS

`electron-builder.yml` explicitly sets `mac.identity: null` and `mac.notarize: false`. This preserves the unsigned release channel and avoids accidentally using a developer certificate installed on a maintainer's Mac. The existing entitlements file is retained for compatibility; it is not a substitute for a trusted signature.

Apple may display “Apple could not verify” / “developer cannot be verified” warnings or block a downloaded application. A successful build or local startup test does not establish Gatekeeper approval. Removing these warnings for normal internet distribution requires a trusted Developer ID signature and Apple notarization, which are outside this zero-cost process. An ad-hoc signature would not establish publisher identity or replace notarization.

Do not remove quarantine attributes, disable Gatekeeper, turn off SIP, or re-sign downloaded copies as an installation workaround. If macOS blocks an installer, leave its protections enabled. An actual malware or damaged-app alert should be investigated, not dismissed as routine unsigned-app behavior.

Optional Accessibility permission for smart monitoring is separate from signing. Granting it does not make the app trusted or notarized. Basic idle detection is available without that permission.

## Windows

The existing x64 NSIS EXE retains its icon, version metadata, and per-user installation behavior. CI disables certificate auto-discovery and provides no signing credentials. Keep electron-builder's default executable resource editing enabled; disabling `signAndEditExecutable` would also remove branding/version edits.

Unsigned downloads can show **Unknown publisher**, **Windows protected your PC**, or other Microsoft Defender SmartScreen warnings. Smart App Control or an organization's policy may block execution. These cannot be reliably eliminated by packaging changes or checksums. A trusted Authenticode signature establishes publisher identity, but even a newly signed app can still receive SmartScreen reputation warnings.

Do not disable Defender, SmartScreen, Smart App Control, or organizational policies. This workflow neither changes those protections nor promises that unsigned installers can run under every policy.

## What checksums prove

`SHA256SUMS` detects a damaged or altered download relative to the published manifest. It does not prove the publisher's identity, establish that an app is malware-free, or protect against an attacker who replaces both installer and manifest. Get both files from this project's official GitHub release over HTTPS.

## References

- [Apple: Safely open apps on your Mac](https://support.apple.com/en-us/102445)
- [Microsoft: SmartScreen reputation for Windows app developers](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)
- [electron-builder v26 macOS configuration](https://www.electron.build/v26/docs/mac/)
- [GitHub-hosted runner availability and billing](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
