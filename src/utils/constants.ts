import type { AvatarSkinSetting, FestivalSkin } from './seasons';

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
  avatarSkin: 'auto' as AvatarSkinSetting, // dresses up for festivals on its own
  claimedSkins: [] as FestivalSkin[],
  festivalBreaks: {} as Record<string, number>,
  customSoundPath: null as string | null,
  keyingMode: 'auto' as 'auto' | 'native' | 'none',
  windowX: null as number | null,
  windowY: null as number | null,
  buddyOnLeft: false,
  buddyOnTop: false,
  debugKeyer: false,
  userName: null as string | null,
  mediaLibrary: [] as string[],
  hydrationEnabled: true,
  hydrationInterval: 60, // in minutes
  hydrationGoal: 8, // in glasses
  hydrationDrankToday: 0,
  hydrationLastResetDate: null as string | null,
  smartMonitoringEnabled: true,
  awayMinutes: 5, // no input this long = away (and being away this long counts as a break)
  meetingAware: true, // hold break and water reminders while you're on a call
  statsFocusMinutesToday: 0,
  statsBreaksCompletedToday: 0,
  statsBreaksSkippedToday: 0,
  statsBreaksSnoozedToday: 0,
  lifetimeBreaksCompleted: 0,
  reviewAskAt: 3,
};

export const ACTIVITY_WEIGHTS = {
  KEYBOARD: 3,
  MOUSE_MOVE: 1,
  CLICK: 2,
  WINDOW_FOCUS: 2,
};

export const ACTIVITY_THRESHOLD = 15; // threshold score per minute to be considered active
export const AWAY_MINUTE_CHOICES = [2, 3, 5, 10, 15] as const;
/** Seconds without input before you count as away (the awayMinutes setting, kept in a sane range). */
export const awaySecondsFor = (minutes: number | undefined): number => Math.min(60, Math.max(1, Math.round(minutes ?? 5))) * 60;
