import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../utils/constants';
import { HISTORY_DAYS, breakStreak, dailyReset, recentDays, totals, type DayStats } from '../../utils/history';
import type { AppSettings } from '../../utils/types';

const day = (date: string, patch: Partial<DayStats> = {}): DayStats => ({ date, focusMinutes: 120, breaks: 2, skipped: 0, snoozed: 0, water: 4, waterGoal: 8, ...patch });
const settings = (patch: Partial<AppSettings> = {}): AppSettings => ({ ...DEFAULT_SETTINGS, ...patch }) as AppSettings;

describe('daily reset', () => {
  it('does nothing twice on the same day', () => {
    expect(dailyReset(settings({ hydrationLastResetDate: '2026-11-21' }), '2026-11-21')).toBeNull();
  });

  it("files yesterday's counters under yesterday and starts today at zero", () => {
    const patch = dailyReset(
      settings({ hydrationLastResetDate: '2026-11-20', statsFocusMinutesToday: 200, statsBreaksCompletedToday: 3, statsBreaksSkippedToday: 1, hydrationDrankToday: 6, hydrationGoal: 8 }),
      '2026-11-21',
    )!;
    expect(patch.history).toEqual([{ date: '2026-11-20', focusMinutes: 200, breaks: 3, skipped: 1, snoozed: 0, water: 6, waterGoal: 8 }]);
    expect(patch).toMatchObject({ statsFocusMinutesToday: 0, statsBreaksCompletedToday: 0, hydrationDrankToday: 0, hydrationLastResetDate: '2026-11-21' });
  });

  it('files the right day after the app was closed for a while, and skips empty days', () => {
    const s = settings({ hydrationLastResetDate: '2026-11-14', statsFocusMinutesToday: 50, history: [day('2026-11-13')] });
    expect(dailyReset(s, '2026-11-21')!.history!.map((d) => d.date)).toEqual(['2026-11-13', '2026-11-14']);
    expect(dailyReset(settings({ hydrationLastResetDate: '2026-11-20' }), '2026-11-21')!.history).toEqual([]);
    expect(dailyReset(settings({ hydrationLastResetDate: null, statsFocusMinutesToday: 9 }), '2026-11-21')!.history).toEqual([]);
  });

  it(`keeps only the last ${HISTORY_DAYS} days and survives bad data`, () => {
    const s = settings({ hydrationLastResetDate: '2026-11-20', history: [day('2026-01-01'), day('2026-11-01'), null as unknown as DayStats] });
    expect(dailyReset(s, '2026-11-21')!.history!.map((d) => d.date)).toEqual(['2026-11-01']);
    expect(dailyReset(settings({ hydrationLastResetDate: '2026-11-20', history: undefined as unknown as DayStats[] }), '2026-11-21')!.history).toEqual([]);
  });
});

describe('recent days', () => {
  it('fills a week with gaps as zero and today from the live counters', () => {
    const week = recentDays(settings({ statsBreaksCompletedToday: 1, statsFocusMinutesToday: 30, history: [day('2026-11-17', { breaks: 4 })] }), '2026-11-21');
    expect(week.map((d) => d.date)).toEqual(['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21']);
    expect(week.map((d) => d.breaks)).toEqual([0, 0, 4, 0, 0, 0, 1]);
    expect(week[6].focusMinutes).toBe(30);
  });

  it('crosses month and year ends', () => {
    expect(recentDays(settings(), '2027-01-02', 3).map((d) => d.date)).toEqual(['2026-12-31', '2027-01-01', '2027-01-02']);
  });

  it('adds up a week', () => {
    expect(totals([day('a', { water: 8 }), day('b', { focusMinutes: 5, breaks: 0 })])).toEqual({ focusMinutes: 125, breaks: 2, waterGoalDays: 1, activeDays: 1 });
  });
});

describe('break streaks', () => {
  const today = '2026-11-21';
  it('counts working days in a row with a finished break, including today once you take one', () => {
    const history = [day('2026-11-18'), day('2026-11-19'), day('2026-11-20')];
    expect(breakStreak(settings({ history }), today)).toEqual({ current: 3, best: 3 });
    expect(breakStreak(settings({ history, statsBreaksCompletedToday: 1 }), today)).toEqual({ current: 4, best: 4 });
  });

  it("doesn't break over days off (weekends, the app closed, barely any focus)", () => {
    const history = [day('2026-11-13'), day('2026-11-14', { breaks: 0, focusMinutes: 5 }), day('2026-11-17'), day('2026-11-20')];
    expect(breakStreak(settings({ history }), today).current).toBe(3);
  });

  it('a working day without a finished break ends it, and best remembers the longest', () => {
    const history = [day('2026-11-10'), day('2026-11-11'), day('2026-11-12'), day('2026-11-13', { breaks: 0, skipped: 3 }), day('2026-11-20')];
    expect(breakStreak(settings({ history }), today)).toEqual({ current: 1, best: 3 });
  });

  it('starts at zero', () => {
    expect(breakStreak(settings(), today)).toEqual({ current: 0, best: 0 });
  });
});
