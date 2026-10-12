import '../../src/renderer/src/index.css';
import './extension.css';
import { createRoot } from 'react-dom/client';
import App from '../../src/renderer/src/App';
import { installApi } from './api';
import { FRAME_TAG, KEY_PAGES_ENABLED, KEY_POSITION, PORT_PAGE, type FrameMessage, type Position, type Rect } from './protocol';

// Runs inside the overlay iframe the content script adds to each tab. The frame covers the
// whole viewport and stays put; the app is positioned and dragged inside it. (An iframe
// that moves while dragged gets unreliable pointer coordinates.) Everything outside the
// app's visible UI is click-through, which the content script toggles on the frame.
const post = (message: FrameMessage) => window.parent.postMessage({ [FRAME_TAG]: message }, '*');
const root = document.getElementById('root')!;
const UI_SELECTOR = '.buddy-container, .speech-bubble, .widget-panel, .side-controls, .settings-trigger, .display-close, .settings-panel';
const DEFAULT_POSITION: Position = { right: 0, bottom: 0 };

let size = { width: 400, height: 350 };
let position = DEFAULT_POSITION;
let hitRects: Rect[] = [];
let drag: { x: number; y: number; from: Position } | null = null;
let pressedAt = { x: 0, y: 0 };

const clamp = (value: number, max: number) => Math.round(Math.min(Math.max(0, value), Math.max(0, max)));
const clampPosition = (p: Position): Position => ({
  right: clamp(p.right, window.innerWidth - size.width),
  bottom: clamp(p.bottom, window.innerHeight - size.height),
});

function layout(): void {
  const { right, bottom } = clampPosition(position);
  Object.assign(root.style, { right: `${right}px`, bottom: `${bottom}px`, width: `${size.width}px`, height: `${size.height}px` });
}

// Tell the content script where the visible UI is, so it can take the pointer over it.
setInterval(() => {
  const rects = Array.from(document.querySelectorAll<HTMLElement>(UI_SELECTOR), el => {
    const r = el.getBoundingClientRect();
    return { x: Math.floor(r.left) - 4, y: Math.floor(r.top) - 4, width: Math.ceil(r.width) + 8, height: Math.ceil(r.height) + 8 };
  });
  if (JSON.stringify(rects) === JSON.stringify(hitRects)) return;
  hitRects = rects;
  post({ type: 'hitRects', rects });
}, 100);

installApi(PORT_PAGE, {
  resize: (width, height) => { size = { width, height }; layout(); },
  setVisible: visible => post({ type: 'visible', visible }),
  setHitRects() {},
  setSettingsVisible() {},
  // Measured from the mousedown, so the buddy stays under the cursor past the drag threshold.
  dragStart: () => { drag = { ...pressedAt, from: clampPosition(position) }; },
  dragEnd: () => {
    drag = null;
    position = clampPosition(position);
    void chrome.storage.local.set({ [KEY_POSITION]: position });
  },
  quit: () => { void chrome.storage.local.set({ [KEY_PAGES_ENABLED]: false }); },
}, { onlyWhileVisible: true });

window.addEventListener('mousedown', e => { pressedAt = { x: e.clientX, y: e.clientY }; }, true);
window.addEventListener('mousemove', e => {
  if (drag) {
    position = { right: drag.from.right - (e.clientX - drag.x), bottom: drag.from.bottom - (e.clientY - drag.y) };
    layout();
    return;
  }
  // Hand the pointer back to the page once it leaves the UI.
  if (!e.buttons && !(e.target as Element).closest?.(UI_SELECTOR)) post({ type: 'interactive', value: false });
}, true);
window.addEventListener('resize', layout);

// Other tabs share the position, so a drag in one tab moves the buddy everywhere.
void chrome.storage.local.get(KEY_POSITION).then(stored => { position = stored[KEY_POSITION] ?? DEFAULT_POSITION; layout(); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !(KEY_POSITION in changes) || drag) return;
  position = changes[KEY_POSITION].newValue ?? DEFAULT_POSITION;
  layout();
});

layout();
createRoot(root).render(<App initialShowSettings={false} />);
