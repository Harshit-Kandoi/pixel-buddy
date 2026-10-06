import { app, shell, BrowserWindow, ipcMain, screen, protocol, dialog, net } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';

// Retain the original app-data directory when upgrading from the starter-named app.
// The public app name and installer branding are Pixel Buddy.
const legacyUserData = path.join(app.getPath('appData'), 'my-app');
if (fs.existsSync(path.join(legacyUserData, 'settings.json'))) {
  app.setPath('userData', legacyUserData);
}

// Suppress harmless Windows GPU shader cache permission errors in console
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// Register 'buddy-media' as standard, secure, and support fetch
protocol.registerSchemesAsPrivileged([
  { scheme: 'buddy-media', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);
import { SettingsManager } from './settings';
import { ActivityMonitor } from './activity';
import { Scheduler } from './scheduler';
import { TrayManager } from './tray';

let mainWindow: BrowserWindow | null = null;
let settingsManager: SettingsManager;
let activityMonitor: ActivityMonitor;
let scheduler: Scheduler;
let trayManager: TrayManager;

// Enforce single instance — prevents duplicate windows in production.
// In development (npm run dev), hot-reload can spawn new Electron processes,
// so we skip the lock to avoid immediately killing the new instance.
if (!is.dev) {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    process.exit(0);
  }
  app.on('second-instance', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
      mainWindow.webContents.send('window:show-settings');
    }
  });
}

// Window size constants
const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 350;

let lastIgnoreState: boolean | null = null;
let lastForwardState: boolean | null = null;

function safeSetIgnoreMouseEvents(win: BrowserWindow, ignore: boolean, forward: boolean = false): void {
  if (lastIgnoreState !== ignore || lastForwardState !== forward) {
    win.setIgnoreMouseEvents(ignore, { forward });
    lastIgnoreState = ignore;
    lastForwardState = forward;
  }
}

function getBottomRightPosition(width: number, height: number): { x: number; y: number } {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x: originX, y: originY, width: screenWidth, height: screenHeight } = primaryDisplay.workArea;
  const x = originX + screenWidth - width - 20;
  const y = originY + screenHeight - height - 20;
  return { x, y };
}

