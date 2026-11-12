import { describe, expect, it } from 'vitest';
import { TIRED_AFTER_SECONDS, buddyMood, finishedBreak } from '../../utils/mood';
import type { StateMachineData } from '../../utils/types';

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

describe('buddy mood', () => {
  it('is calm by default', () => {
    expect(buddyMood(data(), false)).toBeNull();
  });

  it('gets tired after skipping or snoozing a break, or a long focus stretch', () => {
    expect(buddyMood(data({ skipsCount: 1 }), false)).toBe('tired');
    expect(buddyMood(data({ state: 'SNOOZE' }), false)).toBe('tired');
    expect(buddyMood(data({ activeWorkSeconds: TIRED_AFTER_SECONDS }), false)).toBe('tired');
  });

  it('is happy after a finished break, and a call outranks everything', () => {
    expect(buddyMood(data({ skipsCount: 1 }), true)).toBe('happy');
    expect(buddyMood(data({ inMeeting: true, skipsCount: 2 }), true)).toBe('call');
  });

  it('shows nothing while paused, on a break or at a reminder', () => {
    expect(buddyMood(data({ isPaused: true, skipsCount: 1 }), false)).toBeNull();
    expect(buddyMood(data({ state: 'BREAK' }), true)).toBeNull();
    expect(buddyMood(data({ state: 'POPUP', skipsCount: 1 }), false)).toBeNull();
  });

  it('counts only breaks seen through to the end as finished', () => {
    expect(finishedBreak(data({ state: 'BREAK', breakSecondsLeft: 1 }), data())).toBe(true);
    expect(finishedBreak(data({ state: 'BREAK', breakSecondsLeft: 0 }), data())).toBe(true);
    expect(finishedBreak(data({ state: 'BREAK', breakSecondsLeft: 200 }), data())).toBe(false); // back to work early
    expect(finishedBreak(null, data())).toBe(false);
  });
});
