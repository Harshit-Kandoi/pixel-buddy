// End-to-end dry run of the built Chrome extension in a throwaway headless Chrome profile:
// install, buddy on a real web page, guided break, settings and festival calendar, water
// logging, share card, rating prompt, a real one-minute break, the toolbar popup, and an
// upgrade from 1.0.0 settings. Uses real mouse clicks through the click-through overlay.
//
// Usage: npm run ext:test            (builds first; about 90 seconds)
//        npm run ext:test -- --quick  (skips waiting for a real one-minute break)
// Needs Google Chrome 126+ (set CHROME_PATH if it isn't in the usual place). Your own Chrome
// profile is never touched.
/* eslint-disable @typescript-eslint/explicit-function-return-type -- Node runs this plain JavaScript directly. */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { activeFestival, nextOfEach } from "../website/dist/festivals.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXTENSION = resolve(root, "out/extension");
const QUICK = process.argv.includes("--quick");
const PORT = 8766;
const CHROME =
  process.env.CHROME_PATH ??
  [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  ].find((p) => existsSync(p));
if (!CHROME) throw new Error("Chrome not found. Set CHROME_PATH.");
if (!existsSync(join(EXTENSION, "manifest.json"))) throw new Error("No build in out/extension. Run npm run ext:build first.");

const results = [];
const errors = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};

// What the calendar should show today (the website's copy of the app calendar; a unit test
// keeps the two in sync).
const now = new Date();
const festivalNow = activeFestival(now)?.festival ?? null;
const comingUp = nextOfEach(now).filter((o) => o.firstDay > now).slice(0, 3).map((o) => o.festival.name);

// A plain web page for the content script to run on.
const site = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end('<!doctype html><title>Test page</title><body style="font:16px sans-serif;padding:40px"><h1>Some website</h1><button id="b">Page button</button></body>');
}).listen(PORT, "127.0.0.1");

const profile = await mkdtemp(join(tmpdir(), "pixel-buddy-e2e-"));
const downloads = await mkdtemp(join(tmpdir(), "pixel-buddy-e2e-downloads-"));
const chrome = spawn(
  CHROME,
  ["--headless=new", "--remote-debugging-pipe", "--enable-unsafe-extension-debugging", `--user-data-dir=${profile}`, "--no-first-run", "--window-size=1280,800", "about:blank"],
  { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] },
);

// DevTools protocol over the pipe: NUL-separated JSON messages.
let nextId = 0;
let buffer = "";
const pending = new Map();
chrome.stdio[4].on("data", (chunk) => {
  buffer += chunk.toString();
  let end;
  while ((end = buffer.indexOf("\0")) >= 0) {
    const message = JSON.parse(buffer.slice(0, end));
    buffer = buffer.slice(end + 1);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    } else if (message.method === "Runtime.exceptionThrown") {
      errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    } else if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      errors.push(message.params.args.map((a) => a.value ?? a.description).join(" "));
    }
  }
});
const send = (method, params = {}, sessionId) =>
  new Promise((resolveCall, rejectCall) => {
    const id = ++nextId;
    pending.set(id, (m) => (m.error ? rejectCall(new Error(`${method}: ${m.error.message}`)) : resolveCall(m.result)));
    chrome.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + "\0");
  });
const evaluate = async (sessionId, expression, userGesture = false) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
async function waitFor(fn, what, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = await fn().catch(() => null);
    if (value) return value;
    await delay(150);
  }
  throw new Error(`timed out waiting for ${what}`);
}
const attach = async (targetId) => {
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Runtime.enable", {}, sessionId);
  return sessionId;
};
const targets = async () => (await send("Target.getTargets")).targetInfos;
const findTarget = (match, what) => waitFor(async () => (await targets()).find(match), what);

