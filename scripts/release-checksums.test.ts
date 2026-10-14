import { afterEach, describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Arch, getArtifactArchName } from "builder-util";

const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const script = fileURLToPath(
  new URL("./release-checksums.mjs", import.meta.url),
);
const directories: string[] = [];
function fixture(): string {
  const directory = mkdtempSync(join(tmpdir(), "pixel-buddy-checksums-"));
  directories.push(directory);
  return directory;
}
function generate(directory: string, ...args: string[]): string {
  return execFileSync(process.execPath, [script, directory, ...args], {
    encoding: "utf8",
    stdio: "pipe",
  });
}
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("release checksum manifest", () => {
  test("hashes installer bytes and excludes blockmaps and previous manifests", () => {
    const directory = fixture();
    const name = `pixel-buddy-${version}-windows-x64.exe`;
    const bytes = Buffer.from([0, 255, 1, 128, 10]);
    writeFileSync(join(directory, name), bytes);
    writeFileSync(join(directory, `${name}.blockmap`), "not an installer");
    writeFileSync(join(directory, "SHA256SUMS"), "old manifest");
    generate(directory);
    const expected = `${createHash("sha256").update(bytes).digest("hex")}  ${name}\n`;
    expect(readFileSync(join(directory, "SHA256SUMS"), "utf8")).toBe(expected);
    generate(directory);
    expect(readFileSync(join(directory, "SHA256SUMS"), "utf8")).toBe(expected);
  });

  test("rejects an empty directory and stale installers", () => {
    const directory = fixture();
    expect(() => generate(directory)).toThrow();
    writeFileSync(join(directory, "pixel-buddy-0.0.0-mac-arm64.dmg"), "stale");
    expect(() => generate(directory)).toThrow();
  });

  test("requires every platform for a combined release", () => {
    const directory = fixture();
    const suffixes = [
      "windows-x64.exe",
      "mac-arm64.dmg",
      "mac-x64.dmg",
      `linux-${getArtifactArchName(Arch.x64, "AppImage")}.AppImage`,
      `linux-${getArtifactArchName(Arch.x64, "deb")}.deb`,
    ];
    for (const suffix of suffixes) {
      expect(() => generate(directory, "--all")).toThrow();
      writeFileSync(
        join(directory, `pixel-buddy-${version}-${suffix}`),
        suffix,
      );
    }
    generate(directory, "--all");
    const lines = readFileSync(join(directory, "SHA256SUMS"), "utf8")
      .trim()
      .split("\n");
    expect(lines).toHaveLength(5);
    expect(lines.map((line) => line.slice(66))).toEqual(
      suffixes.map((suffix) => `pixel-buddy-${version}-${suffix}`).sort(),
    );
  });
});
