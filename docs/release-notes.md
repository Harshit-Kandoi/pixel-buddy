Free desktop companion for Windows x64, macOS Apple silicon/Intel, and Linux x64.

Download the installer for your device and `SHA256SUMS`. See the repository's `docs/releasing.md` for verification commands.

These releases have no trusted publisher signature or Apple notarization. macOS may report that Apple cannot verify the developer or check the app for malware. Windows may show Unknown publisher or SmartScreen warnings; restrictive policies may block it. Checksums verify the downloaded bytes, not publisher identity or safety. Do not disable operating-system security protections.

Windows and both Mac builds must pass installer and app startup smoke checks before this draft is created. Those checks run on locally built files and do not establish Gatekeeper/SmartScreen approval of browser downloads. Linux receives build and unit-test checks. Before publishing, manually check each installer on its target OS, including the buddy, settings, reminders, tray, optional monitoring permissions, and quit behavior.
