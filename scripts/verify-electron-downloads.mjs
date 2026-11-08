// Checks every Electron file downloaded during install and packaging against the official
// checksums that ship inside the electron npm package (pinned by package-lock.json). Run after
// building installers: if a download came from a backup mirror and doesn't match, the release
// stops here.
// Usage: node scripts/verify-electron-downloads.mjs
/* eslint-disable @typescript-eslint/explicit-function-return-type -- Node runs this plain JavaScript directly. */
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checksums = JSON.parse(readFileSync(join(root, "node_modules/electron/checksums.json"), "utf8"));
const home = homedir();
const localAppData = process.env.LOCALAPPDATA ?? join(home, "AppData/Local");
const cacheRoots = [
  process.env.electron_config_cache,
  process.env.ELECTRON_BUILDER_CACHE,
  join(home, "Library/Caches/electron"),
  join(home, "Library/Caches/electron-builder"),
  join(process.env.XDG_CACHE_HOME ?? join(home, ".cache"), "electron"),
  join(process.env.XDG_CACHE_HOME ?? join(home, ".cache"), "electron-builder"),
  join(localAppData, "electron/Cache"),
  join(localAppData, "electron-builder/Cache"),
].filter((dir) => dir && existsSync(dir));

async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (entry.isFile()) yield path;
  }
}
const sha256 = (path) =>
  new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    createReadStream(path).on("data", (d) => hash.update(d)).on("end", () => resolveHash(hash.digest("hex"))).on("error", reject);
  });

let checked = 0;
const bad = [];
for (const dir of cacheRoots) {
  for await (const path of files(dir)) {
    const name = path.split(/[\\/]/).pop();
    if (!(name in checksums)) continue; // only official Electron release files
    checked++;
    if ((await sha256(path)) !== checksums[name]) bad.push(path);
  }
}
if (bad.length) {
  console.error(`::error::${bad.length} Electron download(s) don't match the official checksums:\n${bad.join("\n")}`);
  process.exit(1);
}
console.log(`Checked ${checked} Electron download(s) against the official checksums in ${cacheRoots.length} cache folder(s): all match.`);
