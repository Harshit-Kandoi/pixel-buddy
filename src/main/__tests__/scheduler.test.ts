import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scheduler } from '../scheduler';
import { APP_STATES, DEFAULT_SETTINGS } from '../../utils/constants';

describe('Scheduler', () => {
  let mockSettingsManager: any;
  let mockActivityMonitor: any;
  let onBreakDetectedCb: any;
  let onIdleDetectedCb: any;
  let onActiveResumedCb: any;

  beforeEach(() => {
    vi.useFakeTimers();

    mockSettingsManager = {
      save: vi.fn().mockImplementation((patch) => {
        const current = mockSettingsManager.getSettings();
        mockSettingsManager.getSettings.mockReturnValue({ ...current, ...patch });
      }),
      getSettings: vi.fn().mockReturnValue({
        ...DEFAULT_SETTINGS,
        workDuration: 1, // 1 minute = 60s
        breakDuration: 1, // 1 minute = 60s
        snoozeDuration: 1, // 1 minute = 60s
        skipDuration: 1, // 1 minute = 60s
      }),
    };

    mockActivityMonitor = {
      start: vi.fn().mockImplementation((onBreak, onIdle, onResume) => {
        onBreakDetectedCb = onBreak;
        onIdleDetectedCb = onIdle;
        onActiveResumedCb = onResume;
      }),
      stop: vi.fn(),
      tick: vi.fn().mockReturnValue({ isActiveThisSecond: false }),
      getContinuousIdleSeconds: vi.fn().mockReturnValue(0),
      resetMinuteScore: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('starts tracking and runs tick every second', () => {
    const onStateChange = vi.fn();
    const onTick = vi.fn();
    const scheduler = new Scheduler(mockSettingsManager, mockActivityMonitor, onStateChange);

    scheduler.start(onTick);

    expect(mockActivityMonitor.start).toHaveBeenCalledTimes(1);
    expect(onTick).toHaveBeenCalledTimes(1); // initial tick emission

    // Advance 3 seconds
    vi.advanceTimersByTime(3000);

    expect(mockActivityMonitor.tick).toHaveBeenCalledTimes(3);
    scheduler.stop();
  });

  test('accumulates work time and transitions to POPUP when work duration reached', () => {
    const scheduler = new Scheduler(mockSettingsManager, mockActivityMonitor, vi.fn());
    scheduler.start(vi.fn());

    // Mock active work ticks
    mockActivityMonitor.tick.mockReturnValue({ isActiveThisSecond: true });
    mockActivityMonitor.getContinuousIdleSeconds.mockReturnValue(0);

    // Advance 60 seconds (workDuration settings is 1 min)
    for (let i = 0; i < 60; i++) {
      vi.advanceTimersByTime(1000);
    }

    const stateMachine = scheduler.getStateMachine();
    expect(stateMachine.getState()).toBe(APP_STATES.POPUP);
    scheduler.stop();
  });

  test('handles take break command and transitions break correctly', () => {
    const scheduler = new Scheduler(mockSettingsManager, mockActivityMonitor, vi.fn());
    scheduler.start(vi.fn());

    scheduler.handleTakeBreak();
    const sm = scheduler.getStateMachine();
    expect(sm.getState()).toBe(APP_STATES.BREAK);
    expect(sm.getData().breakSecondsLeft).toBe(60); // 1 min break

    // Advance 60 seconds of idle time to complete break
    mockActivityMonitor.tick.mockReturnValue({ isActiveThisSecond: false });
    for (let i = 0; i < 60; i++) {
      vi.advanceTimersByTime(1000);
    }

    expect(sm.getState()).toBe(APP_STATES.WORKING);
    expect(sm.getData().activeWorkSeconds).toBe(0);
    scheduler.stop();
  });

  test('resets timer early if user performs activity during break', () => {
    const scheduler = new Scheduler(mockSettingsManager, mockActivityMonitor, vi.fn());
    scheduler.start(vi.fn());

    scheduler.handleTakeBreak();
    const sm = scheduler.getStateMachine();
    expect(sm.getState()).toBe(APP_STATES.BREAK);

    // Simulate mouse/key activity on next tick
    mockActivityMonitor.tick.mockReturnValue({ isActiveThisSecond: true });
    vi.advanceTimersByTime(1000);
    expect(sm.getState()).toBe(APP_STATES.BREAK);
    vi.advanceTimersByTime(2000);

    expect(sm.getState()).toBe(APP_STATES.WORKING);
    expect(sm.getData().activeWorkSeconds).toBe(0);
    scheduler.stop();
  });

  test('handles snooze command and returns to POPUP after snooze ends', () => {
    const scheduler = new Scheduler(mockSettingsManager, mockActivityMonitor, vi.fn());
    scheduler.start(vi.fn());

    scheduler.handleSnooze();
    const sm = scheduler.getStateMachine();
    expect(sm.getState()).toBe(APP_STATES.SNOOZE);
    expect(sm.getData().snoozeSecondsLeft).toBe(60); // 1 min snooze

    // Advance 60 seconds
    for (let i = 0; i < 60; i++) {
      vi.advanceTimersByTime(1000);
    }

    expect(sm.getState()).toBe(APP_STATES.POPUP);
    scheduler.stop();
  });

  test('transitions to IDLE and back based on activityMonitor callbacks', () => {
    const scheduler = new Scheduler(mockSettingsManager, mockActivityMonitor, vi.fn());
    scheduler.start(vi.fn());

    const sm = scheduler.getStateMachine();
    expect(sm.getState()).toBe(APP_STATES.WORKING);

    // Trigger idle callback
    onIdleDetectedCb();
    expect(sm.getState()).toBe(APP_STATES.IDLE);

    // Trigger active resumed callback
    onActiveResumedCb();
    expect(sm.getState()).toBe(APP_STATES.WORKING);

    scheduler.stop();
  });

  test('resets work timer when long break detected callback fires', () => {
    const scheduler = new Scheduler(mockSettingsManager, mockActivityMonitor, vi.fn());
    scheduler.start(vi.fn());

    const sm = scheduler.getStateMachine();
    sm.setWorkSeconds(30);
    sm.incrementSkips();

    // Trigger long break callback
    onBreakDetectedCb();

    expect(sm.getData().activeWorkSeconds).toBe(0);
    expect(sm.getSkipsCount()).toBe(0);
    expect(sm.getState()).toBe(APP_STATES.WORKING);

    scheduler.stop();
  });
  test('reset clears all cooldowns and resumes a paused timer', () => {
    const scheduler = new Scheduler(mockSettingsManager, mockActivityMonitor, vi.fn());
    const sm = scheduler.getStateMachine();
    sm.setSkipSeconds(600);
    sm.setSnoozeSeconds(300);
    sm.setBreakSeconds(60);
    sm.setWorkSeconds(40);
    sm.togglePause(true);
    scheduler.handleReset();
    expect(sm.getData()).toMatchObject({ state: 'WORKING', skipSecondsLeft: 0, snoozeSecondsLeft: 0, breakSecondsLeft: 0, activeWorkSeconds: 0, isPaused: false });
  });

  test('regular timer mode allows a full break even with activity', () => {
    mockSettingsManager.save({ smartMonitoringEnabled: false });
    mockActivityMonitor.tick.mockReturnValue({ isActiveThisSecond: true });
    const scheduler = new Scheduler(mockSettingsManager, mockActivityMonitor, vi.fn());
    scheduler.start(vi.fn());
    scheduler.handleTakeBreak();
    vi.advanceTimersByTime(30000);
    expect(scheduler.getStateMachine().getData()).toMatchObject({ state: 'BREAK', breakSecondsLeft: 30 });
    vi.advanceTimersByTime(30000);
    expect(mockSettingsManager.getSettings().statsBreaksCompletedToday).toBe(1);
    scheduler.stop();
  });

  test('counts a long absence in IDLE as an offline break', () => {
    const scheduler = new Scheduler(mockSettingsManager, mockActivityMonitor, vi.fn());
    scheduler.start(vi.fn());
    scheduler.getStateMachine().setWorkSeconds(59);
    scheduler.getStateMachine().setSkipSeconds(10);
    onIdleDetectedCb();
    mockActivityMonitor.tick.mockImplementation((canReset) => {
      if (canReset) onBreakDetectedCb();
      onActiveResumedCb();
      return { isActiveThisSecond: true };
    });
    vi.advanceTimersByTime(1000);
    expect(scheduler.getStateMachine().getData()).toMatchObject({ state: 'WORKING', activeWorkSeconds: 1 });
    scheduler.stop();
  });

  test('changing hydration interval applies immediately and clears its reminder', () => {
    const scheduler = new Scheduler(mockSettingsManager, mockActivityMonitor, vi.fn());
    const previous = mockSettingsManager.getSettings();
    scheduler.getStateMachine().setHydrationReminderActive(true);
    mockSettingsManager.save({ hydrationInterval: 20 });
    scheduler.handleSettingsChanged(previous);
    expect(scheduler.getStateMachine().getData()).toMatchObject({ hydrationSecondsLeft: 1200, hydrationReminderActive: false });
  });

  test('starting twice does not create duplicate timers', () => {
    const scheduler = new Scheduler(mockSettingsManager, mockActivityMonitor, vi.fn());
    scheduler.start(vi.fn());
    scheduler.start(vi.fn());
    vi.advanceTimersByTime(3000);
    expect(mockActivityMonitor.tick).toHaveBeenCalledTimes(3);
    scheduler.stop();
  });

});
