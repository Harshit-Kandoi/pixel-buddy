import { FRAME_TAG, KEY_ENABLED, KEY_HIDDEN_SITES, KEY_PAGES_ENABLED, type FrameMessage, type Rect } from './protocol';

// Adds the buddy to every tab as an isolated, transparent iframe in the page corner. The
// frame only takes the pointer over the buddy's visible UI; the rest of its box clicks
// through to the page, like the desktop app's click-through window.
//
// This runs in every tab, so it stays cheap: the frame's style is only written when it
// actually changes (each write makes the page recalculate styles), and the pointer check
// uses a cached frame position instead of measuring the page on every mouse move.

type Placement = Extract<FrameMessage, { type: 'frame' }>;

let frame: HTMLIFrameElement | null = null;
let placement: Placement = { type: 'frame', full: false, right: 0, bottom: 0, width: 400, height: 350 };
let visible = false;
let interactive = false;
let hitRects: Rect[] = [];
let lastStyle = '';
let frameBox: { left: number; top: number } | null = null; // measured once per change, on demand

// The master switch, "Show on pages", and this site's own switch, from chrome.storage.local.
let enabled = true;
let pagesEnabled = true;
let siteHidden = false;

const clamp = (value: number, max: number): number => Math.round(Math.min(Math.max(0, value), Math.max(0, max)));

function render(): void {
  if (!frame) return;
  const box: Record<string, string> = placement.full
    ? { top: '0', left: '0', right: 'auto', bottom: 'auto', width: '100%', height: '100%' }
    : {
        top: 'auto',
        left: 'auto',
        right: `${clamp(placement.right, window.innerWidth - placement.width)}px`,
        bottom: `${clamp(placement.bottom, window.innerHeight - placement.height)}px`,
        width: `${placement.width}px`,
        height: `${placement.height}px`,
      };
  const style: Record<string, string> = {
    all: 'initial',
    position: 'fixed',
    ...box,
    border: '0',
    margin: '0',
    padding: '0',
    background: 'transparent',
    // Must match the frame's own scheme, or Chrome paints an opaque backdrop behind it.
    // Explicitly `light` on both sides: `normal` still gets the white backdrop on pages
    // that prefer a dark scheme (e.g. Google in dark mode).
    'color-scheme': 'light',
    'z-index': '2147483647',
    display: visible ? 'block' : 'none',
    'pointer-events': interactive ? 'auto' : 'none',
  };
  const key = JSON.stringify(style);
  if (key === lastStyle) return;
  lastStyle = key;
  frameBox = null;
  for (const [name, value] of Object.entries(style)) frame.style.setProperty(name, value, 'important');
}

function mount(): void {
  if (frame) return;
  frame = document.createElement('iframe');
  frame.src = chrome.runtime.getURL('page.html');
  frame.title = 'Pixel Buddy';
  frame.setAttribute('allowtransparency', 'true');
  frame.allow = 'clipboard-write'; // lets "Copy image" on the share card work inside the frame
  visible = interactive = false;
  hitRects = [];
  lastStyle = '';
  render();
  document.documentElement.appendChild(frame);
}

function unmount(): void {
  frame?.remove();
  frame = null;
}

function sync(): void {
  if (enabled && pagesEnabled && !siteHidden) mount();
  else unmount();
}

window.addEventListener('message', event => {
  if (!frame || event.source !== frame.contentWindow) return;
  const message = (event.data as Record<string, FrameMessage> | null)?.[FRAME_TAG];
  if (!message) return;
  // Hit areas only matter to the pointer check below; they don't change the frame.
  if (message.type === 'hitRects') { hitRects = message.rects; return; }
  if (message.type === 'frame') placement = message;
  if (message.type === 'interactive') interactive = message.value;
  if (message.type === 'visible') {
    visible = message.visible;
    if (!visible) interactive = false;
  }
  render();
});

// While click-through, watch the page's pointer and take it back over the buddy's UI.
window.addEventListener('mousemove', event => {
  if (!frame || !visible || interactive || !hitRects.length) return;
  frameBox ??= (({ left, top }) => ({ left, top }))(frame.getBoundingClientRect());
  const x = event.clientX - frameBox.left;
  const y = event.clientY - frameBox.top;
  if (hitRects.some(r => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height)) {
    interactive = true;
    render();
  }
}, { capture: true, passive: true });

window.addEventListener('resize', () => { frameBox = null; render(); }, { passive: true });

// Reloading, updating, or removing the extension kills the frame's page but leaves this
// script running in tabs that were already open; clear the dead frame off the page.
const orphanCheck = setInterval(() => {
  if (chrome.runtime?.id) return;
  clearInterval(orphanCheck);
  unmount();
}, 5000);

