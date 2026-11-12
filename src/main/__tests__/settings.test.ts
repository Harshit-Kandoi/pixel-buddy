import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SettingsManager } from '../settings';
import { DEFAULT_SETTINGS } from '../../utils/constants';

const { TEST_DIR, loginItem } = vi.hoisted(() => {
  // vi.hoisted runs before the imports above exist, so this one has to be a require.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path');
  return {
    TEST_DIR: path.join(__dirname, 'temp_test_userdata'),
    // What the system has registered to open at login.
    loginItem: { openAtLogin: false, status: 'not-registered' as string },
  };
});

// Mock electron app before importing settings module
vi.mock('electron', () => {
  return {
    app: {
      getPath: vi.fn().mockImplementation((name) => {
        if (name === 'exe') return '/mock/exe/path';
        return TEST_DIR;
      }),
      isPackaged: true,
      getLoginItemSettings: vi.fn(() => ({ ...loginItem })),
      setLoginItemSettings: vi.fn(({ openAtLogin }) => {
        loginItem.openAtLogin = openAtLogin;
        loginItem.status = openAtLogin ? 'enabled' : 'not-registered';
      }),
    },
  };
});

describe('SettingsManager', () => {
  beforeEach(() => {
    // Create temp test directory
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up temp test directory
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  test('loads default settings if settings.json does not exist', () => {
    const manager = new SettingsManager();
    expect(manager.getSettings()).toEqual({ ...DEFAULT_SETTINGS, hydrationLastResetDate: new Date().toLocaleDateString('en-CA') });

    // Verify it created the settings.json file automatically
    const filePath = path.join(TEST_DIR, 'settings.json');
    expect(fs.existsSync(filePath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(content).toEqual({ ...DEFAULT_SETTINGS, hydrationLastResetDate: new Date().toLocaleDateString('en-CA') });
  });

  test('loads existing settings from settings.json', () => {
    const filePath = path.join(TEST_DIR, 'settings.json');
    const customSettings = {
      ...DEFAULT_SETTINGS,
      workDuration: 99,
      breakDuration: 11,
    };
    fs.writeFileSync(filePath, JSON.stringify(customSettings), 'utf-8');

    const manager = new SettingsManager();
    expect(manager.getSettings().workDuration).toBe(99);
    expect(manager.getSettings().breakDuration).toBe(11);
    expect(manager.getSettings().startOnBoot).toBe(DEFAULT_SETTINGS.startOnBoot);
  });

  test('saves partial settings correctly', () => {
    const manager = new SettingsManager();
    manager.save({ workDuration: 120, snoozeDuration: 15 });

    expect(manager.getSettings().workDuration).toBe(120);
    expect(manager.getSettings().snoozeDuration).toBe(15);
    expect(manager.getSettings().breakDuration).toBe(DEFAULT_SETTINGS.breakDuration);

    // Verify written file
    const filePath = path.join(TEST_DIR, 'settings.json');
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(content.workDuration).toBe(120);
    expect(content.snoozeDuration).toBe(15);
  });

  test('updates Electron login settings when startOnBoot is modified', async () => {
    const { app } = await import('electron');
    const manager = new SettingsManager();
    loginItem.openAtLogin = true;

    manager.save({ startOnBoot: false });
    expect(app.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: false,
      path: '/mock/exe/path',
    });

    manager.save({ startOnBoot: true });
    expect(app.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
      path: '/mock/exe/path',
    });
  });
  test('at launch, registers open-at-login when the setting is on but the system lost it', async () => {
    const { app } = await import('electron');
    vi.mocked(app.setLoginItemSettings).mockClear();
    Object.assign(loginItem, { openAtLogin: false, status: 'not-registered' });
    const manager = new SettingsManager();
    manager.save({ startOnBoot: true });
    Object.assign(loginItem, { openAtLogin: false, status: 'not-registered' }); // e.g. an older version never registered it
    vi.mocked(app.setLoginItemSettings).mockClear();
    manager.syncLoginItem();
    expect(app.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true, path: '/mock/exe/path' });
    expect(manager.loginItemStatus()).toEqual({ enabled: true, needsApproval: false, managed: true });

    // Already right, or waiting for the user's approval on macOS: leave it alone.
    vi.mocked(app.setLoginItemSettings).mockClear();
    manager.syncLoginItem();
    Object.assign(loginItem, { openAtLogin: false, status: 'requires-approval' });
    manager.syncLoginItem();
    expect(app.setLoginItemSettings).not.toHaveBeenCalled();
    expect(manager.loginItemStatus().needsApproval).toBe(true);
  });

  test('turning it off removes the login item', async () => {
    const { app } = await import('electron');
    Object.assign(loginItem, { openAtLogin: true, status: 'enabled' });
    const manager = new SettingsManager();
    manager.save({ startOnBoot: false });
    expect(app.setLoginItemSettings).toHaveBeenLastCalledWith({ openAtLogin: false, path: '/mock/exe/path' });
    expect(loginItem.openAtLogin).toBe(false);
  });

  test('resets daily counters at midnight while the app stays open', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 9, 5, 23, 59));
      const manager = new SettingsManager();
      manager.save({ hydrationDrankToday: 7, statsFocusMinutesToday: 90 });
      vi.setSystemTime(new Date(2026, 9, 6, 0, 1));
      expect(manager.getSettings()).toMatchObject({ hydrationDrankToday: 0, statsFocusMinutesToday: 0, hydrationLastResetDate: '2026-10-06' });
    } finally { vi.useRealTimers(); }
  });

});
