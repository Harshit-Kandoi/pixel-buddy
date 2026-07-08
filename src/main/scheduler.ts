import { StateMachine, StateMachineData } from './stateMachine';
import { ActivityMonitor } from './activity';
import { SettingsManager } from './settings';
import { APP_STATES } from '../utils/constants';

export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private stateMachine: StateMachine;
  private activityMonitor: ActivityMonitor;
  private settingsManager: SettingsManager;
  private onTickCallback: ((data: StateMachineData) => void) | null = null;

  constructor(
    settingsManager: SettingsManager,
    activityMonitor: ActivityMonitor,
    onStateChange: (data: StateMachineData) => void
  ) {
    this.settingsManager = settingsManager;
    this.activityMonitor = activityMonitor;
    
    this.stateMachine = new StateMachine((data) => {
      // Forward state changes to the callback (which updates the UI)
      if (this.onTickCallback) {
        this.onTickCallback(data);
      }
      onStateChange(data);
    });
  }

  public start(onTick: (data: StateMachineData) => void): void {
    this.onTickCallback = onTick;

    // Start activity tracking
    this.activityMonitor.start(
      // On long break detected (user was away for 5+ minutes and just returned)
      () => {
        console.log('Smart Reset: User completed an offline break. Resetting work timer.');
        this.stateMachine.setWorkSeconds(0);
        this.stateMachine.resetSkips();
        this.stateMachine.transitionTo(APP_STATES.WORKING);
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
    this.timer = setInterval(() => this.tick(), 1000);
    
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
    const stateData = this.stateMachine.getData();
    if (stateData.isPaused) return;

    const state = stateData.state;
    const settings = this.settingsManager.getSettings();

    // 1. Tick the activity monitor
    const { isActiveThisSecond } = this.activityMonitor.tick(state === APP_STATES.WORKING);

    // 2. State-specific logic
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
        // Smart Reset: If user returns to PC early (types or clicks mouse)
        if (isActiveThisSecond) {
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
    this.stateMachine.setBreakSeconds(settings.breakDuration * 60);
    this.stateMachine.transitionTo(APP_STATES.BREAK);
  }

  // User Action: Snooze
  public handleSnooze(): void {
    const settings = this.settingsManager.getSettings();
    this.stateMachine.setSnoozeSeconds(settings.snoozeDuration * 60);
    this.stateMachine.transitionTo(APP_STATES.SNOOZE);
  }

  // User Action: Skip
  public handleSkip(): void {
    const settings = this.settingsManager.getSettings();
    this.stateMachine.incrementSkips();
    
    // Set skip cooldown timer (10 mins)
    this.stateMachine.setSkipSeconds(settings.skipDuration * 60);
    this.stateMachine.transitionTo(APP_STATES.WORKING);
  }

  // User Action: Reset/Force Start Work
  public handleReset(): void {
    this.stateMachine.setWorkSeconds(0);
    this.stateMachine.resetSkips();
    this.stateMachine.transitionTo(APP_STATES.WORKING);
  }

  public getStateMachine(): StateMachine {
    return this.stateMachine;
  }
}
