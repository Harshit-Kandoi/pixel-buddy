import { describe, expect, it } from 'vitest';
import { clock, nowStatus } from '../../utils/nowStatus';
import { DEFAULT_SETTINGS } from '../../utils/constants';
import type { AppSettings, StateMachineData } from '../../utils/types';

const settings = { ...DEFAULT_SETTINGS, workDuration: 25, breakDuration: 5 } as AppSettings;
const data = (patch: Partial<StateMachineData> = {}): StateMachineData => ({
  state: 'WORKING',
  activeWorkSeconds: 600,
  breakSecondsLeft: 0,
  snoozeSecondsLeft: 0,
  skipSecondsLeft: 0,
  skipsCount: 0,
  isPaused: false,
  hydrationSecondsLeft: 600,
  hydrationReminderActive: false,
  inMeeting: false,
  ...patch,
});

describe('status at the top of Settings', () => {
  it('formats a countdown', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(65)).toBe('1:05');
    expect(clock(3725)).toBe('1:02:05');
  });

  it('counts down to the next break while working', () => {
    expect(nowStatus(data(), settings)).toMatchObject({ label: 'Next break in', time: '15:00', progress: 0.4 });
  });

  it('says when reminders are paused, whatever the state', () => {
    expect(nowStatus(data({ isPaused: true, state: 'SNOOZE' }), settings)).toMatchObject({ label: 'Reminders paused', time: '' });
  });

  it('shows the break, snooze, skip and away states', () => {
    expect(nowStatus(data({ state: 'BREAK', breakSecondsLeft: 150 }), settings)).toMatchObject({ label: 'On a break', time: '2:30 left', progress: 0.5 });
    expect(nowStatus(data({ state: 'SNOOZE', snoozeSecondsLeft: 300 }), settings)).toMatchObject({ time: '5:00' });
    expect(nowStatus(data({ skipSecondsLeft: 90 }), settings).label).toMatch(/Skipped/);
    expect(nowStatus(data({ state: 'IDLE' }), settings).label).toMatch(/Away/);
    expect(nowStatus(data({ state: 'POPUP' }), settings).label).toBe('Time for a break');
  });

  it('waits for a call to end once the focus time is up', () => {
    expect(nowStatus(data({ inMeeting: true, activeWorkSeconds: 1500 }), settings)).toMatchObject({ label: 'On a call · break after it', time: '' });
    expect(nowStatus(data({ inMeeting: true }), settings).label).toBe('On a call · next break in');
  });
});
