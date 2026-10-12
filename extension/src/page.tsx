import '../../src/renderer/src/index.css';
import './extension.css';
import { createRoot } from 'react-dom/client';
import App from '../../src/renderer/src/App';
import { installApi } from './api';
import { FRAME_TAG, KEY_PAGES_ENABLED, KEY_POSITION, PORT_PAGE, type FrameMessage, type Position, type Rect } from './protocol';

// Runs inside the overlay iframe the content script adds to each tab. The frame is just
// the app's box in the page corner, so if it ever fails to render it can only cover that
// box. While dragging, the frame briefly covers the viewport and the app moves inside it:
// a frame that moves under the pointer gets unreliable pointer coordinates.
const post = (message: FrameMessage) => window.parent.postMessage({ [FRAME_TAG]: message }, '*');
const root = document.getElementById('root')!;
const UI_SELECTOR = '.buddy-container, .speech-bubble, .widget-panel, .side-controls, .settings-trigger, .display-close, .settings-panel';
const DEFAULT_POSITION: Position = { right: 0, bottom: 0 };

let size = { width: 400, height: 350 };
let position = DEFAULT_POSITION;
let hitRects: Rect[] = [];
let dragging = false;
let pressedAt = { x: 0, y: 0 };
let dragFrom = DEFAULT_POSITION;

const clamp = (value: number, max: number) => Math.round(Math.min(Math.max(0, value), Math.max(0, max)));
// Only meaningful while the frame covers the viewport; otherwise the content script clamps.
const clampToViewport = (p: Position): Position => ({
  right: clamp(p.right, window.innerWidth - size.width),
  bottom: clamp(p.bottom, window.innerHeight - size.height),
});
const expanded = () => window.innerWidth > size.width || window.innerHeight > size.height;

function layout(): void {
  const at = dragging ? clampToViewport(position) : DEFAULT_POSITION;
  Object.assign(root.style, {
    right: `${at.right}px`,
    bottom: `${at.bottom}px`,
    width: `${size.width}px`,
    height: `${size.height}px`,
    // Hidden for the instant between asking to expand and the frame actually growing, so
    // the buddy doesn't flash at the frame's corner.
    visibility: dragging && !expanded() ? 'hidden' : '',
  });
  post(dragging ? { type: 'frame', full: true } : { type: 'frame', full: false, ...position, ...size });
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
  dragStart: () => { dragging = true; dragFrom = position; layout(); },
  dragEnd: () => {
    if (expanded()) position = clampToViewport(position);
    dragging = false;
    layout();
    void chrome.storage.local.set({ [KEY_POSITION]: position });
  },
  quit: () => { void chrome.storage.local.set({ [KEY_PAGES_ENABLED]: false }); },
}, { onlyWhileVisible: true });

window.addEventListener('mousedown', e => { pressedAt = { x: e.clientX, y: e.clientY }; }, true);
window.addEventListener('mousemove', e => {
  if (dragging) {
    // Measure from the mousedown in page coordinates. Until the frame has expanded, the
    // pointer is still relative to the (unmoved) box, so the box's page offset is zero.
    let base = dragFrom;
    let offset = { x: 0, y: 0 };
    if (expanded()) {
      base = clampToViewport(dragFrom);
      offset = { x: window.innerWidth - base.right - size.width, y: window.innerHeight - base.bottom - size.height };
    }
    position = { right: base.right - (e.clientX - offset.x - pressedAt.x), bottom: base.bottom - (e.clientY - offset.y - pressedAt.y) };
    if (expanded()) layout();
    return;
  }
  // Hand the pointer back to the page once it leaves the UI.
  if (!e.buttons && !(e.target as Element).closest?.(UI_SELECTOR)) post({ type: 'interactive', value: false });
}, true);
window.addEventListener('resize', () => { if (dragging) layout(); });

// Other tabs share the position, so a drag in one tab moves the buddy everywhere.
void chrome.storage.local.get(KEY_POSITION).then(stored => { position = stored[KEY_POSITION] ?? DEFAULT_POSITION; layout(); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !(KEY_POSITION in changes) || dragging) return;
  position = changes[KEY_POSITION].newValue ?? DEFAULT_POSITION;
  layout();
});

layout();
createRoot(root).render(<App initialShowSettings={false} />);
