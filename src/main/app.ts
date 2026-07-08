import { app, shell, BrowserWindow, ipcMain, screen, protocol, dialog, net } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';

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

// Window size constants
const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 350;

function getBottomRightPosition(width: number, height: number): { x: number; y: number } {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workArea;
  const x = screenWidth - width - 20; // 20px padding from right
  const y = screenHeight - height - 20; // 20px padding from bottom
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

  mainWindow = new BrowserWindow({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  });

  // Ignore mouse events on transparent areas by default, but allow click forwarding
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  mainWindow.on('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show();
      // Ensure always on top stands
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
      mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

      // Open DevTools in development mode
      if (is.dev) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
      }
    }
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
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
  settingsManager = new SettingsManager();
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
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
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
    settingsManager.save(newSettings);
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

  // Window Controls IPC
  ipcMain.on('window:set-ignore-mouse-events', (event, ignore) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      if (ignore) {
        win.setIgnoreMouseEvents(true, { forward: true });
      } else {
        win.setIgnoreMouseEvents(false);
      }
    }
  });

  // Explicit window show/hide
  ipcMain.on('window:show', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isVisible()) {
      win.show();
      win.setAlwaysOnTop(true, 'screen-saver');
    }
  });

  ipcMain.on('window:hide', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && win.isVisible()) {
      win.hide();
    }
  });

  // Custom dragging logic for borderless window (saves final location)
  let dragStart: { x: number; y: number } | null = null;
  ipcMain.on('window:drag-start', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      const cursor = screen.getCursorScreenPoint();
      const bounds = win.getBounds();
      dragStart = {
        x: cursor.x - bounds.x,
        y: cursor.y - bounds.y
      };
    }
  });

  ipcMain.on('window:drag-move', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && dragStart) {
      const cursor = screen.getCursorScreenPoint();
      win.setBounds({
        x: cursor.x - dragStart.x,
        y: cursor.y - dragStart.y,
        width: win.getBounds().width,
        height: win.getBounds().height
      });
    }
  });

  ipcMain.on('window:drag-end', (event) => {
    dragStart = null;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      const [wx, wy] = win.getPosition();
      // Persist user-defined drag coordinates
      settingsManager.save({ windowX: wx, windowY: wy });
      win.webContents.send('settings:updated', settingsManager.getSettings());
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
      const userDataPath = app.getPath('userData');
      const mediaDir = path.join(userDataPath, 'media');
      if (!fs.existsSync(mediaDir)) {
        fs.mkdirSync(mediaDir, { recursive: true });
      }
      
      const ext = path.extname(selectedPath);
      const destFileName = `custom_buddy_${Date.now()}${ext}`;
      const destPath = path.join(mediaDir, destFileName);
      
      fs.copyFileSync(selectedPath, destPath);
      return destPath;
    } catch (err) {
      console.error('Failed to copy custom media file:', err);
      return null;
    }
  });

  // Save dropped local path
  ipcMain.handle('media:save-path', async (_, filePath) => {
    try {
      const userDataPath = app.getPath('userData');
      const mediaDir = path.join(userDataPath, 'media');
      if (!fs.existsSync(mediaDir)) {
        fs.mkdirSync(mediaDir, { recursive: true });
      }
      
      const ext = path.extname(filePath);
      const destFileName = `custom_buddy_${Date.now()}${ext}`;
      const destPath = path.join(mediaDir, destFileName);
      
      fs.copyFileSync(filePath, destPath);
      return destPath;
    } catch (err) {
      console.error('Failed to copy dropped media file:', err);
      return null;
    }
  });

  ipcMain.handle('media:reset', () => {
    return null;
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
  scheduler.stop();
  trayManager.destroy();
});
