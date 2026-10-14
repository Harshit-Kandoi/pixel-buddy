import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const directory = resolve(process.argv[2] || "release");
const { version } = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const suffixes = [
  "windows-x64.exe",
  "mac-arm64.dmg",
  "mac-x64.dmg",
  "linux-x86_64.AppImage",
  "linux-amd64.deb",
];
const expected = suffixes
  .map((suffix) => `pixel-buddy-${version}-${suffix}`)
  .sort();
const files = (await readdir(directory))
  .filter((name) => /\.(exe|dmg|AppImage|deb)$/.test(name))
  .sort();
if (!files.length || files.some((name) => !expected.includes(name))) {
  throw new Error(
    "Expected only current-version Pixel Buddy installers; use a clean output directory.",
  );
}
if (
  process.argv.includes("--all") &&
  JSON.stringify(files) !== JSON.stringify(expected)
) {
  throw new Error(`Incomplete release. Expected: ${expected.join(", ")}`);
}
const lines = [];
for (const name of files) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(resolve(directory, name)))
    hash.update(chunk);
  lines.push(`${hash.digest("hex")}  ${name}\n`);
}
await writeFile(resolve(directory, "SHA256SUMS"), lines.join(""));
console.log(`Wrote SHA256SUMS for ${files.length} installer(s).`);
