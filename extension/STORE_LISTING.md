# Chrome Web Store listing

Copy-paste text for the [Developer Dashboard](https://chrome.google.com/webstore/devconsole). Upload `release/pixel-buddy-extension-<version>.zip` from `npm run ext:zip`.

## Store listing

**Name:** Pixel Buddy (from the manifest)

**Summary** (from the manifest, 132 characters max): A friendly companion in your browser tabs with gentle break and hydration reminders.

**Category:** Productivity → Tools

**Language:** English

**Description:**

```
Meet Pixel Buddy, a tiny robot that sits in the corner of your browser tabs and helps you take better care of yourself while you work.

• Gentle break reminders: pick Pomodoro (25/5), Balanced (55/5), Deep focus (90/10), or set your own timings. Take a break, snooze, or skip.
• Hydration reminders: track glasses of water toward a daily goal.
• Smart monitoring: your focus timer pauses when you step away and resets after a real offline break.
• One timer everywhere: every tab shares the same buddy and timer. Drag the buddy anywhere and it stays there.
• At a glance: the toolbar icon counts down the minutes to your next break.
• Daily dashboard: focus minutes, breaks taken, and water glasses.
• Make it yours: choose a theme color and the name your buddy greets you by.
• Never in the way: clicks pass through the space around the buddy. Hide it with one switch from the toolbar.

Private by design: no account, no analytics, no tracking. Your settings stay in your browser.

Free and open source (MIT). A desktop app for Windows, macOS, and Linux is also available.
```

**Graphics** (PNG, ready in `extension/store-assets/`):
- Store icon, 128×128: `store-icon-128.png` (same as `extension/public/icons/icon-128.png`)
- Screenshots, 1280×800, in this order: `screenshot-1-focus.png`, `screenshot-2-break-reminder.png`, `screenshot-3-break.png`, `screenshot-4-water.png`, `screenshot-5-settings.png`
- Small promo tile, 440×280: `promo-small-440x280.png`
- Marquee promo tile, 1400×560: `promo-marquee-1400x560.png`

The screenshots are the real extension on an invented demo page (`store-assets/src/demo.html`); the tiles are rendered from `store-assets/src/promo.html` (`?size=small` or `?size=marquee`).

**Homepage URL:** https://harshit-kandoi.github.io/pixel-buddy/ **Support URL:** https://github.com/Harshit-Kandoi/pixel-buddy/issues

## Privacy practices

**Single purpose:**

```
Pixel Buddy shows a small companion on web pages that reminds the user to take breaks and drink water, based on a focus timer the user configures.
```

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| `storage` | Saves the user's timer settings, daily counters, and the buddy's on-screen position locally. |
| `idle` | Pauses the focus timer while the user is away from the computer and recognizes when they return from a break. |
| `alarms` | Wakes the extension's background service worker periodically so the break timer keeps running accurately. |
| `offscreen` | Plays the short break reminder chime once from an offscreen audio document, instead of in every open tab. |
| `notifications` | Shows break and water reminders when no visible tab is displaying the buddy. |
| Host permission (content script on `<all_urls>`) | Displays the buddy companion overlay on the web pages the user visits, which is the extension's core feature. It only detects that keyboard or mouse activity happened, to end breaks early with smart monitoring. It never reads page content or what the user types. |

**Remote code:** No, I am not using remote code.

**Data usage:** Check **none** of the data categories. Then certify all three statements: no selling of data, no use unrelated to the single purpose, and no use for creditworthiness or lending.

**Privacy policy URL:** https://harshit-kandoi.github.io/pixel-buddy/privacy.html (source: `website/dist/privacy.html`, published with the website).

## After approval

Paste the listing URL into `chromeStoreUrl` at the top of the Chrome section in `website/dist/app.js`. The website's Chrome card then becomes an **Add to Chrome** button.

## Releasing an update

1. Bump `"version"` in `extension/public/manifest.json`.
2. Run `npm run ext:zip`.
3. Dashboard → Pixel Buddy → **Package** → **Upload new package** → **Submit for review**.
