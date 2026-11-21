import React from 'react';
import { AppSettings, StateMachineData } from '../../../utils/types';
import { clock, nowStatus } from '../../../utils/nowStatus';

// What the timers are doing right now, at the top of Settings, with the everyday actions. With
// "Always On Screen" off the buddy only shows up for reminders, so this (and the toolbar badge
// or tray menu) is where you see the countdown, pause, take a break or log a glass.

export const NowCard: React.FC<{ stateData: StateMachineData; settings: AppSettings }> = ({ stateData, settings }) => {
  const { icon, label, time, progress } = nowStatus(stateData, settings);
  const { state, isPaused, hydrationReminderActive } = stateData;
  const drank = settings.hydrationDrankToday ?? 0;
  const goal = settings.hydrationGoal ?? 8;

  return (
    <div className={`now-card ${isPaused ? 'paused' : ''} now-${state.toLowerCase()}`} aria-live="polite">
      <div className="now-line">
        <span className="now-icon" aria-hidden="true">{icon}</span>
        <span className="now-label">{label}</span>
        {time && <span className="now-time">{time}</span>}
      </div>
      <div className="now-progress"><div style={{ width: `${Math.round(progress * 100)}%` }} /></div>
      <div className="now-actions">
        {state === 'POPUP' && !isPaused ? (
          <>
            <button type="button" className="btn btn-primary btn-sm non-draggable" onClick={() => window.api.takeBreak()}>Take break</button>
            <button type="button" className="btn btn-secondary btn-sm non-draggable" onClick={() => window.api.snooze()}>Snooze</button>
          </>
        ) : state === 'BREAK' && !isPaused ? (
          <button type="button" className="btn btn-secondary btn-sm non-draggable" onClick={() => window.api.reset()} title="End the break and start a new focus session">
            Back to work
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-secondary btn-sm non-draggable" onClick={() => window.api.togglePause()} title="Pause or resume break and water reminders">
              {isPaused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm non-draggable" onClick={() => window.api.reset()} title="Start the focus timer over">
              ↺ Reset
            </button>
            {!isPaused && (
              <button type="button" className="btn btn-primary btn-sm non-draggable" onClick={() => window.api.takeBreak()} title="Take a break now">
                Break now
              </button>
            )}
          </>
        )}
        <button
          type="button"
          className={`btn btn-sm non-draggable now-water ${hydrationReminderActive ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => window.api.logHydration()}
          title={settings.hydrationEnabled ? `Log a glass · next water reminder in ${clock(stateData.hydrationSecondsLeft)}` : 'Log a glass'}
          aria-label={`Log a glass of water, ${drank} of ${goal} today`}
        >
          {hydrationReminderActive ? 'Drank 💧' : `💧 ${drank}/${goal} +`}
        </button>
      </div>
    </div>
  );
};
