// Run only on disposable GitHub runners: the real app initializes settings and login items.
// This probes the installed app without adding test modes or dependencies to production code.
/* eslint-disable @typescript-eslint/explicit-function-return-type -- Node runs this plain JavaScript directly. */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

if (process.env.GITHUB_ACTIONS !== "true" || !process.argv[2]) {
  throw new Error(
    "Usage on a disposable GitHub runner: node scripts/smoke-desktop.mjs <installed executable>",
  );
}
const profile = await mkdtemp(join(tmpdir(), "pixel-buddy-smoke-"));
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
const child = spawn(
  resolve(process.argv[2]),
  [
    `--user-data-dir=${profile}`,
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=0",
  ],
  { env: environment, stdio: ["ignore", "pipe", "pipe"] },
);
let output = "";
let launchError;
child.on("error", (error) => {
  launchError = error;
});
for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", (chunk) => {
    output += chunk.toString();
    process.stdout.write(chunk);
  });
}
let socket;
let sequence = 0;
const pending = new Map();
const deadline = Date.now() + 60_000;
function alive() {
  if (launchError) throw launchError;
  if (child.exitCode !== null || child.signalCode !== null)
    throw new Error(
      `App exited before smoke check completed (exit code: ${child.exitCode}, signal: ${child.signalCode})`,
    );
  if (Date.now() > deadline)
    throw new Error("Timed out waiting for the installed app");
}
function command(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolveCommand, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 10_000);
    pending.set(id, { resolve: resolveCommand, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
try {
  let port;
  while (!port) {
    alive();
    // Chromium logs the endpoint; DevToolsActivePort is a fallback on Windows GUI builds.
    port = output.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/)?.[1];
    if (!port) {
      try {
        port = (
          await readFile(join(profile, "DevToolsActivePort"), "utf8")
        ).split("\n")[0];
      } catch {
        /* starting */
      }
    }
    if (!port) await delay(250);
  }
  let page;
  while (!page) {
    alive();
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: AbortSignal.timeout(3000),
    });
    page = (await response.json()).find(
      (target) => target.type === "page" && target.url.startsWith("file:"),
    );
    if (!page) await delay(250);
  }
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await Promise.race([
    once(socket, "open"),
    delay(10_000, undefined, { ref: false }).then(() => {
      throw new Error("CDP connection timeout");
    }),
  ]);
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  let ready = false;
  while (!ready) {
    alive();
    const result = await command("Runtime.evaluate", {
      expression: `(async () => {
        if (!document.querySelector('#root')?.children.length || !window.api) return false;
        const [settings, state] = await Promise.all([window.api.getSettings(), window.api.getState()]);
        return Boolean(settings && state && document.title === 'Pixel Buddy');
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails)
      throw new Error(JSON.stringify(result.exceptionDetails));
    ready = result.result.value === true;
    if (!ready) await delay(250);
  }
  if (
    !output.includes("uiohook-napi loaded successfully") ||
    output.includes("uiohook-napi failed to load")
  ) {
    throw new Error(
      "Packaged native input-monitoring module did not load successfully",
    );
  }
  // Let the scheduler tick, then use the same quit API as the normal UI.
  await delay(2000);
  alive();
  const exited = once(child, "exit");
  console.log("Startup checks passed; requesting quit through the app UI API.");
  // Surface CDP/renderer errors, but allow exit to happen before a CDP reply.
  const quitRequested = command("Runtime.evaluate", {
    expression: "window.api.quit()",
  }).then((result) => {
    if (result.exceptionDetails) {
      throw new Error(
        `Quit request failed: ${JSON.stringify(result.exceptionDetails)}`,
      );
    }
    console.log(
      "Renderer dispatched the quit request; waiting for process exit.",
    );
    return exited;
  });
  const [code, signal] = await Promise.race([
    exited,
    quitRequested,
    delay(10_000, undefined, { ref: false }).then(() => {
      throw new Error("App did not quit cleanly");
    }),
  ]);
  if (code !== 0)
    throw new Error(`App exited with code ${code}, signal ${signal}`);
  console.log(
    "PASS: installed app rendered, preload/IPC responded, native module loaded, and quit cleanly.",
  );
} finally {
  socket?.close();
  for (const request of pending.values()) clearTimeout(request.timer);
  if (child.exitCode === null && child.signalCode === null) child.kill();
}
