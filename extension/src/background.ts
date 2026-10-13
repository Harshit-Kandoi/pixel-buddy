import { Scheduler } from '../../src/main/scheduler';
import type { SettingsManager } from '../../src/main/settings';
import type { ActivityMonitor } from '../../src/main/activity';
import { APP_STATES, DEFAULT_SETTINGS } from '../../src/utils/constants';
import type { AppSettings, StateMachineData } from '../../src/utils/types';
import { KEY_SETTINGS, PORT_PAGE, PORT_POPUP, type Call, type Push, type SchedulerAction } from './protocol';

// The service worker owns the one scheduler every tab shares. It reuses the desktop timer
// logic and swaps Electron's file settings and global input hooks for Chrome APIs.

const IDLE_SECONDS = 300;
const KEY_MACHINE = 'machine'; // chrome.storage.session: survives worker restarts, not browser restarts
const NOTIFY_BREAK = 'break';
const NOTIFY_WATER = 'water';
const extensionOrigin = chrome.runtime.getURL('');

// ---- Settings (chrome.storage.local instead of settings.json) ----

let settings: AppSettings = { ...DEFAULT_SETTINGS };
const snapshot = (): AppSettings => ({ ...settings, mediaLibrary: [...settings.mediaLibrary] });

function saveSettings(patch: Partial<AppSettings>): void {
  settings = { ...settings, ...patch };
  void chrome.storage.local.set({ [KEY_SETTINGS]: settings });
  broadcast({ type: 'settings', settings: snapshot() });
}

function checkDailyReset(): void {
  const today = new Date().toLocaleDateString('en-CA');
  if (settings.hydrationLastResetDate === today) return;
  saveSettings({
    hydrationDrankToday: 0,
    statsFocusMinutesToday: 0,
    statsBreaksCompletedToday: 0,
    statsBreaksSkippedToday: 0,
    statsBreaksSnoozedToday: 0,
    hydrationLastResetDate: today,
  });
}

const manager = {
  getSettings: () => { checkDailyReset(); return snapshot(); },
  save: saveSettings,
} as unknown as SettingsManager;

// ---- Activity (chrome.idle + input pings from tabs instead of uiohook) ----

let lastInputAt = 0;
let idleSince: number | null = null;
let wasWorking = true;
let onBreakDetected: (() => void) | null = null;
let onIdleDetected: (() => void) | null = null;
let onActiveResumed: (() => void) | null = null;

const activity = {
  start(onBreak: () => void, onIdle: () => void, onActive: () => void) {
    onBreakDetected = onBreak; onIdleDetected = onIdle; onActiveResumed = onActive;
  },
  stop() { onBreakDetected = onIdleDetected = onActiveResumed = null; },
  resetMinuteScore() { lastInputAt = 0; },
  getContinuousIdleSeconds: () =>
    settings.smartMonitoringEnabled && idleSince !== null ? Math.floor((Date.now() - idleSince) / 1000) : 0,
  // "Active this second" only ends a break early, so it uses input seen in a browser tab.
  tick(isStateWorking: boolean, smartMonitoringEnabled = true) {
    wasWorking = isStateWorking;
    return { isActiveThisSecond: !smartMonitoringEnabled || Date.now() - lastInputAt < 1500, currentMinuteScore: 0 };
  },
} as unknown as ActivityMonitor;

function handleIdleState(state: `${chrome.idle.IdleState}`): void {
  if (!settings.smartMonitoringEnabled) { idleSince = null; return; }
  if (state === 'active') {
    if (idleSince === null) return;
    const awaySeconds = (Date.now() - idleSince) / 1000;
    idleSince = null;
    if (awaySeconds >= IDLE_SECONDS && wasWorking) onBreakDetected?.();
    onActiveResumed?.();
  } else if (idleSince === null) {
    // 'idle' fires after IDLE_SECONDS without input; 'locked' fires the moment the screen locks.
    idleSince = state === 'locked' ? Date.now() : Date.now() - IDLE_SECONDS * 1000;
    onIdleDetected?.();
  }
}

// ---- Scheduler ----

let restoring = true; // swallow side effects while start-up rebuilds the saved state
let lastState: StateMachineData | null = null;
const scheduler = new Scheduler(manager, activity, handleChange);
const machine = () => scheduler.getStateMachine();

