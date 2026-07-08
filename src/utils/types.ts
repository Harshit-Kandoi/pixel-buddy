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
  debugKeyer: boolean;
}

export interface StateMachineData {
  state: AppState;
  activeWorkSeconds: number;
  breakSecondsLeft: number;
  snoozeSecondsLeft: number;
  skipSecondsLeft: number;
  skipsCount: number;
  isPaused: boolean;
}
