import { Tray, Menu, app, nativeImage } from 'electron';
import * as path from 'path';
import { StateMachineData } from './stateMachine';
import { APP_STATES } from '../utils/constants';

export class TrayManager {
  private tray: Tray | null = null;
  private onOpenSettings: () => void;
  private onTogglePause: () => void;
  private onReset: () => void;

  constructor(
    onOpenSettings: () => void,
    onTogglePause: () => void,
    onReset: () => void
  ) {
    this.onOpenSettings = onOpenSettings;
    this.onTogglePause = onTogglePause;
    this.onReset = onReset;
  }

  public init(): void {
    // Load the icon. Support template image on Mac for dark menu bar compatibility.
    const iconPath = path.join(__dirname, '../../resources/icon.png');
    let image = nativeImage.createFromPath(iconPath);
    
    if (process.platform === 'darwin') {
      image = image.resize({ width: 16, height: 16 });
      image.setTemplateImage(true);
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

    const contextMenu = Menu.buildFromTemplate([
      { label: `Pixel Buddy - ${statusText} ${timeText ? `(${timeText})` : ''}`, enabled: false },
      { type: 'separator' },
      { label: 'Settings...', click: () => this.onOpenSettings() },
      { label: data.isPaused ? 'Resume Reminders' : 'Pause Reminders', click: () => this.onTogglePause() },
      { label: 'Reset Timer', click: () => this.onReset() },
      { type: 'separator' },
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
