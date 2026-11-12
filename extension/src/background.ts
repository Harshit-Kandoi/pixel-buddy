import { Scheduler } from '../../src/main/scheduler';
import type { SettingsManager } from '../../src/main/settings';
import type { ActivityMonitor } from '../../src/main/activity';
import { APP_STATES, DEFAULT_SETTINGS, awaySecondsFor } from '../../src/utils/constants';
import { WEBSITE_URL } from '../../src/utils/links';
import type { AppSettings, StateMachineData } from '../../src/utils/types';
import { KEY_SETTINGS, PORT_PAGE, PORT_POPUP, type Call, type Push, type SchedulerAction } from './protocol';

// The service worker owns the one scheduler every tab shares. It reuses the desktop timer
// logic and swaps Electron's file settings and global input hooks for Chrome APIs.

// Seconds without input before you count as away (a setting; chrome.idle allows 15 or more).
const awaySeconds = (): number => awaySecondsFor(settings.awayMinutes);
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
  // A call started or ended: time away counts from now.
  markActive() { if (idleSince !== null) idleSince = Date.now(); },
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
    if (awaySeconds >= awaySecondsFor(settings.awayMinutes) && wasWorking) onBreakDetected?.();
    onActiveResumed?.();
  } else if (idleSince === null) {
    // 'idle' fires after the away time without input; 'locked' fires the moment the screen locks.
    idleSince = state === 'locked' ? Date.now() : Date.now() - awaySeconds() * 1000;
    onIdleDetected?.();
  }
}

// ---- Scheduler ----

let restoring = true; // swallow side effects while start-up rebuilds the saved state
let lastState: StateMachineData | null = null;
const scheduler = new Scheduler(manager, activity, handleChange);
const machine = (): ReturnType<Scheduler['getStateMachine']> => scheduler.getStateMachine();

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
  expireMeetings();
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
    chrome.storage.local.get(KEY_SETTINGS).then(stored => chrome.idle.queryState(awaySecondsFor(stored[KEY_SETTINGS]?.awayMinutes))),
  ]);
  // Custom media and sounds live on disk in the desktop app; the extension uses the defaults.
  settings = { ...DEFAULT_SETTINGS, ...stored[KEY_SETTINGS], mediaLibrary: [], customVideoPath: null, customSoundPath: null };
  chrome.idle.setDetectionInterval(awaySeconds());
  scheduler.start(handleTick);
  restore(session[KEY_MACHINE]);
  if (idleState !== 'active' && settings.smartMonitoringEnabled) idleSince = Date.now() - awaySeconds() * 1000;
  restoring = false;
  lastState = machine().getData();
  if (lastState.state === APP_STATES.IDLE && idleSince === null) machine().transitionTo(APP_STATES.WORKING);
  updateBadge(machine().getData());
})();

// ---- Badge, sound, notifications ----

let badge = '';
function updateBadge(data: StateMachineData): void {
  const minutes = (seconds: number): string => `${Math.max(1, Math.ceil(seconds / 60))}m`;
  let text: string, color: string, title: string;
  if (data.isPaused) [text, color, title] = ['||', '#64748b', 'Reminders paused'];
  else if (data.state === APP_STATES.POPUP) [text, color, title] = ['!', '#f59e0b', 'Time for a break'];
  else if (data.state === APP_STATES.BREAK) [text, color, title] = [minutes(data.breakSecondsLeft), '#10b981', 'On a break'];
  else if (data.state === APP_STATES.SNOOZE) [text, color, title] = [minutes(data.snoozeSecondsLeft), '#8b5cf6', 'Break snoozed'];
  else if (data.state === APP_STATES.IDLE) [text, color, title] = ['zz', '#64748b', 'Away — focus timer paused'];
  else {
    const left = data.skipSecondsLeft > 0 ? data.skipSecondsLeft : settings.workDuration * 60 - data.activeWorkSeconds;
    [text, color, title] = data.inMeeting
      ? [minutes(left), '#0ea5e9', 'On a call — reminders wait until it ends']
      : [minutes(left), '#22a06b', `Next break in ${minutes(left)}`];
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
const buddyInView = (): boolean => [...ports].some(port => port.name === PORT_PAGE);

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

// ---- Calls and meetings ----
// Each tab's content script says when it's on a call (a live camera/mic stream, or a Meet or
// Zoom meeting page) and repeats it every MEETING_REPEAT_MS. A tab that stops repeating
// (closed, crashed, frozen) drops out after MEETING_TTL_MS. Background tabs' timers can slow
// to once a minute, hence the long TTL.
const MEETING_TTL_MS = 150_000;
const meetingTabs = new Map<number, number>(); // tab → when its report expires

function updateMeeting(): void {
  scheduler.setInMeeting(settings.meetingAware && meetingTabs.size > 0);
}

function reportMeeting(tabId: number, active: boolean): void {
  if (active) meetingTabs.set(tabId, Date.now() + MEETING_TTL_MS);
  else meetingTabs.delete(tabId);
  updateMeeting();
}

function expireMeetings(): void {
  if (!meetingTabs.size) return;
  const now = Date.now();
  for (const [tabId, expires] of meetingTabs) if (expires < now) meetingTabs.delete(tabId);
  if (!meetingTabs.size) updateMeeting();
}

chrome.tabs.onRemoved.addListener(tabId => {
  if (meetingTabs.delete(tabId)) updateMeeting();
});

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
    case 'buddyInteraction': return scheduler.handleBuddyInteraction();
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
      if (settings.awayMinutes !== previous.awayMinutes) chrome.idle.setDetectionInterval(awaySeconds());
      scheduler.handleSettingsChanged(previous);
      updateMeeting();
      return snapshot();
    }
    case 'action': runAction(message.action); return null;
    case 'input':
      lastInputAt = Date.now();
      // Input in a tab is proof you're back, even before chrome.idle catches up.
      if (idleSince !== null) handleIdleState('active');
      return null;
    case 'meeting': return null; // handled with the sender's tab in onMessage
  }
}

const fromExtensionPage = (sender: chrome.runtime.MessageSender): boolean => !!sender.url?.startsWith(extensionOrigin);

chrome.runtime.onMessage.addListener((message: Call, sender, sendResponse) => {
  if (typeof message?.type !== 'string') return false;
  if (message.type === 'meeting') {
    const tabId = sender.tab?.id;
    if (tabId !== undefined) void ready.then(() => reportMeeting(tabId, message.active === true));
    return false;
  }
  // Content scripts run inside web pages, so they may only report input (and calls, above).
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

// ---- Welcome and goodbye ----
// First install: a one-page how-to. Uninstall: Chrome opens a one-question survey on the website.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) void chrome.tabs.create({ url: 'welcome.html' });
});
void chrome.runtime.setUninstallURL(`${WEBSITE_URL}goodbye.html?v=${chrome.runtime.getManifest().version}`);
