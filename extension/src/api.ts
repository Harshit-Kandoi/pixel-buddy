import type { AppSettings, StateMachineData } from '../../src/utils/types';
import { call, type Push, type Rect, type SchedulerAction } from './protocol';

// Where the app is shown: an overlay frame inside a tab, or the toolbar popup.
export interface Host {
  resize(width: number, height: number): void;
  setVisible(visible: boolean): void;
  setHitRects(rects: Rect[]): void;
  setSettingsVisible(visible: boolean): void;
  dragStart(): void;
  dragEnd(): void;
  quit(): void;
}

const DESKTOP_ONLY = 'Custom buddies and sounds need the desktop app. The extension uses the built-in buddy and chime.';

export function showNotice(text: string): void {
  let notice = document.getElementById('ext-notice');
  if (!notice) {
    notice = Object.assign(document.createElement('div'), { id: 'ext-notice', role: 'status' });
    document.body.appendChild(notice);
  }
  notice.textContent = text;
  notice.classList.add('show');
  clearTimeout(Number(notice.dataset.timer));
  notice.dataset.timer = String(setTimeout(() => notice.classList.remove('show'), 4500));
}

// Implements the desktop preload API against the service worker, so the unchanged React app
// runs in the browser. Pushes arrive over a port; `onlyWhileVisible` drops it for hidden tabs.
export function installApi(portName: string, host: Host, { onlyWhileVisible = false } = {}): void {
  const updates = new Set<(data: StateMachineData) => void>();
  const ticks = new Set<(data: StateMachineData) => void>();
  const settingsUpdates = new Set<(settings: AppSettings) => void>();
  const showSettings = new Set<() => void>();
  const subscribe = <T>(listeners: Set<T>, callback: T) => { listeners.add(callback); return () => { listeners.delete(callback); }; };
  const act = (action: SchedulerAction) => { void call({ type: 'action', action }); };
  const desktopOnly = () => { showNotice(DESKTOP_ONLY); };

  let port: chrome.runtime.Port | null = null;
  const wanted = () => !onlyWhileVisible || document.visibilityState === 'visible';
  const connect = () => {
    if (port || !wanted() || !chrome.runtime?.id) return;
    try {
      port = chrome.runtime.connect({ name: portName });
    } catch {
      return; // the extension was reloaded; this frame is orphaned
    }
    port.onMessage.addListener((message: Push) => {
      if (message.type === 'update') updates.forEach(callback => callback(message.data));
      if (message.type === 'tick') ticks.forEach(callback => callback(message.data));
      if (message.type === 'settings') settingsUpdates.forEach(callback => callback(message.settings));
    });
    // The worker restarting closes the port; reconnecting wakes it again.
    port.onDisconnect.addListener(() => { port = null; setTimeout(connect, 1000); });
  };
  document.addEventListener('visibilitychange', () => {
    if (wanted()) connect();
    else { port?.disconnect(); port = null; }
  });
  connect();

  // Report input so smart monitoring can end a break early when you come back.
  let lastPing = 0;
  const ping = () => {
    if (Date.now() - lastPing < 1000 || !chrome.runtime?.id) return;
    lastPing = Date.now();
    void call({ type: 'input' }).catch(() => {});
  };
  for (const type of ['keydown', 'mousedown', 'mousemove', 'wheel']) window.addEventListener(type, ping, { capture: true, passive: true });

  window.api = {
    getSettings: () => call({ type: 'getSettings' }),
    saveSettings: patch => call({ type: 'saveSettings', patch }),
    onSettingsUpdated: callback => subscribe(settingsUpdates, callback),
    getState: () => call({ type: 'getState' }),
    takeBreak: () => act('takeBreak'),
    snooze: () => act('snooze'),
    skip: () => act('skip'),
    reset: () => act('reset'),
    togglePause: () => act('togglePause'),
    onUpdate: callback => subscribe(updates, callback),
    onTick: callback => subscribe(ticks, callback),
    getPermissionStatus: async () => true,
    requestPermission: async () => true,
    setIgnoreMouseEvents() {},
    resize: (width, height) => host.resize(width, height),
    onShowSettings: callback => subscribe(showSettings, callback),
    setSettingsVisible: visible => host.setSettingsVisible(visible),
    setHitRects: rects => host.setHitRects(rects),
    logHydration: () => act('logHydration'),
    snoozeHydration: () => act('snoozeHydration'),
    dismissHydration: () => act('dismissHydration'),
    dragStart: () => host.dragStart(),
    dragMove() {},
    dragEnd: () => host.dragEnd(),
    selectMedia: async () => { desktopOnly(); return null; },
    getPathForFile: () => { desktopOnly(); return ''; },
    saveCustomMedia: async () => null,
    resetMedia: async () => null,
    getMediaLibrary: async () => [],
    deleteMediaLibraryItem: async () => [],
    selectSound: async () => { desktopOnly(); return null; },
    resetSound: async () => null,
    quit: () => host.quit(),
    showWindow: () => host.setVisible(true),
    hideWindow: () => host.setVisible(false),
  };
}
