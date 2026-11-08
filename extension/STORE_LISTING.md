# Chrome Web Store listing

Copy-paste text for the [Developer Dashboard](https://chrome.google.com/webstore/devconsole). Upload `release/pixel-buddy-extension-<version>.zip` from `npm run ext:zip`.

## Store listing

**Name** (from the manifest, 75 characters max): Pixel Buddy – Break & Water Reminder, Pomodoro Timer

**Summary** (from the manifest, 132 characters max): A cute buddy in your tabs that reminds you to take breaks, drink water and rest your eyes. Guided stretches, Pomodoro, no login.

The name and summary carry the phrases people search for (break reminder, water reminder, Pomodoro, eye strain). Keep "Pixel Buddy" first so the brand stays recognizable.

**Category:** Lifestyle → Well-being (less crowded than Productivity → Tools, and a closer match)

**Language:** English

**Description:**

```
Pixel Buddy is a cute little robot that lives in the corner of your browser tabs and reminds you to take breaks, drink water, and rest your eyes, so long workdays feel a little kinder.

🧘 GUIDED BREAKS, NOT JUST ALERTS
When it's break time, your buddy leads you through a short routine and acts it out with you:
• Stretch with me: reach up, side bends, shoulder rolls
• Eye refresh: the 20-20-20 rule to ease screen eye strain
• Breathe with me: slow breathing that follows the buddy's rhythm

⏰ BREAK REMINDERS THAT FIT YOUR DAY
• Pomodoro (25/5), Balanced (55/5), Deep focus (90/10), or your own timings
• Take a break, snooze, or skip
• Smart pause: the focus timer stops when you step away and resets after a real break
• The toolbar icon counts down the minutes to your next break

💧 WATER REMINDERS
• Gentle hydration nudges and a daily goal of glasses of water
• Log a glass any time in one tap, even ones you drank away from your desk

🎁 LIMITED-TIME FESTIVAL BUDDIES
• During a festival, your buddy turns into a one-of-a-kind festive character, with greetings to match
• Take 3 breaks while it lasts to claim it and keep it forever. Miss it, and it's gone until next year
• Nine festivals a year: New Year, Sankranti & Pongal, Lunar New Year, Eid, Holi, Onam, Halloween, Diwali, and Christmas
• Choose a theme color and the name your buddy greets you by

📸 SHARE YOUR DAY
• Turn today's focus time, breaks, and water into a picture to share on LinkedIn, X, or with friends

🌿 NEVER IN THE WAY
• One buddy and one timer across all your tabs. Drag it anywhere.
• Clicks pass through the space around it. Hide it with one switch.

🔒 PRIVATE BY DESIGN
No account, no analytics, no tracking. Your settings stay in your browser. It never reads the pages you visit.

Free and open source (MIT). Also available as a desktop app for Windows, macOS, and Linux: https://harshit-kandoi.github.io/pixel-buddy/

Great for remote workers, developers, students, and anyone who forgets to look away from the screen.
```

**Graphics** (PNG, ready in `extension/store-assets/`):
- Store icon, 128×128: `store-icon-128.png` (same as `extension/public/icons/icon-128.png`)
- Screenshots, 1280×800, in this order: `screenshot-1-guided-break.png`, `screenshot-2-festive.png`, `screenshot-3-break-reminder.png`, `screenshot-4-share.png`, `screenshot-5-water.png`
- Small promo tile, 440×280: `promo-small-440x280.png`
- Marquee promo tile, 1400×560: `promo-marquee-1400x560.png`

The screenshots show the real app UI (zoomed 1.4× so it reads in store thumbnails) on an invented demo page, with a caption band. Regenerate them with `npm run ext:screenshots` (scenes in `store-assets/src/shots/`); the tiles are rendered from `store-assets/src/promo.html` (`?size=small` or `?size=marquee`).

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

## Listing

Live at https://chromewebstore.google.com/detail/pixel-buddy/ikggibbkgbebflafmlaihlmdpibpdggc. The website's Chrome card and hero link point there (`website/dist/index.html`).

## Releasing an update

Merging to `main` builds, tests, and versions the extension automatically, and attaches `pixel-buddy-extension-<version>.zip` to that version's [GitHub release](https://github.com/Harshit-Kandoi/pixel-buddy/releases). Then:

1. Download the zip from the release.
2. Dashboard → Pixel Buddy → **Package** → **Upload new package** → choose the zip → **Submit for review**.
3. If the release changed what the listing shows, update the description and screenshots too (`npm run ext:screenshots` regenerates them).

To build the zip by hand instead: bump `"version"` in `extension/public/manifest.json`, run `npm run ext:test`, then `npm run ext:zip`; the zip is in `release/`.

## Microsoft Edge Add-ons

Edge runs the same Manifest V3 build, so upload the same `release/pixel-buddy-extension-<version>.zip` (run `npm run ext:test` first). The extension uses only APIs Edge supports (`storage`, `idle`, `alarms`, `offscreen`, `notifications`, `action`). The automated dry run uses Chrome; give the build a quick manual check in Edge before submitting (load `out/extension` from `edge://extensions` with **Developer mode** on).

1. Sign in to [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview) and register as an Edge extension developer (free).
2. **Create new extension** and upload the zip.
3. **Availability:** Public, all markets.
4. **Properties:** category Productivity; privacy policy URL and website as above; no mature content.
5. **Store listings:** reuse the name, summary, description, screenshots, and 128px icon from the Chrome listing above. Edge asks for a 300×300 logo too: use `store-assets/store-icon-128.png` upscaled, or render one from `store-assets/src/promo.html`.
6. **Submit**. Edge reviews usually take a few business days.

After approval, paste the listing URL into `EDGE_ADDONS_URL` in `src/utils/links.ts` (Edge users' "Rate" button then opens it instead of the Chrome Web Store reviews), add an Edge card on the website next to Chrome, and release a new extension version.

