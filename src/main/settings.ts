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

  /**
   * Make the system's "open at login" match the Start on Boot setting. Runs at every launch, not
   * only when the switch changes: a setting carried over from an older version, a reinstall, or
   * an update to a new folder (Windows) would otherwise leave the two out of step.
   */
  public syncLoginItem(): void {
    // A development run would register the bare Electron binary as a login item.
    if (!app.isPackaged) return;
    try {
      const wanted = this.settings.startOnBoot;
      const current = app.getLoginItemSettings();
      // macOS: "requires approval" means it's registered and waiting for the user to allow it.
      const registered = current.openAtLogin || current.status === 'requires-approval';
      if (registered !== wanted) app.setLoginItemSettings({ openAtLogin: wanted, path: app.getPath('exe') });
    } catch (error) {
      console.error('Failed to update open at login:', error);
    }
  }

  /** What the system will actually do at login, for the Settings screen. */
  public loginItemStatus(): { enabled: boolean; needsApproval: boolean; managed: boolean } {
    if (!app.isPackaged) return { enabled: false, needsApproval: false, managed: false };
    const current = app.getLoginItemSettings();
    return { enabled: current.openAtLogin, needsApproval: current.status === 'requires-approval', managed: true };
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
      
      if (typeof newSettings.startOnBoot !== 'undefined') this.syncLoginItem();

      fs.writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2), 'utf-8');
      this.onChange?.({ ...this.settings });
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }
}
