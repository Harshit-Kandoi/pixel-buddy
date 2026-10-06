import { describe, expect, test } from 'vitest';
// @ts-expect-error Buildless site module has no TypeScript declarations.
import { groupAssets, assetLabel } from '../website/dist/releases.mjs';
const asset = (name: string, url?: string) => ({ name, state: 'uploaded', browser_download_url: url ?? `https://github.com/Harshit-Kandoi/pixel-buddy/releases/download/v1.0.0/${name}` });
describe('download catalogue', () => {
  test('matches the installer names produced by the release workflow', () => {
    const groups = groupAssets(['pixel-buddy-1.0.0-windows-x64.exe', 'pixel-buddy-1.0.0-mac-arm64.dmg', 'pixel-buddy-1.0.0-mac-x64.dmg', 'pixel-buddy-1.0.0-linux-x64.AppImage', 'pixel-buddy-1.0.0-linux-x64.deb'].map(name => asset(name)));
    expect(groups.windows).toHaveLength(1);
    expect(groups.mac).toHaveLength(2);
    expect(groups.linux).toHaveLength(2);
    expect(assetLabel(groups.mac[0])).toBe('Apple silicon ↓');
  });
  test('ignores incomplete uploads, unrelated files, and foreign download hosts', () => {
    expect(groupAssets([asset('other.exe'), asset('SHA256SUMS'), asset('pixel-buddy-windows-x64.exe', 'https://example.com/app.exe'), { ...asset('pixel-buddy-windows-x64.exe'), state: 'new' }])).toEqual({ windows: [], mac: [], linux: [] });
  });
});
