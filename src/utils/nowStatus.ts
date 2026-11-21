import type { AppSettings, StateMachineData } from './types';

// The status line at the top of Settings: what the timers are doing right now.

/** 4:05, or 1:02:05 past an hour. */
export const clock = (seconds: number): string => {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toString().padStart(2, '0');
  return h ? `${h}:${m.toString().padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

export function nowStatus(data: StateMachineData, settings: AppSettings): { icon: string; label: string; time: string; progress: number } {
  const work = settings.workDuration * 60;
  const workLeft = work - data.activeWorkSeconds;
  if (data.isPaused) return { icon: '⏸', label: 'Reminders paused', time: '', progress: Math.min(1, data.activeWorkSeconds / work) };
  switch (data.state) {
    case 'POPUP':
      return { icon: '🔔', label: 'Time for a break', time: '', progress: 1 };
    case 'BREAK': {
      const total = settings.breakDuration * 60;
      return { icon: '🌿', label: 'On a break', time: `${clock(data.breakSecondsLeft)} left`, progress: Math.min(1, Math.max(0, 1 - data.breakSecondsLeft / total)) };
    }
    case 'SNOOZE':
      return { icon: '💤', label: 'Snoozed · reminder in', time: clock(data.snoozeSecondsLeft), progress: 1 };
    case 'IDLE':
      return { icon: '🌙', label: 'Away · focus timer paused', time: '', progress: Math.min(1, data.activeWorkSeconds / work) };
    default:
      if (data.skipSecondsLeft > 0) return { icon: '⏳', label: 'Skipped · asking again in', time: clock(data.skipSecondsLeft), progress: 1 };
      if (data.inMeeting && workLeft <= 0) return { icon: '🎧', label: 'On a call · break after it', time: '', progress: 1 };
      return { icon: data.inMeeting ? '🎧' : '⏳', label: data.inMeeting ? 'On a call · next break in' : 'Next break in', time: clock(workLeft), progress: Math.min(1, data.activeWorkSeconds / work) };
  }
}
