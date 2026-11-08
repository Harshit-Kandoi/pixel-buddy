// Works out the next release version and writes it everywhere the app keeps one.
// Used by .github/workflows/release-on-merge.yml; safe to run locally (dry run by default).
//
//   node scripts/next-version.mjs                 # print what the next release would be
//   node scripts/next-version.mjs --apply         # also update package.json, package-lock.json, manifest
//   node scripts/next-version.mjs --bump minor    # force a minor release (auto | patch | minor)
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
export const highest = (versions) => versions.filter(Boolean).sort(compare).at(-1);

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

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const args = process.argv.slice(2);
  const bump = args.includes("--bump") ? args[args.indexOf("--bump") + 1] : "auto";
  if (!["auto", "patch", "minor"].includes(bump)) throw new Error(`--bump must be auto, patch or minor, not ${bump}`);
  const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8" }).trim();

  const pkgPath = resolve(root, "package.json");
  const lockPath = resolve(root, "package-lock.json");
  const manifestPath = resolve(root, "extension/public/manifest.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

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

  if (args.includes("--apply")) {
    pkg.version = version;
    lock.version = version;
    if (lock.packages?.[""]) lock.packages[""].version = version;
    manifest.version = version;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    writeFileSync(resolve(root, "release-notes.generated.md"), notes);
    console.log("Updated package.json, package-lock.json, extension/public/manifest.json");
  }
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\ntag=v${version}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
