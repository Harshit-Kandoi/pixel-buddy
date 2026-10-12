import { FRAME_TAG, KEY_PAGES_ENABLED, type FrameMessage, type Rect } from './protocol';

// Adds the buddy to every tab as an isolated, transparent iframe in the page corner. The
// frame only takes the pointer over the buddy's visible UI; the rest of its box clicks
// through to the page, like the desktop app's click-through window.

type Placement = Extract<FrameMessage, { type: 'frame' }>;

let frame: HTMLIFrameElement | null = null;
let placement: Placement = { type: 'frame', full: false, right: 0, bottom: 0, width: 400, height: 350 };
let visible = false;
let interactive = false;
let hitRects: Rect[] = [];

const clamp = (value: number, max: number) => Math.round(Math.min(Math.max(0, value), Math.max(0, max)));

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
    'color-scheme': 'normal',
    'z-index': '2147483647',
    display: visible ? 'block' : 'none',
    'pointer-events': interactive ? 'auto' : 'none',
  };
  for (const [name, value] of Object.entries(style)) frame.style.setProperty(name, value, 'important');
}

function mount(): void {
  if (frame) return;
  frame = document.createElement('iframe');
  frame.src = chrome.runtime.getURL('page.html');
  frame.title = 'Pixel Buddy';
  frame.setAttribute('allowtransparency', 'true');
  visible = interactive = false;
  hitRects = [];
  render();
  document.documentElement.appendChild(frame);
}

function unmount(): void {
  frame?.remove();
  frame = null;
}

window.addEventListener('message', event => {
  if (!frame || event.source !== frame.contentWindow) return;
  const message = (event.data as Record<string, FrameMessage> | null)?.[FRAME_TAG];
  if (!message) return;
  if (message.type === 'frame') placement = message;
  if (message.type === 'hitRects') hitRects = message.rects;
  if (message.type === 'interactive') interactive = message.value;
  if (message.type === 'visible') {
    visible = message.visible;
    if (!visible) interactive = false;
  }
  render();
});

// While click-through, watch the page's pointer and take it back over the buddy's UI.
window.addEventListener('mousemove', event => {
  if (!frame || !visible || interactive) return;
  const box = frame.getBoundingClientRect();
  const x = event.clientX - box.left;
  const y = event.clientY - box.top;
  if (hitRects.some(r => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height)) {
    interactive = true;
    render();
  }
}, { capture: true, passive: true });

window.addEventListener('resize', render, { passive: true });

// Reloading, updating, or removing the extension kills the frame's page but leaves this
// script running in tabs that were already open; clear the dead frame off the page.
const orphanCheck = setInterval(() => {
  if (chrome.runtime?.id) return;
  clearInterval(orphanCheck);
  unmount();
}, 2000);

// Page input counts toward smart monitoring, like the desktop app's global input hook.
let lastPing = 0;
const ping = () => {
  if (Date.now() - lastPing < 1000 || !chrome.runtime?.id) return;
  lastPing = Date.now();
  chrome.runtime.sendMessage({ type: 'input' }).catch(() => {});
};
for (const type of ['keydown', 'mousedown', 'mousemove', 'wheel', 'touchstart']) window.addEventListener(type, ping, { capture: true, passive: true });

if (document.documentElement instanceof HTMLElement) {
  void chrome.storage.local.get(KEY_PAGES_ENABLED).then(stored => {
    if (stored[KEY_PAGES_ENABLED] !== false) mount();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !(KEY_PAGES_ENABLED in changes)) return;
    if (changes[KEY_PAGES_ENABLED].newValue === false) unmount();
    else mount();
  });
}
