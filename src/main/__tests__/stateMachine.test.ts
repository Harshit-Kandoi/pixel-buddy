import { describe, test, expect, vi } from 'vitest';
import { StateMachine } from '../stateMachine';
import { APP_STATES } from '../../utils/constants';

describe('StateMachine', () => {
  test('initializes with default state WORKING', () => {
    const onStateChange = vi.fn();
    const sm = new StateMachine(onStateChange);

    expect(sm.getState()).toBe(APP_STATES.WORKING);
    const data = sm.getData();
    expect(data.activeWorkSeconds).toBe(0);
    expect(data.isPaused).toBe(false);
    expect(data.skipsCount).toBe(0);
  });

  test('transitions to new state and triggers callback', () => {
    const onStateChange = vi.fn();
    const sm = new StateMachine(onStateChange);

    sm.transitionTo(APP_STATES.BREAK);
    expect(sm.getState()).toBe(APP_STATES.BREAK);
    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenCalledWith(sm.getData());
  });

  test('does not trigger callback for redundant transition', () => {
    const onStateChange = vi.fn();
    const sm = new StateMachine(onStateChange);

    sm.transitionTo(APP_STATES.WORKING);
    expect(onStateChange).not.toHaveBeenCalled();
  });

  test('increments work time only when in WORKING state', () => {
    const sm = new StateMachine(vi.fn());

    sm.incrementWorkTime(5);
    expect(sm.getData().activeWorkSeconds).toBe(5);

    // Transition to BREAK, incrementWorkTime should be ignored
    sm.transitionTo(APP_STATES.BREAK);
    sm.incrementWorkTime(10);
    expect(sm.getData().activeWorkSeconds).toBe(5);
  });

  test('decrements timers in correct states', () => {
    const sm = new StateMachine(vi.fn());

    // Break seconds decrementing
    sm.setBreakSeconds(60);
    sm.decrementBreakSeconds(10); // Ignored because state is WORKING
    expect(sm.getData().breakSecondsLeft).toBe(60);

    sm.transitionTo(APP_STATES.BREAK);
    sm.decrementBreakSeconds(10);
    expect(sm.getData().breakSecondsLeft).toBe(50);

    // Snooze seconds decrementing
    sm.setSnoozeSeconds(120);
    sm.decrementSnoozeSeconds(20); // Ignored because state is BREAK
    expect(sm.getData().snoozeSecondsLeft).toBe(120);

    sm.transitionTo(APP_STATES.SNOOZE);
    sm.decrementSnoozeSeconds(20);
    expect(sm.getData().snoozeSecondsLeft).toBe(100);
  });

  test('toggles pause', () => {
    const sm = new StateMachine(vi.fn());

    expect(sm.getData().isPaused).toBe(false);
    sm.togglePause();
    expect(sm.getData().isPaused).toBe(true);
    sm.togglePause(false);
    expect(sm.getData().isPaused).toBe(false);
  });

  test('tracks skips', () => {
    const sm = new StateMachine(vi.fn());

    expect(sm.getSkipsCount()).toBe(0);
    sm.incrementSkips();
    expect(sm.getSkipsCount()).toBe(1);
    sm.resetSkips();
    expect(sm.getSkipsCount()).toBe(0);
  });
});