try {
  // Install
  const { id } = await send("Extensions.loadUnpacked", { path: EXTENSION });
  check("Extension installs from the build", id, id);
  const origin = `chrome-extension://${id}`;
  await send("Browser.setDownloadBehavior", { behavior: "allowAndName", downloadPath: downloads });
  const worker = await attach((await findTarget((t) => t.type === "service_worker" && t.url.startsWith(origin), "service worker")).targetId);

  // The buddy on an ordinary web page
  const { targetId: pageId } = await send("Target.createTarget", { url: `http://127.0.0.1:${PORT}/` });
  const page = await attach(pageId);
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, page);
  const overlay = await waitFor(
    () => evaluate(page, `(() => { const f = document.querySelector('iframe[title="Pixel Buddy"]'); if (!f || getComputedStyle(f).display === 'none') return null; const r = f.getBoundingClientRect(); return { src: f.src, w: r.width, h: r.height, allow: f.allow }; })()`),
    "the overlay frame",
  );
  check("Overlay frame appears on a web page", overlay.src.startsWith(origin), `${overlay.w}×${overlay.h}`);
  check("Frame allows clipboard-write", overlay.allow === "clipboard-write");
  const frame = await attach((await findTarget((t) => t.url.startsWith(`${origin}/page.html`), "overlay frame")).targetId);
  await waitFor(() => evaluate(frame, `!!document.querySelector('.buddy-container img')`), "the buddy");
  check("Page itself still works", await evaluate(page, `document.querySelector('#b').textContent === 'Page button'`));
  const badge = await evaluate(worker, `chrome.action.getBadgeText({})`);
  check("Toolbar badge counts down to the break", /^\d+m$/.test(badge), badge);

  // Clicks the way a person does: move over the UI (the frame takes the pointer), then click.
  const clickInFrame = async (selector) => {
    await delay(450); // let bubbles finish sliding in before measuring
    const r = await evaluate(frame, `(() => { const e = document.querySelector('${selector}'); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
    if (!r) throw new Error(`no element ${selector}`);
    const box = await evaluate(page, `(() => { const b = document.querySelector('iframe[title="Pixel Buddy"]').getBoundingClientRect(); return { x: b.x, y: b.y }; })()`);
    const x = box.x + r.x;
    const y = box.y + r.y;
    await delay(100); // the frame reports where its UI is every 100 ms
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x - 6, y: y - 6 }, page);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y }, page);
    await delay(250);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 }, page);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 }, page);
  };

  // Guided break (a fresh profile has no breaks today, so it's the stretch routine)
  await evaluate(frame, `window.api.takeBreak()`);
  const bubble = await waitFor(() => evaluate(frame, `document.querySelector('.speech-bubble')?.innerText`), "the break bubble");
  check("Break starts a guided routine", /Stretch with me/.test(bubble), bubble.split("\n").slice(0, 2).join(" / "));
  check("Routine shows step progress", (await evaluate(frame, `document.querySelectorAll('.routine-steps span').length`)) === 5);
  check("Buddy acts out the step", /buddy-motion-reach/.test(await evaluate(frame, `document.querySelector('.buddy-container').className`)));
  check("Badge shows break time", (await evaluate(worker, `chrome.action.getBadgeText({})`)) === "5m");
  await evaluate(frame, `window.api.reset()`);
  await waitFor(() => evaluate(frame, `!document.querySelector('.routine-steps')`), "back to work");

  // Settings: avatars and the festival calendar
  await waitFor(() => evaluate(frame, `!!document.querySelector('.side-controls [aria-label="Open settings"]')`), "the gear");
  await clickInFrame('.side-controls [aria-label="Open settings"]');
  await waitFor(() => evaluate(frame, `!!document.querySelector('.settings-panel')`), "settings");
  check("Settings opens with a real click on the page", true);
  // Festival buddies are limited-time: the picker shows the classic buddy, the current
  // festival's buddy (with claim progress), and one locked "to collect" tile.
  const tiles = await evaluate(frame, `[...document.querySelectorAll('.media-card')].map(e => e.innerText.replace(/\\n/g, ' '))`);
  const expectedTiles = festivalNow ? 2 + 1 + 1 : 1 + 1 + 1; // classic (+ festival) + locked + add
  check("Avatar picker hides the festival collection", tiles.length === expectedTiles && tiles.some((t) => /to collect/.test(t)), tiles.join(" | "));
  const active = await evaluate(frame, `document.querySelector('.media-card-active .media-card-label')?.textContent ?? ''`);
  check(`Auto mode wears today's character (${festivalNow?.name ?? "classic"})`, active.startsWith(festivalNow?.name ?? "Pixel Buddy"), active);
  const calendar = await evaluate(frame, `document.querySelector('.festival-calendar')?.innerText.replace(/\\n/g, ' ') ?? ''`);
  check("Festival calendar shows what's coming up", comingUp.every((name, i) => calendar.indexOf(name) > (i ? calendar.indexOf(comingUp[i - 1]) : -1)), calendar);
  const switchText = await evaluate(frame, `document.querySelector('[aria-label="Dress up for festivals"]').closest('.switch-row').innerText.replace(/\\n/g, ' ')`);
  check("Festival switch explains the claim", festivalNow ? switchText.includes(festivalNow.name) && /more breaks?/.test(switchText) : /Limited-time/.test(switchText), switchText);
  await evaluate(frame, `[...document.querySelectorAll('.media-card')].find(c => c.textContent.includes('Pixel Buddy')).click()`);
  await waitFor(() => evaluate(frame, `(document.querySelector('.media-card-active')?.textContent ?? '').includes('Pixel Buddy')`), "classic selected");
  const picked = await evaluate(frame, `Promise.all([window.api.getSettings(), Promise.resolve(document.querySelector('.media-card-active img').getAttribute('src'))]).then(([s, src]) => ({ skin: s.avatarSkin, src }))`);
  // Settings replace the buddy while open, so close them to see it, then come back.
  await evaluate(frame, `document.querySelector('[aria-label="Close settings"]').click()`);
  const dressed = await waitFor(() => evaluate(frame, `document.querySelector('.buddy-container img')?.getAttribute('src') === ${JSON.stringify(picked.src)}`), "the classic buddy").catch(() => false);
  check("Picking an avatar saves it and dresses the buddy", picked.skin === "classic" && dressed, picked.skin);
  const reopenSettings = async () => {
    await waitFor(() => evaluate(frame, `!!document.querySelector('.side-controls [aria-label="Open settings"]')`), "the gear");
    await evaluate(frame, `document.querySelector('.side-controls [aria-label="Open settings"]').click()`);
    await waitFor(() => evaluate(frame, `!!document.querySelector('[aria-label="Dress up for festivals"]')`), "settings");
  };
  await reopenSettings();
  await evaluate(frame, `document.querySelector('[aria-label="Dress up for festivals"]').click()`);
  await waitFor(() => evaluate(frame, `window.api.getSettings().then(s => s.avatarSkin === 'auto')`), "auto mode");
  check("Festival switch turns auto mode back on", true);

  // Claiming this festival's buddy: progress nudges, then the claim prompt
  await evaluate(frame, `document.querySelector('[aria-label="Close settings"]').click()`);
  if (festivalNow) {
    const today = activeFestival(now);
    const key = `${today.festival.skin}-${today.day.getFullYear()}-${today.day.getMonth() + 1}`;
    await evaluate(frame, `window.api.saveSettings({ festivalBreaks: { '${key}': 1 } })`);
    await delay(300);
    await evaluate(frame, `window.api.saveSettings({ festivalBreaks: { '${key}': 2 } })`);
    const nudge = await waitFor(() => evaluate(frame, `(document.querySelector('.speech-bubble')?.innerText ?? '').includes('2/3') && document.querySelector('.speech-bubble').innerText`), "the progress nudge").catch(() => "");
    check("Each festival break nudges toward the buddy", /2\/3 breaks toward the/.test(nudge), nudge.split("\n")[0]);
    await waitFor(() => evaluate(frame, `!document.querySelector('.speech-bubble')`), "the nudge to fade", 8000);
    await evaluate(frame, `window.api.saveSettings({ festivalBreaks: { '${key}': 3 } })`);
    const prompt = await waitFor(() => evaluate(frame, `(document.querySelector('.speech-bubble')?.innerText ?? '').includes('You earned') && document.querySelector('.speech-bubble').innerText`), "the claim prompt");
    check("Three festival breaks earn the claim prompt", /Claim it/.test(prompt), prompt.split("\n")[0]);
    await clickInFrame(".speech-bubble .btn-primary");
    const claimed = await waitFor(() => evaluate(frame, `window.api.getSettings().then(s => s.claimedSkins.includes('${today.festival.skin}') && s.claimedSkins)`), "the claim").catch(() => null);
    check("Claiming keeps the buddy", claimed, JSON.stringify(claimed));
  } else {
    check("Claim flow (no festival today, skipped)", true);
  }
  await waitFor(() => evaluate(frame, `!document.querySelector('.speech-bubble')`), "the bubble to fade", 8000).catch(() => {});
  await reopenSettings();

  // Dashboard: water by hand, share card
  await evaluate(frame, `[...document.querySelectorAll('.settings-tab-btn')].find(b => b.textContent.includes('Dashboard')).click()`);
  await waitFor(() => evaluate(frame, `!!document.querySelector('.water-log-buttons')`), "the dashboard");
  const water = () => evaluate(frame, `window.api.getSettings().then(s => s.hydrationDrankToday)`);
  const glasses = await water();
  await evaluate(frame, `document.querySelector('.water-log-buttons').scrollIntoView()`);
  await clickInFrame(".water-log-buttons .btn-primary");
  await waitFor(async () => (await water()) === glasses + 1, "a glass");
  await clickInFrame(".water-log-buttons .btn-primary");
  await waitFor(async () => (await water()) === glasses + 2, "a second glass");
  const shown = await waitFor(() => evaluate(frame, `document.querySelector('.water-ratio-current').textContent === '${glasses + 2}'`), "the water count").catch(() => false);
  check('"+ Add a glass" logs water by hand', shown, `${glasses} → ${glasses + 2}`);
  await clickInFrame('.water-log-buttons [aria-label="Remove a glass"]');
  check('"−" removes a glass', await waitFor(async () => (await water()) === glasses + 1, "one glass fewer").catch(() => false));
  await evaluate(frame, `document.querySelector('.share-day').scrollIntoView()`);
  await clickInFrame(".share-day .btn-primary");
  const file = await waitFor(async () => (await readdir(downloads)).find((f) => !f.endsWith(".crdownload")), "the card download", 8000).catch(() => null);
  check("Share my day downloads a PNG from inside a web page", file, file ? "" : await evaluate(frame, `document.querySelector('.share-status').textContent`));
  await send("Browser.grantPermissions", { origin, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] }).catch(() => {});
  await clickInFrame(".share-day .btn-secondary");
  const copied = await waitFor(() => evaluate(frame, `/Cop/.test(document.querySelector('.share-status').textContent) && document.querySelector('.share-status').textContent`), "the copy status");
  // Headless Chrome on a Linux server (CI) may have no clipboard to write to; everywhere else this must pass.
  if (process.platform === "linux" && /Couldn't copy/.test(copied)) check("Copy image (skipped: no clipboard on headless Linux)", true, copied);
  else check("Copy image works inside a web page", /Copied/.test(copied), copied);
  await evaluate(frame, `document.querySelector('[aria-label="Close settings"]').click()`);

  // Rating prompt
  await evaluate(frame, `window.api.saveSettings({ lifetimeBreaksCompleted: 3 })`);
  const ask = await waitFor(() => evaluate(frame, `(document.querySelector('.speech-bubble')?.innerText ?? '').includes('breaks together') && document.querySelector('.speech-bubble').innerText`), "the rating prompt");
  check("Rating prompt appears after 3 breaks", /Rate ⭐/.test(ask), ask.split("\n")[0]);
  await evaluate(frame, `[...document.querySelectorAll('.speech-bubble button')].find(b => b.textContent === 'Later').click()`);
  check('"Later" asks again 10 breaks later', await waitFor(() => evaluate(frame, `window.api.getSettings().then(s => s.reviewAskAt === 13)`), "Later").catch(() => false));
  await evaluate(frame, `window.api.saveSettings({ lifetimeBreaksCompleted: 13 })`);
  await waitFor(() => evaluate(frame, `!!document.querySelector('.speech-bubble button')`), "the prompt again");
  const before = new Set((await targets()).map((t) => t.targetId));
  await evaluate(frame, `[...document.querySelectorAll('.speech-bubble button')].find(b => b.textContent.includes('Rate')).click()`, true);
  const opened = await findTarget((t) => !before.has(t.targetId) && t.type === "page", "the reviews tab").catch(() => null);
  check('"Rate" opens the Chrome Web Store reviews page', opened && /chromewebstore\.google\.com\/detail\/pixel-buddy\/[a-z]+\/reviews/.test(opened.url), opened?.url);
  if (opened) await send("Target.closeTarget", { targetId: opened.targetId });
  check("Rating prompt never asks again after rating", (await evaluate(frame, `window.api.getSettings().then(s => s.reviewAskAt)`)) === -1);

  // A real break runs to the end
  if (!QUICK) {
    await evaluate(frame, `window.api.saveSettings({ breakDuration: 1, lifetimeBreaksCompleted: 0, statsBreaksCompletedToday: 0 })`);
    await evaluate(frame, `window.api.takeBreak()`);
    console.log("      …waiting 65 s for a one-minute break to finish");
    await delay(65000);
    const after = await evaluate(frame, `Promise.all([window.api.getSettings(), window.api.getState()]).then(([s, d]) => ({ lifetime: s.lifetimeBreaksCompleted, today: s.statsBreaksCompletedToday, festival: Object.values(s.festivalBreaks).reduce((a, b) => a + b, 0), state: d.state }))`);
    check("Completed break counts today and lifetime, then back to work", after.lifetime === 1 && after.today === 1 && after.state === "WORKING", JSON.stringify(after));
    if (festivalNow) check("A real break during a festival counts toward its buddy", after.festival === 4, `${after.festival} festival breaks`);
  }

  // Toolbar popup
  const { targetId: popupId } = await send("Target.createTarget", { url: `${origin}/popup.html` });
  const popup = await attach(popupId);
  await waitFor(() => evaluate(popup, `!!document.querySelector('.settings-panel')`), "the popup");
  check("Toolbar popup opens settings", true);
  await evaluate(popup, `[...document.querySelectorAll('.settings-tab-btn')].find(b => b.textContent.includes('Dashboard')).click()`);
  await waitFor(() => evaluate(popup, `!!document.querySelector('.water-log-buttons')`), "popup dashboard");
  const popupGlasses = await evaluate(popup, `window.api.getSettings().then(s => s.hydrationDrankToday)`);
  await evaluate(popup, `document.querySelector('.water-log-buttons .btn-primary').click()`, true);
  check("A glass added in the popup reaches the tab", await waitFor(() => evaluate(frame, `window.api.getSettings().then(s => s.hydrationDrankToday === ${popupGlasses + 1})`), "the glass in the tab").catch(() => false));

  // Upgrade from 1.0.0: old settings without the new fields, then a cold start of the worker
  // (the same startup path an update takes).
  await evaluate(worker, `chrome.storage.local.set({ settings: { workDuration: 25, breakDuration: 5, snoozeDuration: 30, sound: true, userName: 'Old user', hydrationGoal: 6, themeHue: 200 } })`);
  for (const t of (await targets()).filter((t) => t.type === "page" && (t.url.startsWith(origin) || t.targetId === pageId))) await send("Target.closeTarget", { targetId: t.targetId });
  const workerTarget = (await targets()).find((t) => t.type === "service_worker" && t.url.startsWith(origin));
  await send("Target.closeTarget", { targetId: workerTarget.targetId }).catch(() => {});
  await waitFor(async () => !(await targets()).some((t) => t.type === "service_worker" && t.url.startsWith(origin)), "the worker to stop", 15000);
  const { targetId: freshId } = await send("Target.createTarget", { url: `${origin}/popup.html` });
  const fresh = await attach(freshId);
  const upgraded = await waitFor(() => evaluate(fresh, `window.api?.getSettings().then(s => s && ({ work: s.workDuration, name: s.userName, skin: s.avatarSkin, askAt: s.reviewAskAt, lifetime: s.lifetimeBreaksCompleted }))`), "upgraded settings");
  check("Upgrade keeps old settings and adds the new ones", upgraded.work === 25 && upgraded.name === "Old user" && upgraded.skin === "auto" && upgraded.askAt === 3 && upgraded.lifetime === 0, JSON.stringify(upgraded));
} catch (error) {
  check("Test run finished", false, error.message);
} finally {
  check("No errors in the extension's consoles", errors.length === 0, errors.slice(0, 3).join(" | "));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  chrome.kill();
  site.close();
  await delay(300);
  await rm(profile, { recursive: true, force: true });
  await rm(downloads, { recursive: true, force: true });
  process.exitCode = failed ? 1 : 0;
}
