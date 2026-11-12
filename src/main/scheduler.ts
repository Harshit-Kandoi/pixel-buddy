import { StateMachine, StateMachineData } from './stateMachine';
import { recordFestivalBreak } from '../utils/seasons';
import type { ActivityMonitor } from './activity';
import type { SettingsManager } from './settings';
import { APP_STATES, awaySecondsFor } from '../utils/constants';

// During a break, smart monitoring ends the break when you come back to work. Coming back
// means steady input, not a single mouse nudge: this many active seconds within the window.
export const RETURN_ACTIVE_SECONDS = 4;
export const RETURN_WINDOW_SECONDS = 8;
// Using Pixel Buddy itself (clicking it, settings) is not coming back to work: input is
// ignored for this long after each interaction with the buddy.
export const BUDDY_INTERACTION_HOLD_SECONDS = 15;

export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private stateMachine: StateMachine;
  private activityMonitor: ActivityMonitor;
  private settingsManager: SettingsManager;
  private onTickCallback: ((data: StateMachineData) => void) | null = null;
  private breakGraceTicks = 0;
  private buddyHoldTicks = 0;
  private breakActivity: boolean[] = []; // recent seconds of the break: active or not
  private inMeeting = false; // on a call: reminders wait, and sitting still isn't being away

  constructor(
    settingsManager: SettingsManager,
    activityMonitor: ActivityMonitor,
    onStateChange: (data: StateMachineData) => void
  ) {
    this.settingsManager = settingsManager;
    this.activityMonitor = activityMonitor;
    
    this.stateMachine = new StateMachine((data) => {
      // Forward state changes to the callback (which updates the UI)
      onStateChange(data);
    });
  }

  public start(onTick: (data: StateMachineData) => void): void {
    if (this.timer) return;

    // Initialize hydration timer
    const settings = this.settingsManager.getSettings();
    this.stateMachine.setHydrationSeconds(settings.hydrationInterval * 60);
    this.stateMachine.setHydrationReminderActive(false);
    this.onTickCallback = onTick;

    // Start activity tracking
    this.activityMonitor.start(
      // On long break detected (user was away for the away time and just returned)
      () => {
        if (this.inMeeting) return; // listening on a call isn't a break
        console.log('Smart Reset: User completed an offline break. Resetting work timer.');
        this.handleReset();
      },
      // On went idle (no input for the away time)
      () => {
        if (this.stateMachine.getState() === APP_STATES.WORKING && !this.inMeeting) {
          this.stateMachine.transitionTo(APP_STATES.IDLE);
        }
      },
      // On active resumed (user returned to PC)
      () => {
        if (this.stateMachine.getState() === APP_STATES.IDLE) {
          this.stateMachine.transitionTo(APP_STATES.WORKING);
        }
      }
    );

    // Run the scheduler loop every second
    this.timer = setInterval(() => {
      this.tick();
      this.onTickCallback?.(this.stateMachine.getData());
    }, 1000);
    
    // Initial emission
    this.onTickCallback(this.stateMachine.getData());
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.activityMonitor.stop();
  }

  private tick(): void {
    let stateData = this.stateMachine.getData();
    const settings = this.settingsManager.getSettings();
    if (stateData.isPaused) return;

    // 1. Tick the activity monitor
    const awaySeconds = awaySecondsFor(settings.awayMinutes);
    const { isActiveThisSecond } = this.activityMonitor.tick(
      stateData.state === APP_STATES.WORKING || stateData.state === APP_STATES.IDLE,
      settings.smartMonitoringEnabled,
      awaySeconds
    );
    // Activity callbacks can change the state during this tick.
    stateData = this.stateMachine.getData();
    const state = this.stateMachine.getState();

    // On a call, each countdown stops one second short and waits for the call to end.
    const holding = (secondsLeft: number): boolean => this.inMeeting && secondsLeft <= 1;

    // 2. Hydration countdown (ticking when working or snoozed, and enabled)
    if (settings.hydrationEnabled && (state === APP_STATES.WORKING || state === APP_STATES.SNOOZE)) {
      if (stateData.hydrationSecondsLeft > 0 && !holding(stateData.hydrationSecondsLeft)) {
        this.stateMachine.decrementHydrationSeconds(1);
        if (this.stateMachine.getData().hydrationSecondsLeft === 0) {
          console.log('Hydration reminder triggered.');
          this.stateMachine.setHydrationReminderActive(true);
        }
      }
    }

    // 3. State-specific logic
    switch (state) {
      case APP_STATES.WORKING: {
        // Handle skip countdown if active
        if (stateData.skipSecondsLeft > 0) {
          if (!holding(stateData.skipSecondsLeft)) this.stateMachine.decrementSkipSeconds(1);
          if (this.stateMachine.getData().skipSecondsLeft === 0) {
            this.stateMachine.transitionTo(APP_STATES.POPUP);
          }
        } else {
          // Normal work accumulation
          // Count focus time unless you're away (time on a call counts)
          const idleSeconds = this.activityMonitor.getContinuousIdleSeconds();
          if (idleSeconds < awaySeconds || this.inMeeting) {
            this.stateMachine.incrementWorkTime(1);
            
            const currentWorkSecs = this.stateMachine.getData().activeWorkSeconds;
            if (currentWorkSecs > 0 && currentWorkSecs % 60 === 0) {
              const currentMinutes = settings.statsFocusMinutesToday ?? 0;
              this.settingsManager.save({ statsFocusMinutesToday: currentMinutes + 1 });
            }
            
            const targetWorkSeconds = settings.workDuration * 60;
            if (this.stateMachine.getData().activeWorkSeconds >= targetWorkSeconds && !this.inMeeting) {
              this.stateMachine.transitionTo(APP_STATES.POPUP);
            }
          }
        }
        break;
      }

      case APP_STATES.POPUP:
        // In popup state, we wait for user interaction (button click)
        break;

      case APP_STATES.BREAK: {
        const held = this.breakGraceTicks > 0 || this.buddyHoldTicks > 0;
        if (this.breakGraceTicks > 0) this.breakGraceTicks--;
        if (this.buddyHoldTicks > 0) this.buddyHoldTicks--;
        // Smart Reset: if the user is back at work (steady keyboard/mouse input), end the break early.
        if (settings.smartMonitoringEnabled && !held) {
          this.breakActivity.push(isActiveThisSecond);
          if (this.breakActivity.length > RETURN_WINDOW_SECONDS) this.breakActivity.shift();
          if (this.breakActivity.filter(Boolean).length >= RETURN_ACTIVE_SECONDS) {
            console.log('Smart Reset: steady keyboard/mouse activity during break. Restarting work timer.');
            this.breakActivity = [];
            this.stateMachine.setWorkSeconds(0);
            this.stateMachine.resetSkips();
            this.stateMachine.transitionTo(APP_STATES.WORKING);
            break;
          }
        }

        // Normal break countdown
        this.stateMachine.decrementBreakSeconds(1);
        if (this.stateMachine.getData().breakSecondsLeft === 0) {
          console.log('Break completed successfully.');
          const completedCount = settings.statsBreaksCompletedToday ?? 0;
          this.settingsManager.save({
            statsBreaksCompletedToday: completedCount + 1,
            lifetimeBreaksCompleted: (settings.lifetimeBreaksCompleted ?? 0) + 1,
            festivalBreaks: recordFestivalBreak(settings.festivalBreaks),
          });

          this.stateMachine.setWorkSeconds(0);
          this.stateMachine.resetSkips();
          this.stateMachine.transitionTo(APP_STATES.WORKING);
        }
        break;
      }

      case APP_STATES.SNOOZE: {
        // Count down the snooze period
        if (!holding(stateData.snoozeSecondsLeft)) this.stateMachine.decrementSnoozeSeconds(1);
        if (this.stateMachine.getData().snoozeSecondsLeft === 0) {
          this.stateMachine.transitionTo(APP_STATES.POPUP);
        }
        break;
      }

      case APP_STATES.IDLE:
        // Handled by activityMonitor callbacks
        break;
    }
  }

  /**
   * A call or meeting started or ended. During one, break and water reminders wait (they appear
   * once it ends) and sitting still doesn't count as being away. Time on the call is focus time.
   */
  public setInMeeting(active: boolean): void {
    if (active === this.inMeeting) return;
    this.inMeeting = active;
    // Away time counts from the start or end of the call, not from your last keystroke.
    this.activityMonitor.markActive();
    if (active && this.stateMachine.getState() === APP_STATES.IDLE) this.stateMachine.transitionTo(APP_STATES.WORKING);
    this.stateMachine.setInMeeting(active);
  }

  /** The user is using Pixel Buddy itself (clicking it, settings); that isn't coming back to work. */
  public handleBuddyInteraction(): void {
    if (this.stateMachine.getState() !== APP_STATES.BREAK) return;
    this.buddyHoldTicks = BUDDY_INTERACTION_HOLD_SECONDS;
    this.breakActivity = [];
  }

  public handleTakeBreak(): void {
    const settings = this.settingsManager.getSettings();
    // Do not interpret the click that starts a break as returning to work.
    this.breakGraceTicks = 2;
    this.buddyHoldTicks = 0;
    this.breakActivity = [];
    this.activityMonitor.resetMinuteScore();
    this.stateMachine.setSkipSeconds(0);
    this.stateMachine.setSnoozeSeconds(0);
    this.stateMachine.togglePause(false);
    this.stateMachine.setBreakSeconds(settings.breakDuration * 60);
    this.stateMachine.transitionTo(APP_STATES.BREAK);
  }

  // User Action: Snooze
  public handleSnooze(): void {
    const settings = this.settingsManager.getSettings();
    const snoozedCount = settings.statsBreaksSnoozedToday ?? 0;
    this.settingsManager.save({ statsBreaksSnoozedToday: snoozedCount + 1 });

    this.stateMachine.setSnoozeSeconds(settings.snoozeDuration * 60);
    this.stateMachine.transitionTo(APP_STATES.SNOOZE);
  }

  // User Action: Skip
  public handleSkip(): void {
    const settings = this.settingsManager.getSettings();
    this.stateMachine.incrementSkips();
    const skippedCount = settings.statsBreaksSkippedToday ?? 0;
    this.settingsManager.save({ statsBreaksSkippedToday: skippedCount + 1 });
    
    // Set skip cooldown timer (10 mins)
    this.stateMachine.setSkipSeconds(settings.skipDuration * 60);
    this.stateMachine.transitionTo(APP_STATES.WORKING);
  }

  // User Action: Reset/Force Start Work
  public handleReset(): void {
    this.stateMachine.setWorkSeconds(0);
    this.stateMachine.setSkipSeconds(0);
    this.stateMachine.setSnoozeSeconds(0);
    this.stateMachine.setBreakSeconds(0);
    this.stateMachine.resetSkips();
    this.stateMachine.togglePause(false);
    this.stateMachine.transitionTo(APP_STATES.WORKING);
  }

  public handleSettingsChanged(previous: ReturnType<SettingsManager['getSettings']>): void {
    const settings = this.settingsManager.getSettings();
    if (settings.hydrationEnabled !== previous.hydrationEnabled || settings.hydrationInterval !== previous.hydrationInterval) {
      this.handleDismissHydration();
    }
    if (!settings.meetingAware) this.setInMeeting(false);
    if (!settings.smartMonitoringEnabled && this.stateMachine.getState() === APP_STATES.IDLE) {
      this.stateMachine.transitionTo(APP_STATES.WORKING);
    }
  }

  // User Action: Log Hydration
  public handleLogHydration(): void {
    const settings = this.settingsManager.getSettings();
    const newCount = (settings.hydrationDrankToday ?? 0) + 1;
    this.settingsManager.save({ hydrationDrankToday: newCount });
    this.stateMachine.setHydrationSeconds(settings.hydrationInterval * 60);
    this.stateMachine.setHydrationReminderActive(false);
  }

  // User Action: Snooze Hydration
  public handleSnoozeHydration(): void {
    this.stateMachine.setHydrationSeconds(10 * 60); // snooze for 10 minutes
    this.stateMachine.setHydrationReminderActive(false);
  }

  // User Action: Dismiss Hydration
  public handleDismissHydration(): void {
    const settings = this.settingsManager.getSettings();
    this.stateMachine.setHydrationSeconds(settings.hydrationInterval * 60);
    this.stateMachine.setHydrationReminderActive(false);
  }

  public getStateMachine(): StateMachine {
    return this.stateMachine;
  }
}
