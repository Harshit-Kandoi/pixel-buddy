import { describe, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

describe('Bash release download', () => {
  for (const valid of [true, false]) {
    test(valid ? 'saves a checksum-verified installer without running it' : 'rejects a corrupted installer without saving it', () => {
      if (process.platform === 'win32') return; // Shell test runs on the macOS and Linux jobs.
      const dir = mkdtempSync(join(tmpdir(), 'buddy-download-test-'));
      try {
        const bin = join(dir, 'bin'); mkdirSync(bin);
        const filename = 'pixel-buddy-1.0.0-linux-x64.AppImage';
        const data = 'fixture installer';
        const sha = createHash('sha256').update(valid ? data : 'different content').digest('hex');
        const url = 'https://github.com/Harshit-Kandoi/pixel-buddy/releases/download/v1.0.0/';
        writeFileSync(join(dir, 'release.json'), JSON.stringify({ assets: [filename, 'SHA256SUMS'].map(name => ({ name, state: 'uploaded', browser_download_url: url + name })) }));
        writeFileSync(join(dir, 'installer'), data);
        writeFileSync(join(dir, 'sums'), `${sha}  ${filename}\n`);
        writeFileSync(join(bin, 'curl'), `#!/usr/bin/env bash\nset -eu\nurl=''\noutput=''\nwhile [ "$#" -gt 0 ]; do\n case "$1" in -o) output="$2"; shift 2 ;; https:*) url="$1"; shift ;; *) shift ;; esac\ndone\ncase "$url" in */releases/latest) cp "$FIXTURE_DIR/release.json" "$output" ;; */SHA256SUMS) cp "$FIXTURE_DIR/sums" "$output" ;; *.AppImage) cp "$FIXTURE_DIR/installer" "$output" ;; *) exit 1 ;; esac\n`, { mode: 0o755 });
        const output = join(dir, 'downloads');
        const result = spawnSync('bash', [resolve('scripts/download.sh'), '--platform', 'linux', '--output', output], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FIXTURE_DIR: dir }, encoding: 'utf8' });
        expect(result.status, result.stderr).toBe(valid ? 0 : 1);
        expect(existsSync(join(output, filename))).toBe(valid);
        if (valid) expect(readFileSync(join(output, filename), 'utf8')).toBe(data);
      } finally { rmSync(dir, { recursive: true, force: true }); }
    });
  }
});
