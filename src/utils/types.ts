import { AppState } from './constants';

export interface AppSettings {
  workDuration: number;
  breakDuration: number;
  snoozeDuration: number;
  skipDuration: number;
  maxSkips: number;
  startOnBoot: boolean;
  sound: boolean;
  alwaysVisible: boolean;
  themeHue: number;
  customVideoPath: string | null;
  customSoundPath: string | null;
  keyingMode: 'auto' | 'native' | 'none';
  windowX: number | null;
  windowY: number | null;
  buddyOnLeft: boolean;
  buddyOnTop: boolean;
  debugKeyer: boolean;
  userName: string | null;
  mediaLibrary: string[];
  hydrationEnabled: boolean;
  hydrationInterval: number;
  hydrationGoal: number;
  hydrationDrankToday: number;
  hydrationLastResetDate: string | null;
  smartMonitoringEnabled: boolean;
  statsFocusMinutesToday: number;
  statsBreaksCompletedToday: number;
  statsBreaksSkippedToday: number;
  statsBreaksSnoozedToday: number;
}

// Where the buddy sits in its window (window coordinates) at the end of a drag, now and
// with the layout mirrored on each axis, so the host can flip the layout toward the nearer
// screen edges without the buddy moving on screen.
export interface BuddyAnchor {
  left: number;
  top: number;
  width: number;
  height: number;
  mirroredLeft: number;
  mirroredTop: number;
}

export interface StateMachineData {
  state: AppState;
  activeWorkSeconds: number;
  breakSecondsLeft: number;
  snoozeSecondsLeft: number;
  skipSecondsLeft: number;
  skipsCount: number;
  isPaused: boolean;
  hydrationSecondsLeft: number;
  hydrationReminderActive: boolean;
}

