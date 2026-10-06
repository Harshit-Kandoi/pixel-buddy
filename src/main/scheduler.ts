import { StateMachine, StateMachineData } from './stateMachine';
import type { ActivityMonitor } from './activity';
import type { SettingsManager } from './settings';
import { APP_STATES } from '../utils/constants';

export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private stateMachine: StateMachine;
  private activityMonitor: ActivityMonitor;
  private settingsManager: SettingsManager;
  private onTickCallback: ((data: StateMachineData) => void) | null = null;
  private breakGraceTicks = 0;

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
      // On long break detected (user was away for 5+ minutes and just returned)
      () => {
        console.log('Smart Reset: User completed an offline break. Resetting work timer.');
        this.handleReset();
      },
      // On went idle (no activity for 5 minutes)
      () => {
        if (this.stateMachine.getState() === APP_STATES.WORKING) {
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
    const { isActiveThisSecond } = this.activityMonitor.tick(
      stateData.state === APP_STATES.WORKING || stateData.state === APP_STATES.IDLE,
      settings.smartMonitoringEnabled
    );
    // Activity callbacks can change the state during this tick.
    stateData = this.stateMachine.getData();
    const state = this.stateMachine.getState();

    // 2. Hydration countdown (ticking when working or snoozed, and enabled)
    if (settings.hydrationEnabled && (state === APP_STATES.WORKING || state === APP_STATES.SNOOZE)) {
      if (stateData.hydrationSecondsLeft > 0) {
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
          this.stateMachine.decrementSkipSeconds(1);
          if (this.stateMachine.getData().skipSecondsLeft === 0) {
            this.stateMachine.transitionTo(APP_STATES.POPUP);
          }
        } else {
          // Normal work accumulation
          // Increment work timer only if user is NOT idle (idle duration < 5 mins)
          const idleSeconds = this.activityMonitor.getContinuousIdleSeconds();
          if (idleSeconds < 300) {
            this.stateMachine.incrementWorkTime(1);
            
            const currentWorkSecs = this.stateMachine.getData().activeWorkSeconds;
            if (currentWorkSecs > 0 && currentWorkSecs % 60 === 0) {
              const currentMinutes = settings.statsFocusMinutesToday ?? 0;
              this.settingsManager.save({ statsFocusMinutesToday: currentMinutes + 1 });
            }
            
            const targetWorkSeconds = settings.workDuration * 60;
            if (this.stateMachine.getData().activeWorkSeconds >= targetWorkSeconds) {
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
        const inGracePeriod = this.breakGraceTicks > 0;
        if (inGracePeriod) this.breakGraceTicks--;
        // Smart Reset: If user returns to PC early (types or clicks mouse)
        if (!inGracePeriod && settings.smartMonitoringEnabled && isActiveThisSecond) {
          console.log('Smart Reset: Keyboard/Mouse activity detected during break. Restarting work timer.');
          this.stateMachine.setWorkSeconds(0);
          this.stateMachine.resetSkips();
          this.stateMachine.transitionTo(APP_STATES.WORKING);
          break;
        }

        // Normal break countdown
        this.stateMachine.decrementBreakSeconds(1);
        if (this.stateMachine.getData().breakSecondsLeft === 0) {
          console.log('Break completed successfully.');
          const completedCount = settings.statsBreaksCompletedToday ?? 0;
          this.settingsManager.save({ statsBreaksCompletedToday: completedCount + 1 });

          this.stateMachine.setWorkSeconds(0);
          this.stateMachine.resetSkips();
          this.stateMachine.transitionTo(APP_STATES.WORKING);
        }
        break;
      }

      case APP_STATES.SNOOZE: {
        // Count down the snooze period
        this.stateMachine.decrementSnoozeSeconds(1);
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

  // User Action: Take Break
  public handleTakeBreak(): void {
    const settings = this.settingsManager.getSettings();
    // Do not interpret the click that starts a break as returning to work.
    this.breakGraceTicks = 2;
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
