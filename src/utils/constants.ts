export const APP_STATES = {
  WORKING: 'WORKING',
  POPUP: 'POPUP',
  BREAK: 'BREAK',
  SNOOZE: 'SNOOZE',
  IDLE: 'IDLE',
} as const;

export type AppState = keyof typeof APP_STATES;

export const DEFAULT_SETTINGS = {
  workDuration: 55, // in minutes
  breakDuration: 5, // in minutes
  snoozeDuration: 30, // in minutes
  skipDuration: 10, // in minutes
  maxSkips: 3,
  startOnBoot: true,
  sound: true,
  alwaysVisible: true,
  themeHue: 153, // soft green companion theme
  customVideoPath: null as string | null,
  customSoundPath: null as string | null,
  keyingMode: 'auto' as 'auto' | 'native' | 'none',
  windowX: null as number | null,
  windowY: null as number | null,
  debugKeyer: false,
  userName: null as string | null,
  mediaLibrary: [] as string[],
  hydrationEnabled: true,
  hydrationInterval: 60, // in minutes
  hydrationGoal: 8, // in glasses
  hydrationDrankToday: 0,
  hydrationLastResetDate: null as string | null,
  smartMonitoringEnabled: true,
  statsFocusMinutesToday: 0,
  statsBreaksCompletedToday: 0,
  statsBreaksSkippedToday: 0,
  statsBreaksSnoozedToday: 0,
};

export const ACTIVITY_WEIGHTS = {
  KEYBOARD: 3,
  MOUSE_MOVE: 1,
  CLICK: 2,
  WINDOW_FOCUS: 2,
};

export const ACTIVITY_THRESHOLD = 15; // threshold score per minute to be considered active
export const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes in milliseconds
