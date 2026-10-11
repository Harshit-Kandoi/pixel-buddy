import React, { useState, useEffect, useRef } from 'react';
import { Buddy } from './components/Buddy';
import { SpeechBubble } from './components/SpeechBubble';
import { Timer } from './components/Timer';
import { Settings } from './components/Settings';
import { WidgetPanel } from './components/WidgetPanel';
import { AppSettings, StateMachineData } from '../../utils/types';
import { getRandomTip, getRandomBuddyLine } from '../../utils/quotes';
import { playChime, playWorriedBeep } from '../../utils/sounds';
import { toMediaUrl } from '../../utils/mediaUrl';

const COMPANION_WIDTH = 400;
const COMPANION_HEIGHT = 350;
const HIT_SELECTOR = '.buddy-container, .speech-bubble, .widget-panel, .side-controls, .settings-trigger, .display-close';

function App(): React.JSX.Element {
  const [stateData, setStateData] = useState<StateMachineData | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const showHydrationReminder = !!stateData?.hydrationReminderActive && stateData.state !== 'POPUP' && stateData.state !== 'BREAK';
  const [showSettings, setShowSettings] = useState(true);
  const [showWidgets, setShowWidgets] = useState(false);
  const [widgetsClosing, setWidgetsClosing] = useState(false);
  const [currentTip, setCurrentTip] = useState('');
  
  // Interactive click & dismiss elements
  const [clickedDialogue, setClickedDialogue] = useState<string | null>(null);
  const [clickAnimClass, setClickAnimClass] = useState<string>('');
  const [isDismissed, setIsDismissed] = useState(false);

  // Drag and click tracking refs
  const dragThreshold = 5;
  const dragStartPos = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const isDragActive = useRef(false); // tracks if we are actively dragging (for mouse event restore)
  const endPress = useRef<(() => void) | null>(null); // tears down the press currently being tracked

  // Keep track of the last state to auto-reshow on break popups
  const lastStateRef = useRef<string>('');

  // Auto-dismiss click dialogue after 4 seconds
  useEffect(() => {
    if (clickedDialogue) {
      const timer = setTimeout(() => {
        setClickedDialogue(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [clickedDialogue]);

  useEffect(() => {
    if (showHydrationReminder) setIsDismissed(false);
  }, [showHydrationReminder]);

  // Auto-reset dismissal if settings are opened
  useEffect(() => {
    if (showSettings) {
      setIsDismissed(false);
    }
  }, [showSettings]);

  // Sync settings panel visibility to main process for hit-testing
  useEffect(() => {
    window.api.setSettingsVisible(showSettings);
  }, [showSettings]);

  // Report the on-screen rects of visible UI to the main process; everything else in the
  // (fixed-size, transparent) window stays click-through.
  useEffect(() => {
    let last = '';
    const report = () => {
      const rects = Array.from(document.querySelectorAll<HTMLElement>(HIT_SELECTOR)).map((el) => {
        const r = el.getBoundingClientRect();
        return { x: Math.floor(r.left) - 4, y: Math.floor(r.top) - 4, width: Math.ceil(r.width) + 8, height: Math.ceil(r.height) + 8 };
      });
      const key = JSON.stringify(rects);
      if (key !== last) {
        last = key;
        window.api.setHitRects(rects);
      }
    };
    const id = setInterval(report, 100);
    return () => clearInterval(id);
  }, []);

  // Keep refs of latest settings and stateData to prevent stale closures in event listeners
  const settingsRef = useRef<AppSettings | null>(null);
  const stateDataRef = useRef<StateMachineData | null>(null);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    stateDataRef.current = stateData;
  }, [stateData]);

  // Load initial settings and state on mount
  useEffect(() => {
    window.api.getSettings().then((s) => setSettings(s));
    window.api.getState().then((state) => setStateData(state));

    // Listen to scheduler updates
    const unsubscribeUpdate = window.api.onUpdate((data) => {
      // Play chime or warning sound on popup transition
      const previousState = stateDataRef.current?.state;
      if (data.state === 'POPUP' && previousState !== 'POPUP') {
        const soundEnabled = settingsRef.current?.sound ?? true;
        if (soundEnabled) {
          const customSoundPath = settingsRef.current?.customSoundPath;
          if (customSoundPath) {
            const audio = new Audio(toMediaUrl(customSoundPath));
            audio.play().catch((err) => console.error('Failed to play custom sound:', err));
          } else {
            if (data.skipsCount >= 3) {
              playWorriedBeep(soundEnabled);
            } else {
              playChime(soundEnabled);
            }
          }
        }
      }
      stateDataRef.current = data;
      setStateData(data);
    });

    const unsubscribeTick = window.api.onTick((data) => {
      setStateData(data);
    });

    const unsubscribeSettings = window.api.onSettingsUpdated((newSettings) => {
      setSettings(newSettings);
    });

    const unsubscribeShowSettings = window.api.onShowSettings(() => {
      setShowSettings(true);
    });

    return () => {
      unsubscribeUpdate();
      unsubscribeTick();
      unsubscribeSettings();
      unsubscribeShowSettings();
    };
  }, []);

  // Auto-reshow if state transitions to POPUP or BREAK
  useEffect(() => {
    if (stateData) {
      if (
        (stateData.state === 'POPUP' && lastStateRef.current !== 'POPUP') ||
        (stateData.state === 'BREAK' && lastStateRef.current !== 'BREAK')
      ) {
        setIsDismissed(false);    // auto reshow break reminder or break screen
        setClickedDialogue(null); // clear any click dialogue so action buttons show
      }
      lastStateRef.current = stateData.state;
    }
  }, [stateData]);

  // Sync UI Color Theme Hue (CSS variable)
  useEffect(() => {
    if (settings) {
      const hue = settings.themeHue ?? 263;
      document.documentElement.style.setProperty('--theme-hue', hue.toString());
    }
  }, [settings]);

  // Handle tip rotation during break
  useEffect(() => {
    if (stateData?.state === 'BREAK') {
      setCurrentTip(getRandomTip());
      const tipInterval = setInterval(() => {
        setCurrentTip(getRandomTip());
      }, 15000); // change tip every 15 seconds
      return () => clearInterval(tipInterval);
    }
    return undefined;
  }, [stateData?.state]);

  // Calculate window visibility based on states, settings, and manual dismissals
  const isWindowVisible = 
    !isDismissed && (
      showSettings || 
      showHydrationReminder ||
      clickedDialogue !== null ||
      stateData?.state === 'POPUP' || 
      stateData?.state === 'BREAK' || 
      stateData?.state === 'IDLE' ||
      (settings?.alwaysVisible && (stateData?.state === 'WORKING' || stateData?.state === 'SNOOZE'))
    );

  // Sync Electron BrowserWindow visibility
  useEffect(() => {
    if (isWindowVisible) {
      window.api.showWindow();
    } else {
      window.api.hideWindow();
    }
  }, [isWindowVisible]);

  // The companion window keeps one fixed size so bubbles and panels never trigger a
  // window resize (which flickers on Windows); only opening settings resizes it.
  useEffect(() => {
    if (showSettings) {
      window.api.resize(400, 560);
    } else {
      window.api.resize(COMPANION_WIDTH, COMPANION_HEIGHT);
    }
  }, [showSettings]);

  const handleSaveSettings = (newSettings: Partial<AppSettings>) => {
    window.api.saveSettings(newSettings);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Prevent dragging when clicking interactive buttons, inputs, dropdowns or sliders
    const target = e.target as HTMLElement;
    if (
      target.closest('button') || 
      target.closest('input') || 
      target.closest('select') || 
      target.closest('.settings-trigger') || 
      target.closest('.display-close')
    ) {
      return;
    }

    if (e.button !== 0) return; // Only left-click drags
    endPress.current?.(); // a previous press never saw its mouseup — close it out first
    dragStartPos.current = { x: e.screenX, y: e.screenY };
    isDragging.current = false;
    isDragActive.current = true;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.screenX - dragStartPos.current.x;
      const dy = moveEvent.screenY - dragStartPos.current.y;
      if (Math.hypot(dx, dy) > dragThreshold) {
        if (!isDragging.current) {
          isDragging.current = true;
          window.api.dragStart(); // main process takes over polling and sets ignore mouse events to false
        }
      }
      // NOTE: NO dragMove() IPC call here — main process polls cursor directly
    };

    const finish = (allowClick: boolean) => {
      if (!isDragActive.current) return;
      isDragActive.current = false;
      endPress.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('blur', handleBlur);
      if (isDragging.current) {
        window.api.dragEnd(); // main process stops polling, saves position, re-enables click-through
      } else if (allowClick) {
        handleBuddyClick();
      }
    };
    const handleMouseUp = () => finish(true);
    const handleBlur = () => finish(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('blur', handleBlur);
    endPress.current = () => finish(false);
  };

  const toggleWidgets = () => {
    if (!showWidgets) {
      setShowWidgets(true);
      return;
    }
    if (widgetsClosing) return;
    // Let the slide-out animation play before unmounting and shrinking the window
    setWidgetsClosing(true);
    setTimeout(() => {
      setShowWidgets(false);
      setWidgetsClosing(false);
    }, 240);
  };

  const handleBuddyClick = () => {
    // During POPUP state: don't replace the break notification — just play a small chime
    // and show a relevant nudge, keeping action buttons visible
    if (stateDataRef.current?.state === 'POPUP') {
      const soundEnabled = settingsRef.current?.sound ?? true;
      playChime(soundEnabled);
      // Only animate, don't override the speech bubble content (action buttons must stay)
      setClickAnimClass('buddy-jump');
      setTimeout(() => setClickAnimClass(''), 600);
      return;
    }

    const soundEnabled = settingsRef.current?.sound ?? true;
    playChime(soundEnabled);

    const randomQuote = getRandomBuddyLine();
    setClickedDialogue(randomQuote);

    // Only use buddy-jump on click — never buddy-spin (which rotates GIFs)
    setClickAnimClass('buddy-jump');
    setTimeout(() => {
      setClickAnimClass('');
    }, 600);
  };

  const handleFileDrop = async (filePath: string) => {
    const copiedPath = await window.api.saveCustomMedia(filePath);
    if (copiedPath) {
      handleSaveSettings({ customVideoPath: copiedPath });
    }
  };

  if (!stateData || !settings) {
    return <div style={{ display: 'none' }} />;
  }

  if (!isWindowVisible) {
    return <div style={{ display: 'none' }} />;
  }

  // Determine if dialogue speech bubble should be shown
  const showSpeechBubble = 
    stateData.state === 'POPUP' || 
    stateData.state === 'BREAK' || 
    stateData.state === 'IDLE' || 
    showHydrationReminder ||
    clickedDialogue !== null;

  return (
    <div className="app-container">
      {showSettings ? (
        <Settings 
          settings={settings} 
          onSave={handleSaveSettings} 
          onClose={() => setShowSettings(false)}
          onHeaderMouseDown={handleMouseDown}
        />
      ) : (
        <>
          {/* Speech dialogue bubble */}
          {showSpeechBubble && (
            <SpeechBubble 
              state={stateData.state} 
              skipsCount={stateData.skipsCount} 
              workDuration={settings.workDuration}
              tip={currentTip}
              customDialogue={
                clickedDialogue || 
                (showHydrationReminder
                  ? `Hey ${settings.userName || 'there'}!\nTime for a water break! 💧\nStay hydrated to keep focused.` 
                  : null)
              }
              userName={settings.userName}
              onMouseDown={handleMouseDown}
            >
              {/* Hide + settings, pinned to the bubble's corner so they sit next to the buddy */}
              {stateData.state !== 'BREAK' && (
                <div className="bubble-controls non-draggable">
                  <button type="button" aria-label="Hide buddy"
                    className="display-close non-draggable"
                    onClick={() => setIsDismissed(true)}
                    title="Hide (keeps running in the tray)"
                  >
                    ✕
                  </button>
                  <button type="button" aria-label="Open settings"
                    className="settings-trigger non-draggable"
                    onClick={() => setShowSettings(true)}
                    title="Open Settings"
                  >
                    ⚙
                  </button>
                </div>
              )}
              {/* Conditional action buttons inside bubble (only when break reminder popup is active) */}
              {stateData.state === 'POPUP' && !clickedDialogue && (
                <div className="action-buttons non-draggable">
                  <button 
                    className="btn btn-primary" 
                    onClick={() => window.api.takeBreak()}
                  >
                    Take Break
                  </button>
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => window.api.snooze()}
                  >
                    Snooze
                  </button>
                  <button 
                    className="btn btn-danger" 
                    onClick={() => window.api.skip()}
                  >
                    Skip
                  </button>
                </div>
              )}

              {/* Hydration action buttons inside bubble (only when water reminder is active) */}
              {showHydrationReminder && !clickedDialogue && (
                <div className="action-buttons non-draggable">
                  <button 
                    className="btn btn-primary" 
                    onClick={() => window.api.logHydration()}
                  >
                    Drank Water 💧
                  </button>
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => window.api.snoozeHydration()}
                  >
                    Snooze 10m
                  </button>
                  <button 
                    className="btn btn-danger" 
                    onClick={() => window.api.dismissHydration()}
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* Break countdown timer */}
              {stateData.state === 'BREAK' && !clickedDialogue && (
                <Timer 
                  secondsLeft={stateData.breakSecondsLeft} 
                  subtext={settings.smartMonitoringEnabled ? 'Activity resumes your focus timer' : 'Take a moment just for you'}
                />
              )}
            </SpeechBubble>
          )}

          {/* Row container for widgets and companion buddy */}
          <div className="buddy-row" style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', position: 'relative' }}>
            {/* Compact-mode controls: settings gear + widgets toggle */}
            {(stateData.state === 'WORKING' || stateData.state === 'SNOOZE') && !clickedDialogue && !showHydrationReminder && (
              <div className="side-controls">
                <button type="button" aria-label="Open settings"
                  className="side-btn side-settings non-draggable"
                  onClick={() => setShowSettings(true)}
                  title="Open Settings"
                >
                  ⚙
                </button>
                <button type="button" aria-label="Toggle timer and water widgets"
                  className={`side-btn widgets-toggle non-draggable ${showWidgets && !widgetsClosing ? 'active' : ''}`}
                  onClick={toggleWidgets}
                  title={showWidgets ? "Hide Widgets" : "Show Widgets"}
                >
                  <span className="chevron">◀</span>
                </button>
              </div>
            )}

            {showWidgets && (stateData.state === 'WORKING' || stateData.state === 'SNOOZE') && !clickedDialogue && !showHydrationReminder && (
              <WidgetPanel 
                closing={widgetsClosing}
                stateData={stateData}
                settings={settings}
                onSaveSettings={handleSaveSettings}
              />
            )}

            {/* Floating cute companion */}
            <Buddy 
              state={stateData.state} 
              customVideoPath={settings.customVideoPath}
              keyingMode={settings.keyingMode}
              debugKeyer={settings.debugKeyer}
              clickAnimClass={clickAnimClass}
              onMouseDown={handleMouseDown}
              onFileDrop={handleFileDrop}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default App;
