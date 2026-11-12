import { AppState } from './constants';
import type { AvatarSkinSetting, FestivalSkin } from './seasons';

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
  avatarSkin: AvatarSkinSetting;
  /** Festival buddies claimed by taking breaks during their festival; kept forever. */
  claimedSkins: FestivalSkin[];
  /** Breaks completed per festival season (see seasonKey). */
  festivalBreaks: Record<string, number>;
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
  /** Minutes without keyboard or mouse input before you count as away. */
  awayMinutes: number;
  /** Hold reminders while a call or meeting is detected. */
  meetingAware: boolean;
  statsFocusMinutesToday: number;
  statsBreaksCompletedToday: number;
  statsBreaksSkippedToday: number;
  statsBreaksSnoozedToday: number;
  lifetimeBreaksCompleted: number;
  /** Ask for a rating once this many breaks are done; -1 means never ask again. */
  reviewAskAt: number;
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
  /** A call or meeting was detected: reminders wait until it ends. */
  inMeeting: boolean;
}

