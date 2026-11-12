# 📋 Pixel Buddy Roadmap & TODO

Where Pixel Buddy stands, what's waiting on you (accounts and store dashboards), and ideas for later.

---

## ✅ Done

- **Desktop app** (Electron, React, TypeScript): click-through always-on-top window, drag anywhere (position kept per display), tray menu, start on boot.
- **Break engine**: work, break reminder, break, snooze, skip and idle states. Smart monitoring pauses focus while you're away (away time is a setting, 2–15 minutes), recognizes offline breaks, and ends a break only on steady activity (using the buddy itself doesn't count).
- **Quiet during calls**: break and water reminders wait until a call ends, and a quiet call doesn't count as being away. Windows: any app using the microphone. macOS: Zoom meetings. Extension: any tab on a call (live camera/mic stream, Meet or Zoom pages).
- **Break notes**: type what you were doing at the break reminder, see it when you're back; listed and exportable in the dashboard; synced through Chrome sync in the extension.
- **Open at Login**: a switch in Settings and the tray, and the app makes the system match it at every launch (fixes it silently not registering).
- **Moods**: 🎧 on a call, ✨ after a finished break, 😪 after a skipped or snoozed break or 90 minutes of focus (static badges, no battery cost). Click a badge to see why; a Buddy Moods switch turns them off.
- **Multiple monitors**: a saved position on a missing or resized screen is pulled back on screen at launch, and the buddy follows when a monitor is unplugged or rearranged.
- **Guided breaks**: stretch, 20-20-20 eye refresh and breathing routines the buddy acts out, then rotating tips.
- **Water**: reminders, daily goal, and "+ Add a glass" from the dashboard or the extension's toolbar popup.
- **Dashboard and Share my day**: daily focus, breaks and water, plus a shareable picture (festival-themed during festivals).
- **Avatars**: classic buddy, any custom PNG, GIF, WebP, JPG, AVIF, SVG or green-screen MP4/MOV/WebM (desktop), with a "Which format?" guide and a warning when a picture has a fake checkerboard or solid background.
- **Limited-time festival buddies**: nine festivals with their own characters and greetings (dates through 2030). Take 3 breaks during a festival to claim its buddy; the website teases the next one.
- **Battery**: the buddy rests after 20 s idle (about 1–2% CPU), festive animations play only briefly, videos pause and GIFs freeze while resting, and the app suggests a lighter avatar on battery power.
- **Chrome extension**: the same app in every tab, published on the Chrome Web Store, with a welcome page on first install, a one-time rating prompt, and a one-question survey on uninstall.
- **Website** (Netlify, pixelbuddy.harshitkandoi.in): downloads from the latest release, Add to Chrome, festival section, first-launch help for unsigned installers, and the uninstall survey (Netlify Forms → `uninstall`).
- **Release pipeline**: every merge to main is tagged v1.x.y (main is never pushed to), installers are built, tested and published, the extension is dry-run and its zip attached. GitHub download outages fall back to a checksum-verified mirror. Forks don't deploy or release.
- **Quality**: 95 unit tests, an end-to-end extension dry run (`npm run ext:test`), store screenshot rendering (`npm run ext:screenshots`), zero lint errors, and a Checks workflow on every pull request.

---

## 🙋 Waiting on you (accounts and dashboards)

- `[ ]` **Lock `main`**: in the "Protect Main Branch" ruleset, turn on *Require a pull request before merging* and *Require status checks to pass* → `checks`.
- `[ ]` **Chrome Web Store**: upload the latest extension zip from GitHub Releases, paste the description and category from `extension/STORE_LISTING.md`, and upload the five screenshots in `extension/store-assets/`. Set the homepage to `https://pixelbuddy.harshitkandoi.in/` and the privacy policy to `https://pixelbuddy.harshitkandoi.in/privacy.html`.
- `[ ]` **Refresh the promo tiles** (440×280 and 1400×560); they still show only the classic green buddy.
- `[ ]` **Hindi store listing**.
- `[ ]` **Microsoft Edge Add-ons**: steps in `extension/STORE_LISTING.md`; then set `EDGE_ADDONS_URL` in `src/utils/links.ts`.
- `[ ]` **Signing the desktop installers** (removes the "Apple could not verify" / SmartScreen warnings): Apple Developer Program for macOS (paid); SignPath Foundation (free for open source, by application) or Microsoft Store for Windows. See `docs/code_signing.md`.
- `[ ]` **Check Open at Login after updating the desktop app**: open Pixel Buddy once, then look in System Settings → General → Login Items (macOS) or Task Manager → Startup apps (Windows). macOS may ask you to allow it the first time.
- `[ ]` **Try "Quiet during calls" on a real call**: Windows (any call app) and macOS (Zoom). It was tested with automated checks and a simulated video call in Chrome, not a real meeting.
- `[ ]` **Festival dates after 2030**: the Checks and release runs warn 9 months before a moon-based festival runs out of dates; add the next years to `src/utils/seasons.ts` and `website/dist/festivals.mjs`.

---

## 💡 Ideas for later

- **Calls on macOS beyond Zoom**: Teams, Slack and FaceTime calls aren't detected on macOS (no microphone check without a native helper). A small signed helper could read "microphone in use" from Core Audio.
- **Notes between the desktop app and the extension**: an Export / Import, or Google Drive sync if people ask for it (needs Google sign-in and verification, and changes the privacy promise).
- **Meeting-aware from the calendar**: hold reminders during calendar events (needs a calendar sign-in, so only if people ask for it).
- **Formatting**: about 2,100 Prettier warnings (quotes and spacing) remain; run `npm run format` in its own commit if you want them gone.

---

## ⚠️ Known limits

- **macOS Accessibility permission**: smart monitoring's global input hook needs it; without it the app falls back to system idle time.
- **Unsigned installers**: macOS and Windows warn on first launch (see the website's first-launch steps).
- **Custom avatars are desktop-only**: the extension uses the built-in buddies.
- **Video transparency**: green-screen videos are keyed on the GPU; a background drawn as a checkerboard can't be keyed. Use a real green screen or a video with an alpha channel.
