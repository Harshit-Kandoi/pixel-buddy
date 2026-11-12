import { Tray, Menu, app, nativeImage } from 'electron';
import * as path from 'path';
import { StateMachineData } from './stateMachine';
import { APP_STATES } from '../utils/constants';

export class TrayManager {
  private tray: Tray | null = null;
  private lastMenuKey = '';
  private onOpenSettings: () => void;
  private onTogglePause: () => void;
  private onReset: () => void;
  private startup?: { isOn: () => boolean; toggle: () => void };

  constructor(
    onOpenSettings: () => void,
    onTogglePause: () => void,
    onReset: () => void,
    /** "Open at Login" checkbox: read the setting and flip it. */
    startup?: { isOn: () => boolean; toggle: () => void }
  ) {
    this.onOpenSettings = onOpenSettings;
    this.onTogglePause = onTogglePause;
    this.onReset = onReset;
    this.startup = startup;
  }

  public init(): void {
    // Keep the colored buddy artwork; a template mask would flatten its background.
    const iconPath = path.join(__dirname, '../../resources/icon.png');
    let image = nativeImage.createFromPath(iconPath);
    
    if (process.platform === 'darwin') {
      image = image.resize({ width: 16, height: 16 });
    } else {
      image = image.resize({ width: 24, height: 24 });
    }

    this.tray = new Tray(image);
    this.tray.setToolTip('Pixel Buddy');
    this.updateMenu({
      state: APP_STATES.WORKING,
      activeWorkSeconds: 0,
      breakSecondsLeft: 0,
      snoozeSecondsLeft: 0,
      skipSecondsLeft: 0,
      skipsCount: 0,
      isPaused: false,
      hydrationSecondsLeft: 0,
      hydrationReminderActive: false,
      inMeeting: false,
    });
  }

  public updateMenu(data: StateMachineData): void {
    if (!this.tray) return;

    let statusText = 'Working';
    let timeText = '';

    if (data.isPaused) {
      statusText = 'Paused';
    } else {
      switch (data.state) {
        case APP_STATES.WORKING: {
          if (data.skipSecondsLeft > 0) {
            statusText = 'Snoozed (Skip Cooldown)';
            const mins = Math.ceil(data.skipSecondsLeft / 60);
            timeText = `${mins}m left`;
          } else if (data.inMeeting) {
            statusText = 'On a call (reminders wait)';
            const mins = Math.floor(data.activeWorkSeconds / 60);
            timeText = `${mins}m active`;
          } else {
            statusText = 'Working';
            const mins = Math.floor(data.activeWorkSeconds / 60);
            timeText = `${mins}m active`;
          }
          break;
        }
        case APP_STATES.POPUP:
          statusText = 'Waiting for break decision';
          break;
        case APP_STATES.BREAK: {
          statusText = 'On a Break';
          const mins = Math.floor(data.breakSecondsLeft / 60);
          const secs = data.breakSecondsLeft % 60;
          timeText = `${mins}:${secs.toString().padStart(2, '0')} left`;
          break;
        }
        case APP_STATES.SNOOZE: {
          statusText = 'Snoozed';
          const mins = Math.ceil(data.snoozeSecondsLeft / 60);
          timeText = `${mins}m left`;
          break;
        }
        case APP_STATES.IDLE:
          statusText = 'Idle (Away)';
          break;
      }
    }

    const startsAtLogin = this.startup?.isOn() ?? false;
    const menuKey = `${statusText}:${timeText}:${data.isPaused}:${startsAtLogin}`;
    if (menuKey === this.lastMenuKey) return;
    this.lastMenuKey = menuKey;
    const contextMenu = Menu.buildFromTemplate([
      { label: `Pixel Buddy - ${statusText} ${timeText ? `(${timeText})` : ''}`, enabled: false },
      { type: 'separator' },
      { label: 'Settings...', click: () => this.onOpenSettings() },
      { label: data.isPaused ? 'Resume Reminders' : 'Pause Reminders', click: () => this.onTogglePause() },
      { label: 'Reset Timer', click: () => this.onReset() },
      { type: 'separator' },
      ...(this.startup
        ? [{ label: 'Open at Login', type: 'checkbox' as const, checked: startsAtLogin, click: () => this.startup?.toggle() }, { type: 'separator' as const }]
        : []),
      { label: 'Quit Pixel Buddy', click: () => app.quit() },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  public destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
