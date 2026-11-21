import type { AppSettings } from './types';

// Daily history and break streaks. Each day's counters live in the settings until the daily
// reset; the reset files them under the day they belong to (hydrationLastResetDate) and starts
// today from zero. Days the app didn't run simply have no entry.

export interface DayStats {
  /** Local date, YYYY-MM-DD. */
  date: string;
  focusMinutes: number;
  breaks: number;
  skipped: number;
  snoozed: number;
  water: number;
  waterGoal: number;
}

/** How many past days are kept (a little over two months: enough for "best streak" to mean something). */
export const HISTORY_DAYS = 70;
/** A day you didn't work at all doesn't break a streak; this much focus makes it a working day. */
export const WORKED_DAY_MINUTES = 15;
/** Streak lengths the buddy celebrates. */
export const STREAK_MILESTONES = [3, 7, 14, 21, 30, 50, 100];

type Counters = Pick<
  AppSettings,
  | 'statsFocusMinutesToday'
  | 'statsBreaksCompletedToday'
  | 'statsBreaksSkippedToday'
  | 'statsBreaksSnoozedToday'
  | 'hydrationDrankToday'
  | 'hydrationGoal'
  | 'hydrationLastResetDate'
  | 'history'
>;

export const localDate = (date: Date): string => date.toLocaleDateString('en-CA');

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return localDate(new Date(y, m - 1, d + days));
}

/** Today's live counters as a day record. */
export function todayStats(s: Counters, today: string): DayStats {
  return {
    date: today,
    focusMinutes: s.statsFocusMinutesToday ?? 0,
    breaks: s.statsBreaksCompletedToday ?? 0,
    skipped: s.statsBreaksSkippedToday ?? 0,
    snoozed: s.statsBreaksSnoozedToday ?? 0,
    water: s.hydrationDrankToday ?? 0,
    waterGoal: s.hydrationGoal ?? 8,
  };
}

const isEmpty = (d: DayStats): boolean => !d.focusMinutes && !d.breaks && !d.skipped && !d.snoozed && !d.water;

/**
 * The settings patch for a new day, or null if today was already set up. Files the finished
 * day's counters into history (when anything happened that day) and zeroes today's.
 */
export function dailyReset(s: Counters, today: string): Partial<AppSettings> | null {
  if (s.hydrationLastResetDate === today) return null;
  const history = (Array.isArray(s.history) ? s.history : []).filter((d) => d && typeof d.date === 'string');
  const finished = s.hydrationLastResetDate ? todayStats(s, s.hydrationLastResetDate) : null;
  const kept = finished && !isEmpty(finished) ? [...history.filter((d) => d.date !== finished.date), finished] : history;
  const oldest = shiftDate(today, -HISTORY_DAYS);
  return {
    history: kept.filter((d) => d.date >= oldest && d.date < today).sort((a, b) => a.date.localeCompare(b.date)),
    hydrationDrankToday: 0,
    statsFocusMinutesToday: 0,
    statsBreaksCompletedToday: 0,
    statsBreaksSkippedToday: 0,
    statsBreaksSnoozedToday: 0,
    hydrationLastResetDate: today,
  };
}

/** Every day from `days - 1` days ago through today, oldest first; today comes from the live counters. */
export function recentDays(s: Counters, today: string, days = 7): DayStats[] {
  const byDate = new Map((s.history ?? []).map((d) => [d.date, d]));
  return Array.from({ length: days }, (_, i) => {
    const date = shiftDate(today, i - days + 1);
    if (date === today) return todayStats(s, today);
    return byDate.get(date) ?? { date, focusMinutes: 0, breaks: 0, skipped: 0, snoozed: 0, water: 0, waterGoal: s.hydrationGoal ?? 8 };
  });
}

const worked = (d: DayStats): boolean => d.focusMinutes >= WORKED_DAY_MINUTES || d.breaks > 0;

/**
 * Break streaks: working days in a row on which you finished at least one break. Days off
 * (no entry, or barely any focus) are skipped, so weekends don't break it. Today only adds to
 * the streak once you've taken a break, and never breaks it while the day is still going.
 */
export function breakStreak(s: Counters, today: string): { current: number; best: number } {
  const past = [...(s.history ?? [])].filter((d) => d.date < today).sort((a, b) => a.date.localeCompare(b.date));
  const now = todayStats(s, today);
  let best = 0;
  let run = 0;
  for (const day of past) {
    if (!worked(day)) continue;
    run = day.breaks > 0 ? run + 1 : 0;
    best = Math.max(best, run);
  }
  const current = now.breaks > 0 ? run + 1 : run;
  return { current, best: Math.max(best, current) };
}

/** Totals for a set of days. */
export function totals(days: DayStats[]): { focusMinutes: number; breaks: number; waterGoalDays: number; activeDays: number } {
  return {
    focusMinutes: days.reduce((sum, d) => sum + d.focusMinutes, 0),
    breaks: days.reduce((sum, d) => sum + d.breaks, 0),
    waterGoalDays: days.filter((d) => d.waterGoal > 0 && d.water >= d.waterGoal).length,
    activeDays: days.filter(worked).length,
  };
}
