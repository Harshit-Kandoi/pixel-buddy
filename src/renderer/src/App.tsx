import React, { useState, useEffect, useRef } from 'react';
import { Buddy } from './components/Buddy';
import { SpeechBubble } from './components/SpeechBubble';
import { Timer } from './components/Timer';
import { Settings } from './components/Settings';
import { AppSettings, StateMachineData } from '../../utils/types';
import { getRandomTip } from '../../utils/quotes';
import { playChime, playWorriedBeep } from '../../utils/sounds';

function App(): React.JSX.Element {
  const [stateData, setStateData] = useState<StateMachineData | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [showSettings, setShowSettings] = useState(true);
  const [currentTip, setCurrentTip] = useState('');
  
  // Interactive click & dismiss elements
  const [clickedDialogue, setClickedDialogue] = useState<string | null>(null);
  const [clickAnimClass, setClickAnimClass] = useState<string>('');
  const [isDismissed, setIsDismissed] = useState(false);

  // Drag and click tracking refs
  const dragThreshold = 5;
  const dragStartPos = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);

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

  // Auto-reset dismissal if settings are opened
  useEffect(() => {
    if (showSettings) {
      setIsDismissed(false);
    }
  }, [showSettings]);

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
            const audio = new Audio(`buddy-media://${customSoundPath}`);
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

  // Auto-reshow if state transitions to POPUP (when work session ends)
  useEffect(() => {
    if (stateData) {
      if (stateData.state === 'POPUP' && lastStateRef.current !== 'POPUP') {
        setIsDismissed(false); // auto reshow break reminder
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

  // Handle dynamic window resizing based on settings and state (quadrant-resizing friendly)
  useEffect(() => {
    if (showSettings) {
      window.api.resize(340, 420);
    } else if (stateData && settings && !isDismissed) {
      const isAlwaysVisible = settings.alwaysVisible ?? true;

      switch (stateData.state) {
        case 'POPUP':
          window.api.resize(340, 320);
          break;
        case 'BREAK':
          window.api.resize(340, 340);
          break;
        case 'IDLE':
          window.api.resize(340, 260);
          break;
        case 'WORKING':
        case 'SNOOZE':
          if (isAlwaysVisible) {
            if (clickedDialogue) {
              window.api.resize(340, 260); // dialog bubble height
            } else {
              window.api.resize(160, 160); // compact buddy size
            }
          } else {
            window.api.resize(1, 1);
          }
          break;
        default:
          window.api.resize(1, 1);
          break;
      }
    }
  }, [stateData, showSettings, settings, clickedDialogue, isDismissed]);

  // Interactivity handlers to prevent click-through on UI parts
  const handleMouseEnter = () => {
    window.api.setIgnoreMouseEvents(false);
  };

  const handleMouseLeave = () => {
    window.api.setIgnoreMouseEvents(true);
  };

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
    dragStartPos.current = { x: e.screenX, y: e.screenY };
    isDragging.current = false;

    window.api.dragStart();

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.screenX - dragStartPos.current.x;
      const dy = moveEvent.screenY - dragStartPos.current.y;
      
      if (Math.hypot(dx, dy) > dragThreshold) {
        isDragging.current = true;
      }
      
      window.api.dragMove();
    };

    const handleMouseUp = () => {
      window.api.dragEnd();
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      if (!isDragging.current) {
        handleBuddyClick();
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleBuddyClick = () => {
    const soundEnabled = settings?.sound ?? true;
    playChime(soundEnabled);

    const INTERACTIVE_QUOTES = [
      "You're doing great! Keep going!",
      "Make sure to sit straight. No shrimp posture!",
      "A bug in the code? We'll squash it together!",
      "Did you know? Code written after midnight has +50% bugs.",
      "Remember to breathe! *Inhale*... *Exhale*...",
      "Is that TypeScript compiling? Beautiful.",
      "How's the coffee? Don't forget water too!",
      "You're writing some fine code today!",
      "Let's make this app the best it can be!",
      "Need a quick stretch? I'm always ready for a break!"
    ];

    const randomQuote = INTERACTIVE_QUOTES[Math.floor(Math.random() * INTERACTIVE_QUOTES.length)];
    setClickedDialogue(randomQuote);

    // Play a random click animation
    const anim = Math.random() > 0.5 ? 'buddy-jump' : 'buddy-spin';
    setClickAnimClass(anim);

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

  // Sync mouse ignore state: full interactivity in Settings/expanded dialogs, click-through otherwise
  useEffect(() => {
    if (showSettings) {
      window.api.setIgnoreMouseEvents(false);
    } else {
      window.api.setIgnoreMouseEvents(true);
    }
  }, [showSettings]);

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
    clickedDialogue !== null;

  return (
    <div className="app-container">
      {showSettings ? (
        <Settings 
          settings={settings} 
          onSave={handleSaveSettings} 
          onClose={() => setShowSettings(false)} 
        />
      ) : (
        <>
          {/* Close display button (hides window, runs in tray) */}
          {(stateData.state !== 'BREAK' && 
            (stateData.state !== 'WORKING' && stateData.state !== 'SNOOZE' || clickedDialogue)) && (
            <div 
              className="display-close non-draggable"
              onClick={() => setIsDismissed(true)}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              title="Close Display"
            >
              ✕
            </div>
          )}

          {/* Settings Trigger Icon (hidden in compact work mode to prevent overlap) */}
          {(stateData.state !== 'BREAK' && 
            (stateData.state !== 'WORKING' && stateData.state !== 'SNOOZE' || clickedDialogue)) && (
            <div 
              className="settings-trigger non-draggable"
              onClick={() => setShowSettings(true)}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              title="Open Settings"
            >
              ⚙
            </div>
          )}

          {/* Speech dialogue bubble */}
          {showSpeechBubble && (
            <SpeechBubble 
              state={stateData.state} 
              skipsCount={stateData.skipsCount} 
              workDuration={settings.workDuration}
              tip={currentTip}
              customDialogue={clickedDialogue}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              onMouseDown={handleMouseDown}
            >
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

              {/* Break countdown timer */}
              {stateData.state === 'BREAK' && !clickedDialogue && (
                <Timer 
                  secondsLeft={stateData.breakSecondsLeft} 
                  subtext="early activity resets timer" 
                />
              )}
            </SpeechBubble>
          )}

          {/* Floating cute companion */}
          <Buddy 
            state={stateData.state} 
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            customVideoPath={settings.customVideoPath}
            keyingMode={settings.keyingMode}
            debugKeyer={settings.debugKeyer}
            clickAnimClass={clickAnimClass}
            onMouseDown={handleMouseDown}
            onFileDrop={handleFileDrop}
          />
        </>
      )}
    </div>
  );
}

export default App;
