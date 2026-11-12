import { describe, test, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { Scheduler } from '../scheduler';
import type { SettingsManager } from '../settings';
import type { ActivityMonitor } from '../activity';

type MockSettings = SettingsManager & { save: Mock; getSettings: Mock };
type MockActivity = ActivityMonitor & { start: Mock; stop: Mock; tick: Mock; getContinuousIdleSeconds: Mock; resetMinuteScore: Mock; markActive: Mock };
import { APP_STATES, DEFAULT_SETTINGS } from '../../utils/constants';

describe('Scheduler', () => {
  let mockSettingsManager: MockSettings;
  let mockActivityMonitor: MockActivity;
  let onBreakDetectedCb: () => void;
  let onIdleDetectedCb: () => void;
  let onActiveResumedCb: () => void;

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
    } as unknown as MockSettings;

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
      markActive: vi.fn(),
    } as unknown as MockActivity;
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

    // Steady mouse/key activity: after the 2 s grace period, 4 active seconds mean you're back.
    mockActivityMonitor.tick.mockReturnValue({ isActiveThisSecond: true });
    vi.advanceTimersByTime(5000);
    expect(sm.getState()).toBe(APP_STATES.BREAK);
    vi.advanceTimersByTime(1000);

    expect(sm.getState()).toBe(APP_STATES.WORKING);
    expect(sm.getData().activeWorkSeconds).toBe(0);
    scheduler.stop();
  });

  test('a brief nudge of the mouse does not end a break', () => {
    const scheduler = new Scheduler(mockSettingsManager, mockActivityMonitor, vi.fn());
    scheduler.start(vi.fn());
    scheduler.handleTakeBreak();
    const sm = scheduler.getStateMachine();

    vi.advanceTimersByTime(3000);
    mockActivityMonitor.tick.mockReturnValue({ isActiveThisSecond: true });
    vi.advanceTimersByTime(2000); // reaching for the buddy
    mockActivityMonitor.tick.mockReturnValue({ isActiveThisSecond: false });
    vi.advanceTimersByTime(20000);
    expect(sm.getState()).toBe(APP_STATES.BREAK);
    scheduler.stop();
  });

  test('using Pixel Buddy during a break (clicking it, settings) does not end the break', () => {
    const scheduler = new Scheduler(mockSettingsManager, mockActivityMonitor, vi.fn());
    scheduler.start(vi.fn());
    scheduler.handleTakeBreak();
    const sm = scheduler.getStateMachine();
    const breakLeft = sm.getData().breakSecondsLeft;

    // Clicking around in settings for 40 s: lots of input, all of it buddy interaction.
    mockActivityMonitor.tick.mockReturnValue({ isActiveThisSecond: true });
    for (let i = 0; i < 8; i++) {
      scheduler.handleBuddyInteraction();
      vi.advanceTimersByTime(5000);
    }
    expect(sm.getState()).toBe(APP_STATES.BREAK);
    expect(sm.getData().breakSecondsLeft).toBe(breakLeft - 40); // the break kept counting down

    // Settings closed, back to real work: the 15 s hold from the last click (10 s of it left)
    // runs out, then 4 s of steady input end the break.
    vi.advanceTimersByTime(13000);
    expect(sm.getState()).toBe(APP_STATES.BREAK);
    vi.advanceTimersByTime(1000);
    expect(sm.getState()).toBe(APP_STATES.WORKING);
    scheduler.stop();
  });

  test('buddy interaction outside a break changes nothing', () => {
    const scheduler = new Scheduler(mockSettingsManager, mockActivityMonitor, vi.fn());
    scheduler.start(vi.fn());
    scheduler.handleBuddyInteraction();
    expect(scheduler.getStateMachine().getState()).toBe(APP_STATES.WORKING);
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


  test('uses the away time from settings', () => {
    mockSettingsManager.save({ awayMinutes: 2 });
    const scheduler = new Scheduler(mockSettingsManager, mockActivityMonitor, vi.fn());
    scheduler.start(vi.fn());
    vi.advanceTimersByTime(1000);
    expect(mockActivityMonitor.tick).toHaveBeenLastCalledWith(true, true, 120);
    // Past the away time, focus time stops counting.
    mockActivityMonitor.getContinuousIdleSeconds.mockReturnValue(130);
    const before = scheduler.getStateMachine().getData().activeWorkSeconds;
    vi.advanceTimersByTime(3000);
    expect(scheduler.getStateMachine().getData().activeWorkSeconds).toBe(before);
    scheduler.stop();
  });

  describe('during a call', () => {
    test('holds the break reminder until the call ends, and keeps counting focus time', () => {
      const scheduler = new Scheduler(mockSettingsManager, mockActivityMonitor, vi.fn());
      scheduler.start(vi.fn());
      scheduler.setInMeeting(true);
      vi.advanceTimersByTime(90000); // work duration is 1 minute
      expect(scheduler.getStateMachine().getData()).toMatchObject({ state: 'WORKING', inMeeting: true, activeWorkSeconds: 90 });
      scheduler.setInMeeting(false);
      vi.advanceTimersByTime(1000);
      expect(scheduler.getStateMachine().getData()).toMatchObject({ state: 'POPUP', inMeeting: false });
      scheduler.stop();
    });

    test('holds snooze and water reminders too', () => {
      const scheduler = new Scheduler(mockSettingsManager, mockActivityMonitor, vi.fn());
      scheduler.start(vi.fn());
      scheduler.getStateMachine().setHydrationSeconds(5);
      scheduler.handleSnooze(); // 1 minute
      scheduler.setInMeeting(true);
      vi.advanceTimersByTime(120000);
      expect(scheduler.getStateMachine().getData()).toMatchObject({ state: 'SNOOZE', snoozeSecondsLeft: 1, hydrationReminderActive: false });
      scheduler.setInMeeting(false);
      vi.advanceTimersByTime(1000);
      expect(scheduler.getStateMachine().getData()).toMatchObject({ state: 'POPUP', hydrationReminderActive: true });
      scheduler.stop();
    });

    test('sitting still on a call is not being away, and is not a break', () => {
      const scheduler = new Scheduler(mockSettingsManager, mockActivityMonitor, vi.fn());
      scheduler.start(vi.fn());
      scheduler.getStateMachine().setWorkSeconds(30);
      scheduler.setInMeeting(true);
      onIdleDetectedCb();
      onBreakDetectedCb();
      expect(scheduler.getStateMachine().getData()).toMatchObject({ state: 'WORKING', activeWorkSeconds: 30 });
      mockActivityMonitor.getContinuousIdleSeconds.mockReturnValue(1000);
      vi.advanceTimersByTime(5000);
      expect(scheduler.getStateMachine().getData().activeWorkSeconds).toBe(35);
      // Away time counts from the start and end of the call.
      expect(mockActivityMonitor.markActive).toHaveBeenCalledTimes(1);
      scheduler.setInMeeting(false);
      expect(mockActivityMonitor.markActive).toHaveBeenCalledTimes(2);
      scheduler.stop();
    });

    test('joining a call while away counts as being back', () => {
      const scheduler = new Scheduler(mockSettingsManager, mockActivityMonitor, vi.fn());
      scheduler.start(vi.fn());
      onIdleDetectedCb();
      expect(scheduler.getStateMachine().getState()).toBe('IDLE');
      scheduler.setInMeeting(true);
      expect(scheduler.getStateMachine().getState()).toBe('WORKING');
      scheduler.stop();
    });

    test('turning call detection off releases held reminders', () => {
      const scheduler = new Scheduler(mockSettingsManager, mockActivityMonitor, vi.fn());
      scheduler.setInMeeting(true);
      const previous = mockSettingsManager.getSettings();
      mockSettingsManager.save({ meetingAware: false });
      scheduler.handleSettingsChanged(previous);
      expect(scheduler.getStateMachine().getData().inMeeting).toBe(false);
    });
  });

});
