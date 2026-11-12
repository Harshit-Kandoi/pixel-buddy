// Release versions. Tags (v1.x.y) are the source of truth: the release workflow tags the
// merged commit and never pushes to main, then writes the version into the build machine's
// copy of the files before building.
//
//   node scripts/next-version.mjs                 # print what the next release would be
//   node scripts/next-version.mjs --notes         # also write release-notes.generated.md
//   node scripts/next-version.mjs --bump minor    # force a minor release (auto | patch | minor)
//   node scripts/next-version.mjs --set v1.2.0    # write 1.2.0 into package.json, package-lock.json, manifest
//
// One version for the desktop app, the Chrome extension, and the GitHub release, in the v1
// series: patch by default; minor when a commit starts with "feat" or says [minor]. Major
// versions are never automatic.
/* eslint-disable @typescript-eslint/explicit-function-return-type -- Node runs this plain JavaScript directly. */
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const parse = (version) => version.replace(/^v/, "").split(".").map(Number);
const compare = (a, b) => {
  const [x, y] = [parse(a), parse(b)];
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};
export const highest = (versions) => versions.filter(Boolean).sort(compare).slice(-1)[0];

const RELEASE_COMMIT = /^chore\(release\)/i;

/** The next version from the current one and the commit subjects since the last release. */
export function nextVersion({ current, commits, bump = "auto" }) {
  const [major, minor, patch] = parse(current);
  const meaningful = commits.filter((c) => !RELEASE_COMMIT.test(c));
  const wantsMinor = bump === "minor" || (bump === "auto" && meaningful.some((c) => /^feat(\(.+\))?!?:/i.test(c) || /\[minor\]/i.test(c)));
  return wantsMinor ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
}

/** Markdown bullet list of what changed, for the release notes. */
export function changeNotes(commits) {
  const lines = commits
    .filter((c) => c.trim() && !RELEASE_COMMIT.test(c))
    .map((c) => c.replace(/\s*\[(minor|skip release)\]\s*/gi, " ").trim())
    .map((c) => `- ${c}`);
  return lines.length ? `## What's new\n\n${lines.join("\n")}\n` : "";
}

/** Writes a version into package.json, package-lock.json and the extension manifest. */
function setVersion(root, version) {
  const files = ["package.json", "package-lock.json", "extension/public/manifest.json"].map((f) => resolve(root, f));
  const [pkg, lock, manifest] = files.map((f) => JSON.parse(readFileSync(f, "utf8")));
  pkg.version = version;
  lock.version = version;
  if (lock.packages?.[""]) lock.packages[""].version = version;
  manifest.version = version;
  [pkg, lock, manifest].forEach((json, i) => writeFileSync(files[i], JSON.stringify(json, null, 2) + "\n"));
  console.log(`Set version ${version} in package.json, package-lock.json, extension/public/manifest.json`);
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const args = process.argv.slice(2);
  if (args.includes("--set")) {
    const version = String(args[args.indexOf("--set") + 1] ?? "").replace(/^v/, "");
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`--set needs a version like v1.2.0, not "${version}"`);
    setVersion(root, version);
    return;
  }
  const bump = args.includes("--bump") ? args[args.indexOf("--bump") + 1] : "auto";
  if (!["auto", "patch", "minor"].includes(bump)) throw new Error(`--bump must be auto, patch or minor, not ${bump}`);
  const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8" }).trim();

  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(resolve(root, "extension/public/manifest.json"), "utf8"));

  // Start from whichever is highest: the last v1 tag, the app, or the extension (they used to
  // be versioned separately), so a version is never reused.
  const tags = git("tag", "--list", "v1.*").split("\n").filter((t) => /^v1\.\d+\.\d+$/.test(t));
  const lastTag = highest(tags);
  const current = highest([lastTag, pkg.version, manifest.version]);
  if (parse(current)[0] !== 1) throw new Error(`Current version ${current} is outside the v1 series; release it by hand.`);
  const range = lastTag ? [`${lastTag}..HEAD`] : [];
  const commits = git("log", ...range, "--no-merges", "--pretty=%s").split("\n").filter(Boolean);
  const version = nextVersion({ current, commits, bump });

  console.log(`Last release ${lastTag ?? "(none)"}, current ${current}, ${commits.length} commits → v${version}`);
  const notes = changeNotes(commits);

  if (args.includes("--notes")) writeFileSync(resolve(root, "release-notes.generated.md"), notes);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\ntag=v${version}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