let pendingUpdate: StateMachineData | null = null;
function handleChange(data: StateMachineData): void {
  if (restoring) return;
  const previous = lastState;
  lastState = data;
  if (data.state === APP_STATES.POPUP && previous?.state !== APP_STATES.POPUP) remindBreak(data);
  if (data.state !== APP_STATES.POPUP) void chrome.notifications.clear(NOTIFY_BREAK);
  if (data.hydrationReminderActive && !previous?.hydrationReminderActive) remindWater();
  if (!data.hydrationReminderActive) void chrome.notifications.clear(NOTIFY_WATER);

  // The state machine emits once per field it changes; send tabs only the settled result.
  if (!pendingUpdate) setTimeout(() => {
    const update = pendingUpdate!;
    pendingUpdate = null;
    broadcast({ type: 'update', data: update });
    persist(update);
  });
  pendingUpdate = data;
}

function handleTick(data: StateMachineData): void {
  broadcast({ type: 'tick', data });
  // Writing every second also keeps the worker alive (extension API calls reset its idle timer).
  persist(data);
}

function persist(data: StateMachineData): void {
  void chrome.storage.session.set({ [KEY_MACHINE]: { data, at: Date.now() } });
  updateBadge(data);
}

function restore(saved: { data: StateMachineData; at: number } | undefined): void {
  if (!saved) return;
  const { data } = saved;
  const sm = machine();
  sm.setWorkSeconds(data.activeWorkSeconds);
  sm.setBreakSeconds(data.breakSecondsLeft);
  sm.setSnoozeSeconds(data.snoozeSecondsLeft);
  sm.setSkipSeconds(data.skipSecondsLeft);
  for (let i = 0; i < data.skipsCount; i++) sm.incrementSkips();
  sm.setHydrationSeconds(data.hydrationSecondsLeft);
  sm.setHydrationReminderActive(data.hydrationReminderActive);
  sm.togglePause(data.isPaused);
  sm.transitionTo(data.state);
}

const ready = (async () => {
  const [stored, session, idleState] = await Promise.all([
    chrome.storage.local.get(KEY_SETTINGS),
    chrome.storage.session.get(KEY_MACHINE),
    chrome.idle.queryState(IDLE_SECONDS),
  ]);
  // Custom media and sounds live on disk in the desktop app; the extension uses the defaults.
  settings = { ...DEFAULT_SETTINGS, ...stored[KEY_SETTINGS], mediaLibrary: [], customVideoPath: null, customSoundPath: null };
  chrome.idle.setDetectionInterval(IDLE_SECONDS);
  scheduler.start(handleTick);
  restore(session[KEY_MACHINE]);
  if (idleState !== 'active' && settings.smartMonitoringEnabled) idleSince = Date.now() - IDLE_SECONDS * 1000;
  restoring = false;
  lastState = machine().getData();
  if (lastState.state === APP_STATES.IDLE && idleSince === null) machine().transitionTo(APP_STATES.WORKING);
  updateBadge(machine().getData());
})();

// ---- Badge, sound, notifications ----

let badge = '';
function updateBadge(data: StateMachineData): void {
  const minutes = (seconds: number) => `${Math.max(1, Math.ceil(seconds / 60))}m`;
  let text: string, color: string, title: string;
  if (data.isPaused) [text, color, title] = ['||', '#64748b', 'Reminders paused'];
  else if (data.state === APP_STATES.POPUP) [text, color, title] = ['!', '#f59e0b', 'Time for a break'];
  else if (data.state === APP_STATES.BREAK) [text, color, title] = [minutes(data.breakSecondsLeft), '#10b981', 'On a break'];
  else if (data.state === APP_STATES.SNOOZE) [text, color, title] = [minutes(data.snoozeSecondsLeft), '#8b5cf6', 'Break snoozed'];
  else if (data.state === APP_STATES.IDLE) [text, color, title] = ['zz', '#64748b', 'Away — focus timer paused'];
  else {
    const left = data.skipSecondsLeft > 0 ? data.skipSecondsLeft : settings.workDuration * 60 - data.activeWorkSeconds;
    [text, color, title] = [minutes(left), '#22a06b', `Next break in ${minutes(left)}`];
  }
  const key = `${text}|${color}|${title}`;
  if (key === badge) return;
  badge = key;
  void chrome.action.setBadgeText({ text });
  void chrome.action.setBadgeBackgroundColor({ color });
  void chrome.action.setTitle({ title: `Pixel Buddy — ${title}` });
}

// Tabs mute their own reminder chimes (one per open tab would be noisy), so the worker
// plays them once through an offscreen document, which is allowed to play audio.
let offscreen: Promise<void> | null = null;
async function playSound(kind: 'chime' | 'worried'): Promise<void> {
  if (!settings.sound) return;
  try {
    const open = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
    if (!open.length) {
      offscreen ??= chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
        justification: 'Play the break reminder chime.',
      }).finally(() => { offscreen = null; });
      await offscreen;
    }
    await chrome.runtime.sendMessage({ type: 'play', kind });
  } catch (error) {
    console.warn('Could not play reminder sound:', error);
  }
}

