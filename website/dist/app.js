import { repository, releasesUrl, groupAssets, assetLabel } from './releases.mjs';

const status = document.querySelector('#release-status');
async function loadRelease() {
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(8000) });
    if (response.status === 404) {
      status.textContent = 'The first release is on its way. Downloads will appear here as soon as builds are published on GitHub.';
      return;
    }
    if (!response.ok) throw new Error('Release lookup unavailable');
    const release = await response.json();
    const groups = groupAssets(release.assets);
    status.textContent = `${release.tag_name} · Free and open source · Downloads from GitHub Releases`;
    for (const [platform, assets] of Object.entries(groups)) {
      const card = document.querySelector(`[data-platform="${platform}"]`);
      if (!assets.length) {
        card.querySelector('small').textContent = 'No build for this device in this release';
        continue;
      }
      const links = card.querySelector('.asset-links');
      links.replaceChildren(...assets.map((asset) => {
        const link = document.createElement('a');
        link.className = 'button download-link';
        link.href = asset.browser_download_url;
        link.textContent = assetLabel(asset);
        link.setAttribute('aria-label', `${assetLabel(asset).replace('↓', '')}, ${(asset.size / 1048576).toFixed(1)} MB`);
        return link;
      }));
      card.querySelector('small').textContent = assets.map(a => `${(a.size / 1048576).toFixed(1)} MB`).join(' / ');
    }
  } catch {
    status.replaceChildren('We couldn’t check downloads right now. ', Object.assign(document.createElement('a'), { href: releasesUrl, textContent: 'Check GitHub Releases ↗' }));
  }
}
loadRelease();

const command = document.querySelector('#install-command');
const platformSelect = document.querySelector('#terminal-platform');
const copyStatus = document.querySelector('#copy-status');
function updateCommand() {
  const platform = platformSelect.value === 'auto' ? '' : ` --platform ${platformSelect.value}`;
  command.textContent = `curl -fsSLo pixel-buddy-download.sh https://raw.githubusercontent.com/${repository}/main/scripts/download.sh\nbash pixel-buddy-download.sh${platform}`;
  copyStatus.textContent = '';
}
platformSelect.addEventListener('change', updateCommand);
updateCommand();
document.querySelector('#copy-command').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(command.textContent);
    copyStatus.textContent = 'Copied!';
  } catch {
    const selection = getSelection();
    const range = document.createRange(); range.selectNodeContents(command); selection.removeAllRanges(); selection.addRange(range);
    copyStatus.textContent = 'Select and copy the command above.';
  }
});

let mode = 'focus';
let running = false;
let secondsLeft = 25 * 60;
let endTime = 0;
let glasses = 0;
const value = document.querySelector('#demo-value');
const action = document.querySelector('#demo-action');
const message = document.querySelector('#demo-message');
const label = document.querySelector('#demo-label');
function renderDemo() {
  value.textContent = mode === 'water' ? `${glasses} / 8` : `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`;
  label.textContent = mode === 'water' ? 'GLASSES TODAY · PREVIEW' : mode === 'break' ? 'A MOMENT TO RECHARGE' : 'NEXT LITTLE BREAK';
  action.textContent = mode === 'water' ? (glasses >= 8 ? 'Start again ↺' : 'Have a sip +') : (running ? 'Pause preview Ⅱ' : 'Start preview ▶');
}
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  mode = button.dataset.mode; running = false; secondsLeft = mode === 'break' ? 5 * 60 : 25 * 60;
  message.textContent = { focus: 'Let’s make a little space to focus.', break: 'Unclench your jaw. Roll your shoulders. Breathe.', water: 'A little sip, a little reset. You’ve got this.' }[mode];
  document.querySelectorAll('[data-mode]').forEach(tab => { const active = tab === button; tab.classList.toggle('active', active); tab.setAttribute('aria-pressed', String(active)); });
  renderDemo();
}));
action.addEventListener('click', () => {
  if (mode === 'water') glasses = glasses >= 8 ? 0 : glasses + 1;
  else { if (secondsLeft === 0) secondsLeft = mode === 'break' ? 300 : 1500; running = !running; if (running) endTime = Date.now() + secondsLeft * 1000; }
  renderDemo();
});
setInterval(() => {
  if (!running) return;
  secondsLeft = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
  if (secondsLeft === 0) { running = false; message.textContent = mode === 'break' ? 'A fresh start. Ready when you are.' : 'Time for a little breather.'; }
  renderDemo();
}, 250);
