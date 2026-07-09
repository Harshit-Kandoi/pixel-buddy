import React, { useState } from 'react';
import { AppSettings, StateMachineData } from '../../../utils/types';

interface WidgetPanelProps {
  stateData: StateMachineData;
  settings: AppSettings;
  onSaveSettings: (settings: Partial<AppSettings>) => void;
}

export const WidgetPanel: React.FC<WidgetPanelProps> = ({
  stateData,
  settings,
  onSaveSettings,
}) => {
  const [activeTab, setActiveTab] = useState<'timer' | 'water'>('timer');

  const { activeWorkSeconds, state, snoozeSecondsLeft, skipSecondsLeft } = stateData;
  const { workDuration, hydrationGoal, hydrationDrankToday, hydrationEnabled } = settings;

  // Timer Calculation
  const totalWorkSeconds = workDuration * 60;
  const progressPercent = Math.min(100, (activeWorkSeconds / totalWorkSeconds) * 100);

  // Time remaining string until next break
  const getRemainingTimeStr = () => {
    if (state === 'SNOOZE') {
      const mins = Math.floor(snoozeSecondsLeft / 60);
      const secs = snoozeSecondsLeft % 60;
      return `Snoozed: ${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    if (skipSecondsLeft > 0) {
      const mins = Math.floor(skipSecondsLeft / 60);
      const secs = skipSecondsLeft % 60;
      return `Skip: ${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    const leftSeconds = Math.max(0, totalWorkSeconds - activeWorkSeconds);
    const mins = Math.floor(leftSeconds / 60);
    const secs = leftSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getWaterRemainingTimeStr = () => {
    if (!hydrationEnabled) return 'Disabled';
    const leftSeconds = stateData.hydrationSecondsLeft;
    const mins = Math.floor(leftSeconds / 60);
    const secs = leftSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleWaterClick = (index: number) => {
    // If they click on a glass:
    // If the glass was previously unchecked, we set drank count to this glass index + 1
    // If they click on the last checked glass, we decrement by 1 (toggle)
    const clickedGlass = index + 1;
    let newCount = clickedGlass;
    if (clickedGlass === hydrationDrankToday) {
      newCount = clickedGlass - 1;
    }
    onSaveSettings({ hydrationDrankToday: newCount });
  };

  const incrementWater = () => {
    const newCount = Math.min(hydrationGoal, hydrationDrankToday + 1);
    onSaveSettings({ hydrationDrankToday: newCount });
  };

  const decrementWater = () => {
    const newCount = Math.max(0, hydrationDrankToday - 1);
    onSaveSettings({ hydrationDrankToday: newCount });
  };

  return (
    <div className="widget-panel non-draggable">
      {/* Tab headers */}
      <div className="widget-tabs">
        <button
          className={`widget-tab-btn ${activeTab === 'timer' ? 'active' : ''}`}
          onClick={() => setActiveTab('timer')}
        >
          ⏳ Timer
        </button>
        <button
          className={`widget-tab-btn ${activeTab === 'water' ? 'active' : ''}`}
          onClick={() => setActiveTab('water')}
        >
          💧 Water
        </button>
      </div>

      {/* Tab Content */}
      <div className="widget-content">
        {activeTab === 'timer' ? (
          <div className="widget-timer-tab">
            <div className="widget-section-title">Break Countdown</div>
            <div className="widget-countdown">{getRemainingTimeStr()}</div>
            
            <div className="widget-progress-container">
              <div 
                className="widget-progress-bar" 
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            
            <div className="widget-stats">
              <span>Focus: {Math.floor(activeWorkSeconds / 60)}m / {workDuration}m</span>
            </div>

            <div className="widget-controls">
              <button className="btn btn-secondary btn-sm" onClick={() => window.api.reset()} title="Reset Work Timer">
                Reset
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => window.api.takeBreak()} title="Force Break">
                Break
              </button>
            </div>
          </div>
        ) : (
          <div className="widget-water-tab">
            <div className="widget-section-title">Hydration Tracker</div>
            <div className="widget-water-ratio">
              <span className="current">{hydrationDrankToday}</span>
              <span className="separator">/</span>
              <span className="total">{hydrationGoal}</span>
              <span className="unit">glasses</span>
            </div>

            {/* Micro water glass icons grid */}
            <div className="widget-water-grid">
              {Array.from({ length: hydrationGoal }).map((_, i) => (
                <div
                  key={i}
                  className={`widget-water-cup ${i < hydrationDrankToday ? 'filled' : ''}`}
                  onClick={() => handleWaterClick(i)}
                  title={`Glass ${i + 1}`}
                >
                  💧
                </div>
              ))}
            </div>

            {hydrationEnabled && (
              <div className="widget-water-countdown">
                Next: {getWaterRemainingTimeStr()}
              </div>
            )}

            <div className="widget-controls water-controls">
              <button className="btn btn-secondary btn-sm cup-adjust" onClick={decrementWater} title="Remove 1 glass">
                -
              </button>
              <button className="btn btn-secondary btn-sm cup-adjust" onClick={incrementWater} title="Add 1 glass">
                +
              </button>
              {stateData.hydrationReminderActive && (
                <button className="btn btn-primary btn-sm" onClick={() => window.api.logHydration()} style={{ padding: '4px 6px' }}>
                  Log
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
