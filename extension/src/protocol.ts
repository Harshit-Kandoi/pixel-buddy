/// <reference types="chrome" />
import type { AppSettings, StateMachineData } from '../../src/utils/types';

// Calls from extension pages (tab overlay, popup) to the service worker, which owns the scheduler.
export type Call =
  | { type: 'getSettings' }
  | { type: 'saveSettings'; patch: Partial<AppSettings> }
  | { type: 'getState' }
  | { type: 'action'; action: SchedulerAction }
  | { type: 'input' };

export type SchedulerAction = 'takeBreak' | 'snooze' | 'skip' | 'reset' | 'togglePause' | 'logHydration' | 'snoozeHydration' | 'dismissHydration';

// Pushed from the service worker over a long-lived port while a page is visible.
export type Push =
  | { type: 'update'; data: StateMachineData }
  | { type: 'tick'; data: StateMachineData }
  | { type: 'settings'; settings: AppSettings };

// Messages from the overlay iframe to the content script that hosts it.
export type FrameMessage =
  | { type: 'frame'; full: true }
  | { type: 'frame'; full: false; right: number; bottom: number; width: number; height: number }
  | { type: 'visible'; visible: boolean }
  | { type: 'hitRects'; rects: Rect[] }
  | { type: 'interactive'; value: boolean };

export interface Rect { x: number; y: number; width: number; height: number }
export interface Position { right: number; bottom: number; left?: boolean; top?: boolean }

export const PORT_PAGE = 'page';
export const PORT_POPUP = 'popup';
export const FRAME_TAG = 'pixel-buddy';

// chrome.storage.local keys shared by every context.
export const KEY_SETTINGS = 'settings';
export const KEY_PAGES_ENABLED = 'pagesEnabled';
export const KEY_POSITION = 'position';

export const call = <T>(message: Call): Promise<T> => chrome.runtime.sendMessage(message);
