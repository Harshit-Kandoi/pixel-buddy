import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  // Settings API
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  onSettingsUpdated: (callback) => {
    const subscription = (_, settings) => callback(settings)
    ipcRenderer.on('settings:updated', subscription)
    return () => ipcRenderer.removeListener('settings:updated', subscription)
  },

  // Scheduler API
  getState: () => ipcRenderer.invoke('scheduler:get-state'),
  takeBreak: () => ipcRenderer.send('scheduler:take-break'),
  snooze: () => ipcRenderer.send('scheduler:snooze'),
  skip: () => ipcRenderer.send('scheduler:skip'),
  reset: () => ipcRenderer.send('scheduler:reset'),
  togglePause: () => ipcRenderer.send('scheduler:toggle-pause'),
  onUpdate: (callback) => {
    const subscription = (_, data) => callback(data)
    ipcRenderer.on('scheduler:update', subscription)
    return () => ipcRenderer.removeListener('scheduler:update', subscription)
  },
  onTick: (callback) => {
    const subscription = (_, data) => callback(data)
    ipcRenderer.on('scheduler:tick', subscription)
    return () => ipcRenderer.removeListener('scheduler:tick', subscription)
  },

  // Activity API
  getPermissionStatus: () => ipcRenderer.invoke('activity:get-permission-status'),
  requestPermission: () => ipcRenderer.invoke('activity:request-permission'),

  // Window API
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send('window:set-ignore-mouse-events', ignore),
  resize: (width, height) => ipcRenderer.send('window:resize', width, height),
  onShowSettings: (callback) => {
    const subscription = () => callback()
    ipcRenderer.on('window:show-settings', subscription)
    return () => ipcRenderer.removeListener('window:show-settings', subscription)
  },
  setSettingsVisible: (visible) => ipcRenderer.send('window:settings-visibility', visible),
  setDialogueActive: (active) => ipcRenderer.send('window:dialogue-active', active),
  setWidgetsVisible: (visible) => ipcRenderer.send('window:widgets-visibility', visible),
  logHydration: () => ipcRenderer.send('scheduler:log-hydration'),
  snoozeHydration: () => ipcRenderer.send('scheduler:snooze-hydration'),
  dismissHydration: () => ipcRenderer.send('scheduler:dismiss-hydration'),

  // Window Drag API
  dragStart: () => ipcRenderer.send('window:drag-start'),
  dragMove: () => ipcRenderer.send('window:drag-move'),
  dragEnd: () => ipcRenderer.send('window:drag-end'),

  // Media Selection API
  selectMedia: () => ipcRenderer.invoke('media:select'),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  saveCustomMedia: (filePath) => ipcRenderer.invoke('media:save-path', filePath),
  resetMedia: () => ipcRenderer.invoke('media:reset'),

  // Media Library API (wallpaper-engine style picker)
  getMediaLibrary: () => ipcRenderer.invoke('media:get-library'),
  deleteMediaLibraryItem: (filePath: string) => ipcRenderer.invoke('media:delete-library-item', filePath),

  // Sound Selection API
  selectSound: () => ipcRenderer.invoke('sound:select'),
  resetSound: () => ipcRenderer.invoke('sound:reset'),

  // App Controls
  quit: () => ipcRenderer.send('app:quit'),

  // Visibility Controls
  showWindow: () => ipcRenderer.send('window:show'),
  hideWindow: () => ipcRenderer.send('window:hide')
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