// Ports are only open from tabs the user can see, so none means the buddy is out of sight.
const buddyInView = () => [...ports].some(port => port.name === PORT_PAGE);

function remindBreak(data: StateMachineData): void {
  void playSound(data.skipsCount >= 3 ? 'worried' : 'chime');
  if (buddyInView()) return;
  chrome.notifications.create(NOTIFY_BREAK, {
    type: 'basic', iconUrl: 'icons/icon-128.png', silent: true, requireInteraction: true,
    title: `Hey ${settings.userName || 'there'}, time for a break!`,
    message: `You've been focused for ${settings.workDuration} minutes. Stretch, rest your eyes, and take a breath.`,
    buttons: [{ title: 'Take break' }, { title: 'Snooze' }],
  });
}

function remindWater(): void {
  if (buddyInView()) return;
  chrome.notifications.create(NOTIFY_WATER, {
    type: 'basic', iconUrl: 'icons/icon-128.png', silent: true,
    title: 'Time for a water break 💧', message: 'Stay hydrated to keep focused.',
    buttons: [{ title: 'Drank water' }, { title: 'Snooze 10m' }],
  });
}

// ---- Messaging ----

const ports = new Set<chrome.runtime.Port>();
function broadcast(message: Push): void {
  for (const port of ports) {
    try { port.postMessage(message); } catch { ports.delete(port); }
  }
}

function runAction(action: SchedulerAction): void {
  switch (action) {
    case 'takeBreak': return scheduler.handleTakeBreak();
    case 'snooze': return scheduler.handleSnooze();
    case 'skip': return scheduler.handleSkip();
    case 'reset': return scheduler.handleReset();
    case 'togglePause': return machine().togglePause();
    case 'logHydration': return scheduler.handleLogHydration();
    case 'snoozeHydration': return scheduler.handleSnoozeHydration();
    case 'dismissHydration': return scheduler.handleDismissHydration();
  }
}

function handleCall(message: Call): unknown {
  switch (message.type) {
    case 'getSettings': return manager.getSettings();
    case 'getState': return machine().getData();
    case 'saveSettings': {
      const previous = snapshot();
      saveSettings(message.patch);
      if (!settings.smartMonitoringEnabled) idleSince = null;
      scheduler.handleSettingsChanged(previous);
      return snapshot();
    }
    case 'action': runAction(message.action); return null;
    case 'input':
      lastInputAt = Date.now();
      // Input in a tab is proof you're back, even before chrome.idle catches up.
      if (idleSince !== null) handleIdleState('active');
      return null;
  }
}

const fromExtensionPage = (sender: chrome.runtime.MessageSender) => !!sender.url?.startsWith(extensionOrigin);

chrome.runtime.onMessage.addListener((message: Call, sender, sendResponse) => {
  if (typeof message?.type !== 'string') return false;
  // Content scripts run inside web pages, so they may only report input.
  if (message.type !== 'input' && !fromExtensionPage(sender)) return false;
  ready.then(() => sendResponse(handleCall(message)), () => sendResponse(null));
  return true;
});

chrome.runtime.onConnect.addListener(port => {
  if ((port.name !== PORT_PAGE && port.name !== PORT_POPUP) || !port.sender || !fromExtensionPage(port.sender)) {
    port.disconnect();
    return;
  }
  ports.add(port);
  port.onDisconnect.addListener(() => ports.delete(port));
  void ready.then(() => {
    port.postMessage({ type: 'settings', settings: manager.getSettings() } satisfies Push);
    port.postMessage({ type: 'update', data: machine().getData() } satisfies Push);
  });
});

chrome.idle.onStateChanged.addListener(state => { void ready.then(() => handleIdleState(state)); });

chrome.notifications.onButtonClicked.addListener((id, index) => {
  void ready.then(() => {
    if (id === NOTIFY_BREAK) runAction(index === 0 ? 'takeBreak' : 'snooze');
    if (id === NOTIFY_WATER) runAction(index === 0 ? 'logHydration' : 'snoozeHydration');
    void chrome.notifications.clear(id);
  });
});

// A periodic alarm restarts the worker if Chrome ever suspends it.
chrome.alarms.onAlarm.addListener(() => { void ready; });
void chrome.alarms.get('keepalive').then(alarm => {
  if (!alarm) void chrome.alarms.create('keepalive', { periodInMinutes: 0.5 });
});