function createWindow(): void {
  const settings = settingsManager.getSettings();
  let x = settings.windowX;
  let y = settings.windowY;

  if (x !== null && y !== null && x !== undefined && y !== undefined) {
    // Check if the coordinates are visible on any of the connected displays
    const savedX = x;
    const savedY = y;
    const displays = screen.getAllDisplays();
    const isVisible = displays.some((display) => {
      const { x: dx, y: dy, width: dw, height: dh } = display.bounds;
      return savedX >= dx && savedX < dx + dw && savedY >= dy && savedY < dy + dh;
    });
    if (!isVisible) {
      x = null;
      y = null;
    }
  }

  if (x === null || y === null || x === undefined || y === undefined) {
    const pos = getBottomRightPosition(DEFAULT_WIDTH, DEFAULT_HEIGHT);
    x = pos.x;
    y = pos.y;
  }

  const winOptions: Electron.BrowserWindowConstructorOptions = {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  };

  // macOS floating panel — keeps above full-screen apps
  if (process.platform === 'darwin') {
    (winOptions as any).type = 'panel';
  }

  mainWindow = new BrowserWindow(winOptions);

  // Ignore mouse events on transparent areas by default, but allow click forwarding
  safeSetIgnoreMouseEvents(mainWindow, true, true);
  mainWindow.setFullScreenable(false);

  // Overlay on all workspaces and full-screen apps
  if (process.platform === 'darwin') {
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  } else {
    mainWindow.setVisibleOnAllWorkspaces(true);
  }

  mainWindow.on('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show();
      // Use the highest alwaysOnTop level to overlay above all other apps (including full-screen)
      mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
      if (process.platform === 'darwin') {
        mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
      }
      // DevTools intentionally removed — was causing dev tools to pop on every launch
    }
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (/^https?:\/\//i.test(details.url)) shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  // Register media protocol to load local files
  protocol.handle('buddy-media', (request) => {
    try {
      const urlPath = request.url.replace('buddy-media://', '');
      const filePath = decodeURIComponent(urlPath);
      return net.fetch(pathToFileURL(filePath).toString());
    } catch (err) {
      console.error('Failed to resolve buddy-media URL:', err);
      return new Response('Not found', { status: 404 });
    }
  });

  electronApp.setAppUserModelId('com.pixelbuddy');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Initialize managers
  settingsManager = new SettingsManager((settings) => {
    mainWindow?.webContents.send('settings:updated', settings);
  });
  activityMonitor = new ActivityMonitor();
  
  // Setup IPC and scheduler
  scheduler = new Scheduler(settingsManager, activityMonitor, (stateData) => {
    if (trayManager) {
      trayManager.updateMenu(stateData);
    }
    if (mainWindow) {
      mainWindow.webContents.send('scheduler:update', stateData);
    }
  });

  // Tray initialization
  trayManager = new TrayManager(
    // Open Settings Clicked
    () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
        mainWindow.webContents.send('window:show-settings');
      }
    },
    // Toggle Pause Clicked
    () => {
      scheduler.getStateMachine().togglePause();
    },
    // Reset Timer Clicked
    () => {
      scheduler.handleReset();
    }
  );
  trayManager.init();

  // Create buddy window
  createWindow();

  // Start scheduler
  scheduler.start((stateData) => {
    if (mainWindow) {
      mainWindow.webContents.send('scheduler:tick', stateData);
    }
  });

  // ---------------------------------
  // IPC Request/Response Setup
  // ---------------------------------

  // Settings IPC
  ipcMain.handle('settings:get', () => {
    return settingsManager.getSettings();
  });

  ipcMain.handle('settings:save', (_, newSettings) => {
    const previous = settingsManager.getSettings();
    settingsManager.save(newSettings);
    scheduler.handleSettingsChanged(previous);
    // Notify renderer that settings updated
    if (mainWindow) {
      mainWindow.webContents.send('settings:updated', settingsManager.getSettings());
    }
    return settingsManager.getSettings();
  });

  // Scheduler Action IPC
  ipcMain.handle('scheduler:get-state', () => {
    return scheduler.getStateMachine().getData();
  });

  ipcMain.on('scheduler:take-break', () => {
    scheduler.handleTakeBreak();
  });

  ipcMain.on('scheduler:snooze', () => {
    scheduler.handleSnooze();
  });

  ipcMain.on('scheduler:skip', () => {
    scheduler.handleSkip();
  });

  ipcMain.on('scheduler:reset', () => {
    scheduler.handleReset();
  });
  ipcMain.on('scheduler:toggle-pause', () => {
    scheduler.getStateMachine().togglePause();
  });

  ipcMain.on('scheduler:log-hydration', () => {
    scheduler.handleLogHydration();
  });

  ipcMain.on('scheduler:snooze-hydration', () => {
    scheduler.handleSnoozeHydration();
  });

  ipcMain.on('scheduler:dismiss-hydration', () => {
    scheduler.handleDismissHydration();
  });

  // Window Controls IPC
  ipcMain.on('window:set-ignore-mouse-events', (event, ignore) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      if (ignore) {
        safeSetIgnoreMouseEvents(win, true, true);
      } else {
        safeSetIgnoreMouseEvents(win, false, false);
      }
    }
  });

  // Explicit window show/hide
  ipcMain.on('window:show', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isVisible()) {
      win.show();
      win.setAlwaysOnTop(true, 'screen-saver', 1);
    }
  });

  ipcMain.on('window:hide', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && win.isVisible()) {
      win.hide();
    }
  });

  // Custom dragging — main process polls cursor at high rate to eliminate IPC drag latency
  // Renderer only sends drag-start / drag-end. NO drag-move IPC needed.
  let dragStart: { x: number; y: number } | null = null;
  let dragPollInterval: ReturnType<typeof setInterval> | null = null;

  ipcMain.on('window:drag-start', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      safeSetIgnoreMouseEvents(win, false, false);
      const cursor = screen.getCursorScreenPoint();
      const bounds = win.getBounds();
      dragStart = { x: cursor.x - bounds.x, y: cursor.y - bounds.y };
      const width = bounds.width;
      const height = bounds.height;
      let lastX = bounds.x;
      let lastY = bounds.y;

      // Poll cursor position at ~120fps in main process — zero IPC overhead per frame
      if (dragPollInterval) clearInterval(dragPollInterval);
      dragPollInterval = setInterval(() => {
        if (!win || !dragStart) return;
        const pos = screen.getCursorScreenPoint();
        const nextX = pos.x - dragStart.x;
        const nextY = pos.y - dragStart.y;

        if (nextX !== lastX || nextY !== lastY) {
          win.setBounds({
            x: nextX,
            y: nextY,
            width,
            height,
          });
          lastX = nextX;
          lastY = nextY;
        }
      }, 8); // 8ms ≈ 120fps
    }
  });

  // drag-move is now a no-op — drag is handled by the interval above
  ipcMain.on('window:drag-move', () => { /* handled by main-process polling */ });

  ipcMain.on('window:drag-end', (event) => {
    if (dragPollInterval) {
      clearInterval(dragPollInterval);
      dragPollInterval = null;
    }
    dragStart = null;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      const [wx, wy] = win.getPosition();
      const bounds = win.getBounds();
      const currentDisplay = screen.getDisplayMatching(bounds);
      const { x: minX, y: minY, width: screenW, height: screenH } = currentDisplay.workArea;

      // Clamp coordinates to prevent dragging off-screen
      const clampedX = Math.max(minX, Math.min(wx, minX + screenW - bounds.width));
      const clampedY = Math.max(minY, Math.min(wy, minY + screenH - bounds.height));

      win.setPosition(clampedX, clampedY);
      settingsManager.save({ windowX: clampedX, windowY: clampedY });
      win.webContents.send('settings:updated', settingsManager.getSettings());
      safeSetIgnoreMouseEvents(win, true, true);
    }
  });

  // App quit - exit immediately
  ipcMain.on('app:quit', () => {
    app.exit(0);
  });

  // Custom Media Selection via standalone file chooser
  ipcMain.handle('media:select', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Select Companion Video or GIF',
      filters: [
        { name: 'Media Files', extensions: ['mp4', 'webm', 'gif', 'png', 'webp', 'apng'] }
      ],
      properties: ['openFile']
    });
    
    if (canceled || filePaths.length === 0) {
      return null;
    }
    
    const selectedPath = filePaths[0];
    try {
      const copiedPath = await copyMediaToLibrary(selectedPath);
      // Add to media library list
      const settings = settingsManager.getSettings();
      const library = settings.mediaLibrary || [];
      if (!library.includes(copiedPath)) {
        settingsManager.save({ mediaLibrary: [...library, copiedPath] });
      }
      return copiedPath;
    } catch (err) {
      console.error('Failed to copy custom media file:', err);
      return null;
    }
  });

  // Save dropped local path
  ipcMain.handle('media:save-path', async (_, filePath) => {
    try {
      const copiedPath = await copyMediaToLibrary(filePath);
      // Add to media library list
      const settings = settingsManager.getSettings();
      const library = settings.mediaLibrary || [];
      if (!library.includes(copiedPath)) {
        settingsManager.save({ mediaLibrary: [...library, copiedPath] });
      }
      return copiedPath;
    } catch (err) {
      console.error('Failed to copy dropped media file:', err);
      return null;
    }
  });

  ipcMain.handle('media:reset', () => {
    return null;
  });

  // List all media library items
  ipcMain.handle('media:get-library', () => {
    const settings = settingsManager.getSettings();
    const library: string[] = (settings.mediaLibrary || []).filter((p) => {
      try { return fs.existsSync(p); } catch { return false; }
    });
    // Update in case any files were deleted externally
    settingsManager.save({ mediaLibrary: library });
    return library;
  });

  // Delete a specific media item from the library
  ipcMain.handle('media:delete-library-item', (_, filePath: string) => {
    try {
      if (!settingsManager.getSettings().mediaLibrary.includes(filePath)) {
        return settingsManager.getSettings().mediaLibrary;
      }
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      const settings = settingsManager.getSettings();
      const library = (settings.mediaLibrary || []).filter((p) => p !== filePath);
      settingsManager.save({ mediaLibrary: library });
      // If deleted item was the current companion, reset
      if (settings.customVideoPath === filePath) {
        settingsManager.save({ customVideoPath: null });
      }
      if (mainWindow) {
        mainWindow.webContents.send('settings:updated', settingsManager.getSettings());
      }
      return library;
    } catch (err) {
      console.error('Failed to delete media library item:', err);
      return settingsManager.getSettings().mediaLibrary;
    }
  });

  // Custom Sound Selection via standalone file chooser
  ipcMain.handle('sound:select', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Select Custom Break Alarm Sound',
      filters: [
        { name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac'] }
      ],
      properties: ['openFile']
    });
    
    if (canceled || filePaths.length === 0) {
      return null;
    }
    
    const selectedPath = filePaths[0];
    try {
      const userDataPath = app.getPath('userData');
      const soundDir = path.join(userDataPath, 'sounds');
      if (!fs.existsSync(soundDir)) {
        fs.mkdirSync(soundDir, { recursive: true });
      }
      
      const ext = path.extname(selectedPath);
      const destFileName = `custom_sound_${Date.now()}${ext}`;
      const destPath = path.join(soundDir, destFileName);
      
      fs.copyFileSync(selectedPath, destPath);
      return destPath;
    } catch (err) {
      console.error('Failed to copy custom sound file:', err);
      return null;
    }
  });

  ipcMain.handle('sound:reset', () => {
    return null;
  });

  // Relative resize anchored to dynamic screen quadrant
  ipcMain.on('window:resize', (event, width, height) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      const [currentWidth, currentHeight] = win.getSize();
      if (currentWidth !== width || currentHeight !== height) {
        const bounds = win.getBounds();
        const currentDisplay = screen.getDisplayMatching(bounds);
        const { x: minX, y: minY, width: screenW, height: screenH } = currentDisplay.workArea;
        
        const screenCenterX = minX + screenW / 2;
        const screenCenterY = minY + screenH / 2;
        
        // Horizontal anchoring: grow left or right
        let newX = bounds.x;
        if (bounds.x + bounds.width / 2 > screenCenterX) {
          // Right half: grow leftwards (anchor right edge)
          newX = bounds.x + bounds.width - width;
        }
        
        // Vertical anchoring: grow up or down
        let newY = bounds.y;
        if (bounds.y + bounds.height / 2 > screenCenterY) {
          // Bottom half: grow upwards (anchor bottom edge)
          newY = bounds.y + bounds.height - height;
        }
        
        // Clamp bounds to prevent window from going off screen boundaries
        newX = Math.max(minX, Math.min(newX, minX + screenW - width));
        newY = Math.max(minY, Math.min(newY, minY + screenH - height));
        
        win.setBounds({ x: newX, y: newY, width, height }, true); // Animate transition
      }
    }
  });

  // Start mouse polling to check if cursor is over solid elements
  let isSettingsVisible = true; // start with settings visible
  let hasActiveDialogue = false;
  let isWidgetsVisible = false;

  ipcMain.on('window:settings-visibility', (_, visible) => {
    isSettingsVisible = visible;
  });

  ipcMain.on('window:dialogue-active', (_, active) => {
    hasActiveDialogue = active;
  });

  ipcMain.on('window:widgets-visibility', (_, visible) => {
    isWidgetsVisible = visible;
  });

  setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return;
    if (dragStart !== null) return; // don't interrupt active dragging

    const cursor = screen.getCursorScreenPoint();
    const bounds = mainWindow.getBounds();

    // Check if cursor is over the window bounds first
    const rx = cursor.x - bounds.x;
    const ry = cursor.y - bounds.y;

    let shouldIgnore = true;

    if (isSettingsVisible) {
      // Settings panel is fully active
      shouldIgnore = false;
    } else {
      const stateData = scheduler.getStateMachine().getData();
      const state = stateData.state;

      // Check if cursor is within window bounds
      if (rx >= 0 && rx <= bounds.width && ry >= 0 && ry <= bounds.height) {
        // 1. Settings gear & close button area (top right)
        const overHeader = rx >= bounds.width - 95 && rx <= bounds.width && ry >= 0 && ry <= 45;

        // 2. Buddy container (bottom right corner)
        // Buddy is 140x140. With paddings, checking bottom right 165x165.
        const overBuddy = rx >= bounds.width - 165 && rx <= bounds.width && ry >= bounds.height - 165 && ry <= bounds.height;

        // 3. Speech bubble (if active)
        const hasSpeech = state === 'POPUP' || state === 'BREAK' || state === 'IDLE' || hasActiveDialogue;
        let overSpeech = false;
        if (hasSpeech) {
          // Bubble is above the buddy, roughly 240px wide, 140px high
          overSpeech = rx >= bounds.width - 300 && rx <= bounds.width && ry >= 0 && ry <= bounds.height - 135;
        }

        // 4. Widgets panel (if active and in WORKING/SNOOZE state)
        let overWidgets = false;
        if (isWidgetsVisible && (state === 'WORKING' || state === 'SNOOZE')) {
          // Widgets are on the left side: from x=0 to x=195 (assuming window width is 340)
          overWidgets = rx >= 0 && rx <= bounds.width - 165 && ry >= 0 && ry <= bounds.height;
        }

        const overWidgetToggle = rx >= bounds.width - 205 && rx <= bounds.width - 165 && ry >= bounds.height - 105 && ry <= bounds.height - 45;
        if (overHeader || overBuddy || overSpeech || overWidgets || overWidgetToggle) {
          shouldIgnore = false;
        }
      }
    }

    // Set ignore state. Note: forward: true lets the renderer still receive mouse events
    safeSetIgnoreMouseEvents(mainWindow, shouldIgnore, true);
  }, 100);

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  scheduler?.stop();
  trayManager?.destroy();
});

// Helper: copy a media file into the app's userData/media directory
async function copyMediaToLibrary(sourcePath: string): Promise<string> {
  if (typeof sourcePath !== 'string' || !/\.(mp4|webm|gif|png|webp|apng)$/i.test(sourcePath)) {
    throw new Error('Unsupported companion media');
  }
  const userDataPath = app.getPath('userData');
  const mediaDir = path.join(userDataPath, 'media');
  if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
  }
  const ext = path.extname(sourcePath);
  const destFileName = `custom_buddy_${Date.now()}${ext}`;
  const destPath = path.join(mediaDir, destFileName);
  fs.copyFileSync(sourcePath, destPath);
  return destPath;
}
