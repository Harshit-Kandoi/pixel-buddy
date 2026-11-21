import React, { useState } from 'react';
import { AppSettings } from '../../../utils/types';
import { breakStreak, localDate, recentDays, totals, type DayStats } from '../../../utils/history';

// The Dashboard's week: focus minutes for the last 7 days as one bar each (today on the right),
// the break streak, and the week's totals. Hovering or focusing a bar shows that day's details.

const hm = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
};

const dayName = (date: string, style: 'short' | 'narrow'): string => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: style });
};

const describe = (d: DayStats, isToday: boolean): string => {
  const [y, m, dd] = d.date.split('-').map(Number);
  const when = isToday ? 'Today' : new Date(y, m - 1, dd).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  if (!d.focusMinutes && !d.breaks && !d.water) return `${when} · nothing tracked`;
  return `${when} · ${hm(d.focusMinutes)} focus · ${d.breaks} break${d.breaks === 1 ? '' : 's'} · 💧 ${d.water}/${d.waterGoal}`;
};

export const WeekCard: React.FC<{ settings: AppSettings }> = ({ settings }) => {
  const [active, setActive] = useState<number | null>(null);
  const today = localDate(new Date());
  const week = recentDays(settings, today, 7);
  const sum = totals(week);
  const streak = breakStreak(settings, today);
  const max = Math.max(60, ...week.map((d) => d.focusMinutes)); // at least an hour tall, so a short day looks short

  return (
    <div className="dashboard-stats-card week-card">
      <div className="week-header">
        <div className="stat-card-title">This week · focus</div>
        <span
          className={`streak-pill ${streak.current ? '' : 'none'}`}
          title={`Working days in a row with at least one finished break. Days off don't count against you.${streak.best ? ` Best: ${streak.best} day${streak.best === 1 ? '' : 's'}.` : ''}`}
        >
          {streak.current ? `🔥 ${streak.current}-day streak` : 'Take a break to start a streak'}
        </span>
      </div>

      <div className="week-detail" aria-live="polite">
        {active === null ? `${hm(sum.focusMinutes)} focus · ${sum.breaks} break${sum.breaks === 1 ? '' : 's'} · water goal ${sum.waterGoalDays}/7 days` : describe(week[active], active === 6)}
      </div>

      <div className="week-bars" role="list" aria-label="Focus time for the last 7 days" onMouseLeave={() => setActive(null)}>
        {week.map((d, i) => (
          <button
            key={d.date}
            type="button"
            role="listitem"
            className={`week-day non-draggable ${i === 6 ? 'today' : ''} ${active === i ? 'active' : ''}`}
            aria-label={describe(d, i === 6)}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
          >
            <span className="week-bar-track">
              {d.focusMinutes > 0 && <span className="week-bar" style={{ height: `${Math.max(4, Math.round((d.focusMinutes / max) * 100))}%` }} />}
            </span>
            <span className="week-label">{i === 6 ? 'Today' : dayName(d.date, 'narrow')}</span>
          </button>
        ))}
      </div>

      {streak.best > streak.current && <div className="week-best">Best streak: {streak.best} days</div>}
    </div>
  );
};
