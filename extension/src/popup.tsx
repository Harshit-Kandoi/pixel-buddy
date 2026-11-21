import '../../src/renderer/src/index.css';
import './extension.css';
import { createRoot } from 'react-dom/client';
import { installApi } from './api';
import { PopupRoot } from './PopupRoot';
import { KEY_ENABLED, KEY_HIDDEN_SITES, KEY_PAGES_ENABLED, PORT_POPUP } from './protocol';

// The toolbar popup: the master on/off switch, where the buddy shows up, and (while on)
// settings and stats.
const SETTINGS_HEIGHT = 560;
const POPUP_MAX_HEIGHT = 598; // Chrome caps popups at 600px
const root = document.getElementById('root')!;
const bar = document.getElementById('popup-bar')!;
const enabledToggle = document.getElementById('enabled') as HTMLInputElement;
const enabledStatus = document.getElementById('enabled-status')!;
const subRow = document.getElementById('sub-row')!;
const pagesToggle = document.getElementById('pages-enabled') as HTMLInputElement;
const siteRow = document.getElementById('site-toggle')!;
const siteToggle = document.getElementById('site-enabled') as HTMLInputElement;
const siteName = document.getElementById('site-name')!;

// For host methods this environment doesn't need.
const noop = (): void => undefined;
const store = (values: Record<string, unknown>): Promise<void> => chrome.storage.local.set(values);
const setEnabled = (on: boolean): Promise<void> => store({ [KEY_ENABLED]: on });

// The site in the tab the popup was opened from (clicking the toolbar button grants activeTab).
let site = '';
let hiddenSites: string[] = [];
void chrome.tabs?.query({ active: true, currentWindow: true }).then(([tab]) => {
  try {
    const url = new URL(tab?.url ?? '');
    if (!/^https?:$/.test(url.protocol) || !url.hostname) return;
    site = url.hostname;
    siteName.textContent = site.replace(/^www\./, '');
    siteRow.hidden = false;
    render();
  } catch { /* no page URL (new tab, chrome:// pages, or opened as a tab itself) */ }
});

let enabled = true;
let pagesEnabled = true;
function render(): void {
  enabledToggle.checked = enabled;
  enabledStatus.textContent = enabled ? 'On · reminders running' : 'Off';
  enabledStatus.classList.toggle('off', !enabled);
  subRow.hidden = !enabled;
  pagesToggle.checked = pagesEnabled;
  siteToggle.checked = !hiddenSites.includes(site);
  siteToggle.disabled = !pagesEnabled;
  siteRow.title = pagesEnabled
    ? `Show the buddy on ${site}. Reminders keep running here either way.`
    : 'Turn on "Show in tabs" first.';
}
function read(values: Record<string, unknown>): boolean {
  if (KEY_ENABLED in values) enabled = values[KEY_ENABLED] !== false;
  if (KEY_PAGES_ENABLED in values) pagesEnabled = values[KEY_PAGES_ENABLED] !== false;
  if (KEY_HIDDEN_SITES in values) hiddenSites = Array.isArray(values[KEY_HIDDEN_SITES]) ? (values[KEY_HIDDEN_SITES] as string[]) : [];
  render();
  return enabled;
}
enabledToggle.addEventListener('change', () => { void setEnabled(enabledToggle.checked); });
pagesToggle.addEventListener('change', () => { void store({ [KEY_PAGES_ENABLED]: pagesToggle.checked }); });
siteToggle.addEventListener('change', () => {
  if (!site) return;
  const others = hiddenSites.filter(s => s !== site);
  void store({ [KEY_HIDDEN_SITES]: siteToggle.checked ? others : [...others, site] });
});

installApi(PORT_POPUP, {
  // The app shrinks to its companion size when settings close; the buddy itself lives in
  // your tabs, so closing settings closes the popup instead.
  resize(width, height) {
    if (height < SETTINGS_HEIGHT) window.close();
    else Object.assign(root.style, { width: `${width}px`, height: `${Math.min(height, POPUP_MAX_HEIGHT - bar.offsetHeight)}px` });
  },
  setVisible(visible) { if (!visible) window.close(); },
  setHitRects: noop,
  setSettingsVisible: noop,
  dragStart: noop,
  dragEnd: noop,
  // "Turn off Pixel Buddy" in settings flips the master switch; the popup then shows the off card.
  quit() { void setEnabled(false); },
});

createRoot(root).render(<PopupRoot onChange={read} onTurnOn={() => void setEnabled(true)} />);
