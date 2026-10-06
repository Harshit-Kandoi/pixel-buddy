import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_SETTINGS } from '../utils/constants';

const SETTINGS_FILE_NAME = 'settings.json';

import { AppSettings } from '../utils/types';

export type { AppSettings };

export class SettingsManager {
  private filePath: string;
  private settings: AppSettings;
  private onChange?: (settings: AppSettings) => void;

  constructor(onChange?: (settings: AppSettings) => void) {
    this.onChange = onChange;
    // If running in main process before app is ready, getPath might need app to be initialized
    const userDataPath = app.getPath('userData');
    this.filePath = path.join(userDataPath, SETTINGS_FILE_NAME);
    this.settings = { ...DEFAULT_SETTINGS };
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(data);
        this.settings = {
          ...DEFAULT_SETTINGS,
          ...parsed,
        };
      } else {
        this.save(this.settings);
      }
      this.checkDailyReset();
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  private checkDailyReset(): void {
    const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
    if (this.settings.hydrationLastResetDate !== todayStr) {
      console.log(`Daily Reset: Resetting stats and water count. Prev reset: ${this.settings.hydrationLastResetDate}, Today: ${todayStr}`);
      this.save({
        hydrationDrankToday: 0,
        statsFocusMinutesToday: 0,
        statsBreaksCompletedToday: 0,
        statsBreaksSkippedToday: 0,
        statsBreaksSnoozedToday: 0,
        hydrationLastResetDate: todayStr,
      });
    }
  }

  public getSettings(): AppSettings {
    this.checkDailyReset();
    return { ...this.settings, mediaLibrary: [...this.settings.mediaLibrary] };
  }

  public save(newSettings: Partial<AppSettings>): void {
    try {
      this.settings = {
        ...this.settings,
        ...newSettings,
      };
      
      // Auto-launch handling in Electron
      if (typeof newSettings.startOnBoot !== 'undefined') {
        app.setLoginItemSettings({
          openAtLogin: this.settings.startOnBoot,
          path: app.getPath('exe'),
        });
      }

      fs.writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2), 'utf-8');
      this.onChange?.({ ...this.settings });
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }
}
