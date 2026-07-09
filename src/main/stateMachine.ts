import { AppState, APP_STATES } from '../utils/constants';

import { StateMachineData } from '../utils/types';

export type { StateMachineData };

export class StateMachine {
  private state: AppState = APP_STATES.WORKING;
  private activeWorkSeconds = 0;
  private breakSecondsLeft = 0;
  private snoozeSecondsLeft = 0;
  private skipSecondsLeft = 0;
  private skipsCount = 0;
  private isPaused = false;
  private hydrationSecondsLeft = 0;
  private hydrationReminderActive = false;

  private onStateChangeCallback: ((data: StateMachineData) => void) | null = null;

  constructor(onStateChange: (data: StateMachineData) => void) {
    this.onStateChangeCallback = onStateChange;
  }

  public getData(): StateMachineData {
    return {
      state: this.state,
      activeWorkSeconds: this.activeWorkSeconds,
      breakSecondsLeft: this.breakSecondsLeft,
      snoozeSecondsLeft: this.snoozeSecondsLeft,
      skipSecondsLeft: this.skipSecondsLeft,
      skipsCount: this.skipsCount,
      isPaused: this.isPaused,
      hydrationSecondsLeft: this.hydrationSecondsLeft,
      hydrationReminderActive: this.hydrationReminderActive,
    };
  }

  public setHydrationSeconds(seconds: number): void {
    this.hydrationSecondsLeft = seconds;
    this.emitChange();
  }

  public decrementHydrationSeconds(seconds = 1): void {
    this.hydrationSecondsLeft = Math.max(0, this.hydrationSecondsLeft - seconds);
    this.emitChange();
  }

  public setHydrationReminderActive(active: boolean): void {
    this.hydrationReminderActive = active;
    this.emitChange();
  }

  private emitChange(): void {
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback(this.getData());
    }
  }

  public transitionTo(newState: AppState): void {
    if (this.state === newState) return;

    console.log(`State transition: ${this.state} -> ${newState}`);
    this.state = newState;

    // Reset countdowns based on new state
    if (newState === APP_STATES.WORKING) {
      // Keep activeWorkSeconds if we just came back from IDLE or SNOOZE, unless reset elsewhere
    }

    this.emitChange();
  }

  public incrementWorkTime(seconds = 1): void {
    if (this.state !== APP_STATES.WORKING) return;
    this.activeWorkSeconds += seconds;
    this.emitChange();
  }

  public setWorkSeconds(seconds: number): void {
    this.activeWorkSeconds = seconds;
    this.emitChange();
  }

  public setBreakSeconds(seconds: number): void {
    this.breakSecondsLeft = seconds;
    this.emitChange();
  }

  public decrementBreakSeconds(seconds = 1): void {
    if (this.state !== APP_STATES.BREAK) return;
    this.breakSecondsLeft = Math.max(0, this.breakSecondsLeft - seconds);
    this.emitChange();
  }

  public setSnoozeSeconds(seconds: number): void {
    this.snoozeSecondsLeft = seconds;
    this.emitChange();
  }

  public decrementSnoozeSeconds(seconds = 1): void {
    if (this.state !== APP_STATES.SNOOZE) return;
    this.snoozeSecondsLeft = Math.max(0, this.snoozeSecondsLeft - seconds);
    this.emitChange();
  }

  public setSkipSeconds(seconds: number): void {
    this.skipSecondsLeft = seconds;
    this.emitChange();
  }

  public decrementSkipSeconds(seconds = 1): void {
    if (this.state !== APP_STATES.WORKING || this.skipSecondsLeft <= 0) return;
    this.skipSecondsLeft = Math.max(0, this.skipSecondsLeft - seconds);
    this.emitChange();
  }

  public incrementSkips(): void {
    this.skipsCount++;
    this.emitChange();
  }

  public resetSkips(): void {
    this.skipsCount = 0;
    this.emitChange();
  }

  public getSkipsCount(): number {
    return this.skipsCount;
  }

  public togglePause(paused?: boolean): void {
    this.isPaused = paused !== undefined ? paused : !this.isPaused;
    console.log(`App paused status: ${this.isPaused}`);
    this.emitChange();
  }

  public getState(): AppState {
    return this.state;
  }
}
