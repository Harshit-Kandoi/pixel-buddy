import { ElectronAPI } from '@electron-toolkit/preload'
import { AppSettings, StateMachineData } from '../utils/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      getSettings(): Promise<AppSettings>
      saveSettings(settings: Partial<AppSettings>): Promise<AppSettings>
      onSettingsUpdated(callback: (settings: AppSettings) => void): () => void
      getState(): Promise<StateMachineData>
      takeBreak(): void
      snooze(): void
      skip(): void
      reset(): void
      onUpdate(callback: (data: StateMachineData) => void): () => void
      onTick(callback: (data: StateMachineData) => void): () => void
      getPermissionStatus(): Promise<boolean>
      requestPermission(): Promise<boolean>
      setIgnoreMouseEvents(ignore: boolean): void
      resize(width: number, height: number): void
      onShowSettings(callback: () => void): () => void
      dragStart(): void
      dragMove(): void
      dragEnd(): void
      selectMedia(): Promise<string | null>
      saveCustomMedia(filePath: string): Promise<string | null>
      resetMedia(): Promise<null>
      selectSound(): Promise<string | null>
      resetSound(): Promise<null>
      quit(): void
      showWindow(): void
      hideWindow(): void
    }
  }
}
