import { repository, releasesUrl, groupAssets, assetLabel } from './releases.mjs';
import { activeFestival, nextOfEach } from './festivals.mjs';

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
const isWindows = /Windows/i.test(navigator.userAgent);
const commandHint = document.querySelector('#command-hint');
function updateCommand() {
  const choice = platformSelect.value;
  if (choice === 'windows' || (choice === 'auto' && isWindows)) {
    command.textContent = `irm https://raw.githubusercontent.com/${repository}/main/scripts/download.ps1 | iex`;
    commandHint.textContent = 'Paste into PowerShell. Saves a verified installer to your Downloads folder.';
  } else {
    const platform = choice === 'auto' ? '' : ` --platform ${choice}`;
    command.textContent = `curl -fsSLo pixel-buddy-download.sh https://raw.githubusercontent.com/${repository}/main/scripts/download.sh\nbash pixel-buddy-download.sh${platform}`;
    commandHint.textContent = 'Paste into Terminal. Saves a checksum-verified installer to the current folder.';
  }
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
  message.textContent = { focus: 'Let’s make a little space to focus.', break: '🙆 Stretch with me: press start and follow along.', water: 'A little sip, a little reset. You’ve got this.' }[mode];
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
  else if (mode === 'break') {
    // The same guided stretch the app leads, one step every few seconds.
    const step = Math.floor((300 - secondsLeft) / 6) % STRETCH.length;
    message.textContent = `${step + 1}/${STRETCH.length} · ${STRETCH[step]}`;
  }
  demoBuddy.classList.toggle('stretching', running && mode === 'break');
  renderDemo();
}, 250);

const STRETCH = ['Reach both arms to the sky. Big stretch!', 'Lean slowly left… and right.', 'Roll your shoulders back, nice and slow.', 'Clasp your hands behind you, open your chest.', 'Shake out your hands. Lovely!'];
const demoBuddy = document.querySelector('#demo-buddy');

// The buddy celebrates with you: festival character in the hero, and the calendar in date order.
const now = new Date();
const festival = activeFestival(now);
if (festival) {
  const { skin, name, emoji } = festival.festival;
  for (const img of [document.querySelector('#hero-buddy'), demoBuddy]) {
    img.src = `assets/buddy-${skin}.svg`;
    img.alt = `Pixel Buddy dressed up for ${name}`;
  }
  document.querySelector('#hero-bubble').innerHTML = `Happy ${name}! ${emoji}<br>Don’t forget a little break. <span>✦</span>`;
}
// Limited-time festival buddies: the buddy transforms into this festival's character, or
// into a silhouette of the next one, without showing the whole collection.
const stage = document.querySelector('#season-buddies');
const form = document.querySelector('#season-form');
const tag = document.querySelector('#season-tag');
const caption = document.querySelector('#season-caption');
const shortDay = d => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
if (festival) {
  const { skin, name, emoji } = festival.festival;
  form.src = `assets/buddy-${skin}.svg`;
  form.alt = `The ${name} buddy`;
  form.classList.remove('mystery');
  tag.textContent = `HAPPENING NOW · UNTIL ${shortDay(festival.lastDay).toUpperCase()}`;
  tag.classList.add('now');
  caption.textContent = `The ${name} buddy is here ${emoji} Take 3 breaks by ${shortDay(festival.lastDay)} to keep it.`;
} else {
  const next = nextOfEach(now)[0];
  if (next) {
    form.src = `assets/buddy-${next.festival.skin}.svg`;
    tag.textContent = `NEXT · ${shortDay(next.day).toUpperCase()}`;
    caption.textContent = `Something’s coming for ${next.festival.name} ${next.festival.emoji} Who will your buddy be?`;
  }
}
if (matchMedia('(prefers-reduced-motion: reduce)').matches) stage.classList.add('transformed');
else setInterval(() => stage.classList.toggle('transformed'), 2800);