// Page input counts toward smart monitoring, like the desktop app's global input hook.
// Turned off, Pixel Buddy doesn't listen at all.
let lastPing = 0;
const ping = (): void => {
  if (!enabled || Date.now() - lastPing < 1000 || !chrome.runtime?.id) return;
  lastPing = Date.now();
  chrome.runtime.sendMessage({ type: 'input' }).catch(() => {});
};
for (const type of ['keydown', 'mousedown', 'mousemove', 'wheel', 'touchstart']) window.addEventListener(type, ping, { capture: true, passive: true });

// Calls: while this tab is on one, the buddy holds break and water reminders. A call is a page
// playing a live camera or microphone stream (any site: Meet, Teams, Zoom, Slack, Discord…),
// or a Google Meet or Zoom meeting page. Checked every few seconds while the tab is visible
// (and once a minute behind other tabs, where Chrome slows timers anyway); the worker forgets
// a tab that stops reporting.
const MEETING_CHECK_MS = 15000;
const MEETING_REPEAT_MS = 30000;
const isLiveStream = (media: HTMLMediaElement): boolean =>
  Object.prototype.toString.call(media.srcObject) === '[object MediaStream]' && !media.paused;
function onCall(): boolean {
  const { hostname, pathname } = location;
  if (hostname === 'meet.google.com' && /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}(\/|$)/.test(pathname)) return true;
  if (/(^|\.)zoom\.us$/.test(hostname) && /^\/wc\//.test(pathname)) return true;
  // Cheap first: most pages have no media elements at all.
  const media = document.getElementsByTagName('video').length + document.getElementsByTagName('audio').length;
  return media > 0 && Array.from(document.querySelectorAll<HTMLMediaElement>('video, audio')).some(isLiveStream);
}
let reportedCall = false;
let lastCallReport = 0;
function reportCall(active: boolean): void {
  if (!chrome.runtime?.id) return;
  if (active === reportedCall && (!active || Date.now() - lastCallReport < MEETING_REPEAT_MS)) return;
  reportedCall = active;
  lastCallReport = Date.now();
  chrome.runtime.sendMessage({ type: 'meeting', active }).catch(() => {});
}
const callCheck = setInterval(() => {
  if (!chrome.runtime?.id) { clearInterval(callCheck); return; }
  if (enabled) reportCall(onCall());
}, MEETING_CHECK_MS);
window.addEventListener('pagehide', () => { if (reportedCall) reportCall(false); });

// Video playing in this tab (not a call): watching isn't being away, so the worker keeps you
// "here" while it plays. Same repeat-and-expire scheme as calls.
const isWatchedVideo = (video: HTMLVideoElement): boolean =>
  !video.paused && !video.ended && video.readyState > 2 && video.videoWidth > 0 && !isLiveStream(video);
function videoPlaying(): boolean {
  if (!document.getElementsByTagName('video').length) return false;
  return Array.from(document.getElementsByTagName('video')).some(isWatchedVideo);
}
let reportedMedia = false;
let lastMediaReport = 0;
function reportMedia(active: boolean): void {
  if (!chrome.runtime?.id) return;
  if (active === reportedMedia && (!active || Date.now() - lastMediaReport < MEETING_REPEAT_MS)) return;
  reportedMedia = active;
  lastMediaReport = Date.now();
  chrome.runtime.sendMessage({ type: 'media', active }).catch(() => {});
}
const mediaCheck = setInterval(() => {
  if (!chrome.runtime?.id) { clearInterval(mediaCheck); return; }
  if (enabled) reportMedia(videoPlaying());
}, MEETING_CHECK_MS);
window.addEventListener('pagehide', () => { if (reportedMedia) reportMedia(false); });

if (document.documentElement instanceof HTMLElement) {
  const host = location.hostname;
  const read = (stored: Record<string, unknown>): void => {
    if (KEY_ENABLED in stored) enabled = stored[KEY_ENABLED] !== false;
    if (KEY_PAGES_ENABLED in stored) pagesEnabled = stored[KEY_PAGES_ENABLED] !== false;
    if (KEY_HIDDEN_SITES in stored) siteHidden = Array.isArray(stored[KEY_HIDDEN_SITES]) && (stored[KEY_HIDDEN_SITES] as string[]).includes(host);
  };
  void chrome.storage.local.get([KEY_ENABLED, KEY_PAGES_ENABLED, KEY_HIDDEN_SITES]).then(stored => { read(stored); sync(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !(KEY_ENABLED in changes || KEY_PAGES_ENABLED in changes || KEY_HIDDEN_SITES in changes)) return;
    const values: Record<string, unknown> = {};
    for (const key of [KEY_ENABLED, KEY_PAGES_ENABLED, KEY_HIDDEN_SITES]) if (key in changes) values[key] = changes[key].newValue;
    read(values);
    if (!enabled && reportedCall) reportCall(false);
    sync();
  });
}
