import { Scheduler } from '../src/main/scheduler';
import type { SettingsManager } from '../src/main/settings';
import type { ActivityMonitor } from '../src/main/activity';
import { DEFAULT_SETTINGS } from '../src/utils/constants';
import type { AppSettings, StateMachineData } from '../src/utils/types';

let settings: AppSettings = { ...DEFAULT_SETTINGS, mediaLibrary: [], sound: false };
const updates = new Set<(data: StateMachineData) => void>();
const ticks = new Set<(data: StateMachineData) => void>();
const settingsUpdates = new Set<(settings: AppSettings) => void>();
const showSettings = new Set<() => void>();
const snapshot = () => ({ ...settings, mediaLibrary: [...settings.mediaLibrary] });
const notify = (text: string) => { document.getElementById('preview-notice')!.textContent = text; };

// Run the real timer logic against browser-only adapters; no Electron or filesystem access.
const manager = {
  getSettings: snapshot,
  save(patch: Partial<AppSettings>) {
    settings = { ...settings, ...patch };
    settingsUpdates.forEach(callback => callback(snapshot()));
  },
} as unknown as SettingsManager;
const activity = {
  start() {}, stop() {}, resetMinuteScore() {},
  getContinuousIdleSeconds: () => 0,
  tick: () => ({ isActiveThisSecond: false, currentMinuteScore: 0 }),
} as unknown as ActivityMonitor;
const scheduler = new Scheduler(manager, activity, data => updates.forEach(callback => callback({ ...data })));
const desktopOnly = () => { notify('That control needs the desktop app. The browser preview has no file, permission, or system access.'); };
const subscribe = <T>(listeners: Set<T>, callback: T) => { listeners.add(callback); return () => { listeners.delete(callback); }; };

window.api = {
  getSettings: async () => snapshot(),
  saveSettings: async patch => { const previous = snapshot(); manager.save(patch); scheduler.handleSettingsChanged(previous); return snapshot(); },
  onSettingsUpdated: callback => subscribe(settingsUpdates, callback),
  getState: async () => scheduler.getStateMachine().getData(),
  takeBreak: () => scheduler.handleTakeBreak(),
  snooze: () => scheduler.handleSnooze(),
  skip: () => scheduler.handleSkip(),
  reset: () => scheduler.handleReset(),
  togglePause: () => scheduler.getStateMachine().togglePause(),
  onUpdate: callback => subscribe(updates, callback),
  onTick: callback => subscribe(ticks, callback),
  getPermissionStatus: async () => false,
  requestPermission: async () => { desktopOnly(); return false; },
  setIgnoreMouseEvents() {},
  resize(width, height) {
    const root = document.getElementById('root')!;
    root.style.width = `${width}px`; root.style.height = `${height}px`;
  },
  onShowSettings: callback => subscribe(showSettings, callback),
  setSettingsVisible() {}, setDialogueActive() {}, setWidgetsVisible() {},
  logHydration: () => scheduler.handleLogHydration(),
  snoozeHydration: () => scheduler.handleSnoozeHydration(),
  dismissHydration: () => scheduler.handleDismissHydration(),
  dragStart: desktopOnly, dragMove() {}, dragEnd() {},
  selectMedia: async () => { desktopOnly(); return null; },
  getPathForFile: () => { desktopOnly(); return ''; },
  saveCustomMedia: async () => { desktopOnly(); return null; },
  resetMedia: async () => null,
  getMediaLibrary: async () => [],
  deleteMediaLibraryItem: async () => [],
  selectSound: async () => { desktopOnly(); return null; },
  resetSound: async () => null,
  quit: desktopOnly,
  showWindow() {}, hideWindow() {},
};

export const preview = {
  openSettings: () => showSettings.forEach(callback => callback()),
  focus: () => scheduler.handleReset(),
  reminder: () => { scheduler.handleReset(); scheduler.getStateMachine().setWorkSeconds(settings.workDuration * 60); scheduler.getStateMachine().transitionTo('POPUP'); },
  break: () => { scheduler.handleReset(); scheduler.handleTakeBreak(); },
  water: () => { scheduler.handleReset(); scheduler.getStateMachine().setHydrationSeconds(0); scheduler.getStateMachine().setHydrationReminderActive(true); },
};
scheduler.start(data => ticks.forEach(callback => callback({ ...data })));
window.addEventListener('pagehide', () => scheduler.stop());
