// Renders the Chrome Web Store screenshots (1280×800 PNG) into extension/store-assets/:
// the real app UI on the invented demo page, with a caption band. Drives headless Chrome
// over the DevTools protocol and captures each scene once it reports it is ready.
// Usage: npm run ext:screenshots   (Node 22+; set CHROME_PATH if Chrome is elsewhere)
//        npm run ext:screenshots -- reminder   (only the named scenes)
/* eslint-disable @typescript-eslint/explicit-function-return-type -- Node runs this plain JavaScript directly. */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "extension/store-assets");
const SCENE_URL = "http://127.0.0.1:4191/";
const DEBUG_PORT = 9333;
const scenes = [
  ["guided", "screenshot-1-guided-break.png"],
  ["festive", "screenshot-2-festive.png"],
  ["reminder", "screenshot-3-break-reminder.png"],
  ["share", "screenshot-4-share.png"],
  ["water", "screenshot-5-water.png"],
];
const chrome =
  process.env.CHROME_PATH ??
  [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  ].find((p) => existsSync(p));
if (!chrome) throw new Error("Chrome not found. Set CHROME_PATH.");

const reachable = (url) => fetch(url).then((r) => r.ok, () => false);
async function waitFor(check, what, tries = 100) {
  for (let i = 0; i < tries; i++) {
    const value = await check();
    if (value) return value;
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${what}`);
}

// Minimal DevTools protocol client over the built-in WebSocket.
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  });
  const send = (method, params = {}) =>
    new Promise((resolveCall, rejectCall) => {
      const callId = ++id;
      pending.set(callId, (m) => (m.error ? rejectCall(new Error(m.error.message)) : resolveCall(m.result)));
      ws.send(JSON.stringify({ id: callId, method, params }));
    });
  return new Promise((ready) => ws.addEventListener("open", () => ready({ send, close: () => ws.close() })));
}

// Reuse a running scene server if there is one.
const server = (await reachable(SCENE_URL))
  ? null
  : spawn("npx", ["vite", "--config", "extension/store-assets/src/shots/vite.config.ts"], { cwd: root, stdio: "ignore" });
const profile = await mkdtemp(join(tmpdir(), "pixel-buddy-shots-"));
const browser = spawn(chrome, [
  "--headless=new",
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=${profile}`,
  "--hide-scrollbars",
  "--no-first-run",
  "about:blank",
], { stdio: "ignore" });

try {
  await waitFor(() => reachable(SCENE_URL), "the scene server");
  const target = await waitFor(
    () => fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`).then((r) => r.json()).then((list) => list.find((t) => t.type === "page"), () => null),
    "Chrome",
  );
  const page = await connect(target.webSocketDebuggerUrl);
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  const only = process.argv.slice(2);
  for (const [scene, file] of scenes.filter(([name]) => !only.length || only.includes(name))) {
    await page.send("Page.navigate", { url: `${SCENE_URL}?scene=${scene}` });
    await waitFor(
      () => page.send("Runtime.evaluate", { expression: "document.title" }).then((r) => r.result.value === "ready"),
      `scene ${scene}`,
    );
    const { data } = await page.send("Page.captureScreenshot", { format: "png" });
    await writeFile(resolve(out, file), Buffer.from(data, "base64"));
    console.log(`Wrote extension/store-assets/${file}`);
  }
  page.close();
} finally {
  browser.kill();
  server?.kill();
  await delay(300);
  await rm(profile, { recursive: true, force: true });
}
