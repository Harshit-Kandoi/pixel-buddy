import { powerMonitor, systemPreferences, ipcMain } from 'electron';
import { ACTIVITY_WEIGHTS } from '../utils/constants';

let uIOhook: any = null;
let uiohookLoaded = false;

// Try loading uiohook-napi dynamically
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const module = require('uiohook-napi');
  uIOhook = module.uIOhook;
  uiohookLoaded = true;
  console.log('uiohook-napi loaded successfully');
} catch (error) {
  console.warn('uiohook-napi failed to load. Falling back to powerMonitor. Error:', error);
}

export class ActivityMonitor {
  private currentScore = 0;
  private minuteScore = 0;
  private lastMouseMoveTime = 0;
  private isListening = false;
  private secondsInCurrentMinute = 0;
  
  // High-level activity state
  private continuousIdleSeconds = 0;
  private isTracking = false;
  
  // Callback when user returns from a long break (idle time >= 5 minutes)
  private onBreakDetectedCallback: (() => void) | null = null;
  // Callback when user goes idle (no activity for 5 minutes)
  private onIdleDetectedCallback: (() => void) | null = null;
  // Callback when user resumes activity after being idle
  private onActiveResumedCallback: (() => void) | null = null;

  constructor() {
    this.setupIPC();
  }

  private setupIPC(): void {
    ipcMain.handle('activity:get-permission-status', () => {
      return this.checkAccessibilityPermission();
    });

    ipcMain.handle('activity:request-permission', () => {
      return this.requestAccessibilityPermission();
    });
  }

  public checkAccessibilityPermission(): boolean {
    if (process.platform !== 'darwin') return true;
    try {
      return systemPreferences.isTrustedAccessibilityClient(false);
    } catch {
      return false;
    }
  }

  public requestAccessibilityPermission(): boolean {
    if (process.platform !== 'darwin') return true;
    try {
      // Passing true prompts the system accessibility dialog
      return systemPreferences.isTrustedAccessibilityClient(true);
    } catch {
      return false;
    }
  }

  public start(
    onBreakDetected: () => void, 
    onIdleDetected: () => void,
    onActiveResumed: () => void
  ): void {
    if (this.isTracking) return;
    this.isTracking = true;

    this.onBreakDetectedCallback = onBreakDetected;
    this.onIdleDetectedCallback = onIdleDetected;
    this.onActiveResumedCallback = onActiveResumed;

    this.startGlobalHook();
  }

  private startGlobalHook(): void {
    if (this.isListening) return;

    const hasPermission = this.checkAccessibilityPermission();
    if (uiohookLoaded && uIOhook && hasPermission) {
      try {
        uIOhook.on('keydown', () => {
          this.currentScore += ACTIVITY_WEIGHTS.KEYBOARD;
        });

        uIOhook.on('mousedown', () => {
          this.currentScore += ACTIVITY_WEIGHTS.CLICK;
        });

        uIOhook.on('mousemove', () => {
          const now = Date.now();
          // Throttle mouse move score to once per second
          if (now - this.lastMouseMoveTime >= 1000) {
            this.currentScore += ACTIVITY_WEIGHTS.MOUSE_MOVE;
            this.lastMouseMoveTime = now;
          }
        });

        uIOhook.start();
        this.isListening = true;
        console.log('Global hooks started successfully.');
      } catch (err) {
        console.error('Failed to start uIOhook:', err);
        this.isListening = false;
      }
    } else {
      console.log('Skipping global hooks (either not loaded or lacks permission). Using powerMonitor fallback.');
    }
  }

  public stop(): void {
    this.isTracking = false;
    this.stopGlobalHook();
  }

  private stopGlobalHook(): void {
    if (this.isListening && uIOhook) {
      try {
        uIOhook.stop();
        uIOhook.removeAllListeners();
      } catch (err) {
        console.error('Error stopping uIOhook:', err);
      }
      this.isListening = false;
    }
  }

  /**
   * Called every second by the main scheduler.
   * Updates scores and handles idle transitions.
   * Returns true if user was active this second, false if idle.
   */
  public tick(
    isStateWorking: boolean,
    smartMonitoringEnabled = true
  ): { isActiveThisSecond: boolean; currentMinuteScore: number } {
    let activeThisSecond = false;
    const hasPermission = this.checkAccessibilityPermission() && smartMonitoringEnabled;

    if (!smartMonitoringEnabled) {
      if (this.isListening) {
        this.stopGlobalHook();
      }
      activeThisSecond = true;
      this.continuousIdleSeconds = 0;
    } else if (this.isListening && hasPermission) {
      if (this.currentScore > 0) {
        activeThisSecond = true;
        this.minuteScore += this.currentScore;
        this.currentScore = 0; // reset for next second
      }
    } else {
      // Fallback: Check powerMonitor
      const idleTimeSeconds = powerMonitor.getSystemIdleTime();
      if (idleTimeSeconds === 0) {
        activeThisSecond = true;
        this.minuteScore += ACTIVITY_WEIGHTS.KEYBOARD; // add placeholder active score
      }

      // If they just got permission, dynamically start the hook
      if (hasPermission && !this.isListening && uiohookLoaded) {
        this.startGlobalHook();
      }
    }

    if (activeThisSecond) {
      // If they were idle (5 mins or more) and just returned
      if (this.continuousIdleSeconds >= 300) {
        console.log(`User returned after a long idle period of ${this.continuousIdleSeconds}s.`);
        
        if (isStateWorking) {
          // If they were in working mode, this idle period was a break!
          // We trigger the break detected callback (which resets the work timer)
          if (this.onBreakDetectedCallback) {
            this.onBreakDetectedCallback();
          }
        }
        
        if (this.onActiveResumedCallback) {
          this.onActiveResumedCallback();
        }
      }
      this.continuousIdleSeconds = 0;
    } else {
      this.continuousIdleSeconds++;
      
      // If we just hit exactly 5 minutes (300 seconds) of no activity, trigger idle callback
      if (this.continuousIdleSeconds === 300) {
        console.log('User went idle (5 minutes of no activity).');
        if (this.onIdleDetectedCallback) {
          this.onIdleDetectedCallback();
        }
      }
    }

    // Accumulate time in the current minute
    this.secondsInCurrentMinute++;
    let returnedMinuteScore = this.minuteScore;

    if (this.secondsInCurrentMinute >= 60) {
      // Reset minute stats
      this.minuteScore = 0;
      this.secondsInCurrentMinute = 0;
    }

    return {
      isActiveThisSecond: activeThisSecond,
      currentMinuteScore: returnedMinuteScore,
    };
  }

  public getContinuousIdleSeconds(): number {
    return this.continuousIdleSeconds;
  }

  public resetMinuteScore(): void {
    this.minuteScore = 0;
    this.secondsInCurrentMinute = 0;
    this.currentScore = 0;
  }
}
