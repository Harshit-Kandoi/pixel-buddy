export const repository = 'Harshit-Kandoi/pixel-buddy';
export const releasesUrl = `https://github.com/${repository}/releases`;
export function groupAssets(assets = []) {
  const groups = { windows: [], mac: [], linux: [] };
  for (const asset of assets) {
    if (asset.state !== 'uploaded' || !asset.name?.startsWith('pixel-buddy-')) continue;
    // Only use actual GitHub release URLs from our repository.
    if (!asset.browser_download_url?.startsWith(`${releasesUrl}/download/`)) continue;
    let platform;
    if (/windows.*\.exe$/i.test(asset.name)) platform = 'windows';
    else if (/mac.*\.dmg$/i.test(asset.name)) platform = 'mac';
    else if (/linux.*\.(AppImage|deb)$/i.test(asset.name)) platform = 'linux';
    if (platform) groups[platform].push(asset);
  }
  return groups;
}
export function assetLabel(asset) {
  const name = asset.name;
  if (/\.exe$/i.test(name)) return 'Download for Windows ↓';
  if (/mac-arm64/i.test(name)) return 'Apple silicon ↓';
  if (/mac-x64/i.test(name)) return 'Intel Mac ↓';
  if (/\.AppImage$/i.test(name)) return 'Download AppImage ↓';
  if (/\.deb$/i.test(name)) return 'Debian package ↓';
  return 'Download ↓';
}
