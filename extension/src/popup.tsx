import '../../src/renderer/src/index.css';
import './extension.css';
import { createRoot } from 'react-dom/client';
import App from '../../src/renderer/src/App';
import { installApi, showNotice } from './api';
import { KEY_PAGES_ENABLED, PORT_POPUP } from './protocol';

// The toolbar popup opens straight into settings and stats, plus a switch for the in-tab buddy.
const SETTINGS_HEIGHT = 560;
const root = document.getElementById('root')!;
const toggle = document.getElementById('pages-enabled') as HTMLInputElement;

const setPagesEnabled = (enabled: boolean) => chrome.storage.local.set({ [KEY_PAGES_ENABLED]: enabled });
void chrome.storage.local.get(KEY_PAGES_ENABLED).then(stored => { toggle.checked = stored[KEY_PAGES_ENABLED] !== false; });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && KEY_PAGES_ENABLED in changes) toggle.checked = changes[KEY_PAGES_ENABLED].newValue !== false;
});
toggle.addEventListener('change', () => { void setPagesEnabled(toggle.checked); });

installApi(PORT_POPUP, {
  // The app shrinks to its companion size when settings close; the buddy itself lives in
  // your tabs, so closing settings closes the popup instead.
  resize(width, height) {
    if (height < SETTINGS_HEIGHT) window.close();
    else Object.assign(root.style, { width: `${width}px`, height: `${height}px` });
  },
  setVisible(visible) { if (!visible) window.close(); },
  setHitRects() {},
  setSettingsVisible() {},
  dragStart() {},
  dragEnd() {},
  quit() {
    void setPagesEnabled(false);
    showNotice('Pixel Buddy is hidden on web pages. Switch "Show on pages" back on any time.');
  },
});

createRoot(root).render(<App />);
