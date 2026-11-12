import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Buddy } from './components/Buddy';
import { SpeechBubble } from './components/SpeechBubble';
import { Timer } from './components/Timer';
import { Settings } from './components/Settings';
import { WidgetPanel } from './components/WidgetPanel';
import { AppSettings, BuddyAnchor, StateMachineData } from '../../utils/types';
import { BREAK_TIPS, getRandomBuddyLine, FESTIVE_LINES } from '../../utils/quotes';
import { CLAIM_BREAKS, claimStatus, resolveAvatarSkin } from '../../utils/seasons';
import { avatarSrc } from './avatars';
import { isImageFile } from '../../utils/mediaFormats';
import { routineForBreak, stepAt } from '../../utils/breakRoutines';
import { CHROME_REVIEW_URL, EDGE_ADDONS_URL, GITHUB_URL } from '../../utils/links';
import { HAPPY_FOR_MS, TIRED_LINES, buddyMood, finishedBreak } from '../../utils/mood';

const IN_EXTENSION = location.protocol === 'chrome-extension:';
// Battery: after this long with nothing happening the buddy rests (no endless float, festival
// outfits hold still). Reminders, breaks, clicks, hovering and settings wake it. While resting
// it still gives one gentle bob now and then, so it doesn't look frozen.
const REST_AFTER_MS = 20000;
const BOB_EVERY_MS = 45000;
const BOB_MS = 2400;
// Festival outfits (flame, twinkles, confetti) redraw the whole picture every frame while they
// animate, about 3× the CPU of the float alone. They play for a few seconds whenever the buddy
// wakes, then hold still while it keeps floating.
const FESTIVE_ANIMATION_MS = 6000;
const IS_EDGE = /\bEdg\//.test(navigator.userAgent);
// Where "Rate" goes: the store this copy most likely came from (Edge users can install from the
// Chrome Web Store until the Edge listing exists); the desktop app asks for a GitHub star instead.
const STORE_REVIEW_URL = !IN_EXTENSION ? '' : IS_EDGE && EDGE_ADDONS_URL ? EDGE_ADDONS_URL : CHROME_REVIEW_URL;
import { playChime, playWorriedBeep } from '../../utils/sounds';
import { toMediaUrl } from '../../utils/mediaUrl';

const COMPANION_WIDTH = 400;
const COMPANION_HEIGHT = 350;
const HIT_SELECTOR = '.buddy-container, .speech-bubble, .widget-panel, .side-controls, .settings-trigger, .display-close';

// Measures the buddy, and where it would sit with the layout mirrored. The mirrored layout
// is symmetric (see html.buddy-left / html.buddy-top in index.css): the buddy row reflects
// within the container, and the buddy reflects within the row horizontally but keeps its
// bottom alignment in it. Computed rather than measured, since toggling the classes would
// restart the bubble and widget animations.
function measureBuddy(): BuddyAnchor | null {
  const container = document.querySelector('.app-container')?.getBoundingClientRect();
  const row = document.querySelector('.buddy-row')?.getBoundingClientRect();
  const buddy = document.querySelector('.buddy-container')?.getBoundingClientRect();
  if (!container || !row || !buddy) return null;
  return {
    left: buddy.left,
    top: buddy.top,
    width: buddy.width,
    height: buddy.height,
    mirroredLeft: container.left + container.right - buddy.right,
    mirroredTop: container.top + container.bottom - row.bottom + (buddy.top - row.top),
  };
}

// The Chrome extension mounts one App per tab, so it starts with settings closed.
function App({ initialShowSettings = true }: { initialShowSettings?: boolean }): React.JSX.Element {
  const [stateData, setStateData] = useState<StateMachineData | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const showHydrationReminder = !!stateData?.hydrationReminderActive && stateData.state !== 'POPUP' && stateData.state !== 'BREAK';
  const [showSettings, setShowSettings] = useState(initialShowSettings);
  const [showWidgets, setShowWidgets] = useState(false);
  const [widgetsClosing, setWidgetsClosing] = useState(false);
  
  // Interactive click & dismiss elements
  const [clickedDialogue, setClickedDialogue] = useState<string | null>(null);
  const [clickAnimClass, setClickAnimClass] = useState<string>('');
  const [isDismissed, setIsDismissed] = useState(false);
  const [claimLaterAt, setClaimLaterAt] = useState(-1); // "Later" on the claim prompt waits for the next break
  const lastFestivalBreaks = useRef<number | null>(null);
  const [onBattery, setOnBattery] = useState(false);
  const [batteryTipDismissed, setBatteryTipDismissed] = useState(false);
  const [resting, setResting] = useState(false);
  const [bobbing, setBobbing] = useState(false);
  const lastLivelyRef = useRef(0); // set by the wake effect on mount
  const [festiveAnimating, setFestiveAnimating] = useState(true);
  const festiveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [happy, setHappy] = useState(false); // a minute of good mood after a finished break
  const happyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

  // Opening settings always shows the buddy again, even if it was hidden.
  const openSettings = useCallback((): void => {
    setShowSettings(true);
    setIsDismissed(false);
  }, []);

  // Sync settings panel visibility to main process for hit-testing
  useEffect(() => {
    window.api.setSettingsVisible(showSettings);
  }, [showSettings]);

  // Report the on-screen rects of visible UI to the main process; everything else in the
  // (fixed-size, transparent) window stays click-through.
  useEffect(() => {
    let last = '';
    const report = (): void => {
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
    // A water reminder that appears also shows the buddy again, even if it was hidden.
    const showsWater = (d: StateMachineData | null): boolean =>
      !!d?.hydrationReminderActive && d.state !== 'POPUP' && d.state !== 'BREAK';
    const receive = (data: StateMachineData): void => {
      if (showsWater(data) && !showsWater(stateDataRef.current)) setIsDismissed(false);
      if (finishedBreak(stateDataRef.current, data)) {
        setHappy(true);
        clearTimeout(happyTimerRef.current);
        happyTimerRef.current = setTimeout(() => setHappy(false), HAPPY_FOR_MS);
      }
      stateDataRef.current = data;
      setStateData(data);
    };

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
      receive(data);
    });

    const unsubscribeTick = window.api.onTick(receive);

    const unsubscribeSettings = window.api.onSettingsUpdated((newSettings) => {
      setSettings(newSettings);
    });

    const unsubscribeShowSettings = window.api.onShowSettings(openSettings);

    return () => {
      clearTimeout(happyTimerRef.current);
      unsubscribeUpdate();
      unsubscribeTick();
      unsubscribeSettings();
      unsubscribeShowSettings();
    };
  }, [openSettings]); // stable (useCallback with no dependencies), so this still runs once

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

  // Each break during a festival brings you closer to keeping its buddy: say so.
  useEffect(() => {
    if (!settings) return;
    const status = claimStatus(settings);
    if (!status || status.claimed) {
      lastFestivalBreaks.current = null;
      return;
    }
    const previous = lastFestivalBreaks.current;
    lastFestivalBreaks.current = status.breaks;
    if (previous !== null && status.breaks > previous && !status.earned) {
      const { name, emoji } = status.festival.festival;
      const until = status.festival.lastDay.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      const left = CLAIM_BREAKS - status.breaks;
      setClickedDialogue(`${status.breaks}/${CLAIM_BREAKS} breaks toward the ${name} buddy ${emoji}\n${left} more by ${until} and it's yours to keep!`);
    }
  }, [settings]);

  // Clicking the buddy, using settings, or typing in them during a break is using Pixel Buddy,
  // not coming back to work: tell the scheduler so it doesn't end the break.
  useEffect(() => {
    let last = 0;
    const report = (): void => {
      if (stateDataRef.current?.state !== 'BREAK' || Date.now() - last < 2000) return;
      last = Date.now();
      window.api.buddyInteraction();
    };
    const events = ['pointerdown', 'keydown', 'wheel'] as const;
    events.forEach((type) => window.addEventListener(type, report, { capture: true, passive: true }));
    // Reading settings without touching anything still counts.
    const whileOpen = showSettings ? setInterval(report, 5000) : null;
    if (showSettings) report();
    return () => {
      events.forEach((type) => window.removeEventListener(type, report, { capture: true }));
      if (whileOpen) clearInterval(whileOpen);
    };
  }, [showSettings]);

  // Battery power (desktop): a video avatar is the heaviest choice, so suggest a lighter one.
  useEffect(() => {
    window.api.isOnBattery().then(setOnBattery).catch(() => {});
    return window.api.onPowerChange((battery) => {
      setOnBattery(battery);
      if (!battery) setBatteryTipDismissed(false); // ask again next time it's unplugged
    });
  }, []);

  // Resting: wake on anything that matters, rest after REST_AFTER_MS of nothing happening.
  const wake = useCallback((): void => {
    lastLivelyRef.current = Date.now();
    setResting(false);
    setFestiveAnimating(true);
    clearTimeout(festiveTimerRef.current);
    festiveTimerRef.current = setTimeout(() => setFestiveAnimating(false), FESTIVE_ANIMATION_MS);
  }, []);
  useEffect(() => () => clearTimeout(festiveTimerRef.current), []);
  useEffect(() => {
    lastLivelyRef.current = Date.now();
    const id = setTimeout(wake, 0); // wake on the next tick, not mid-render
    return () => clearTimeout(id);
  }, [stateData?.state, stateData?.hydrationReminderActive, clickedDialogue, showSettings, showWidgets, isDismissed, wake]);
  useEffect(() => {
    let last = 0;
    // Only the buddy's own UI counts: on desktop the transparent window also gets mouse moves
    // while you work in the app underneath it, and those shouldn't keep the buddy awake.
    const onPointer = (e: PointerEvent): void => {
      if (!(e.target as Element | null)?.closest?.(HIT_SELECTOR + ', .settings-panel')) return;
      if (Date.now() - last < 500) return;
      last = Date.now();
      wake();
    };
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('pointerdown', onPointer, { passive: true });
    const check = setInterval(() => {
      const state = stateDataRef.current?.state;
      // Reminders and breaks stay lively; everything else may rest.
      if (state === 'POPUP' || state === 'BREAK') lastLivelyRef.current = Date.now();
      else if (Date.now() - lastLivelyRef.current > REST_AFTER_MS) setResting(true);
    }, 2000);
    return () => {
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerdown', onPointer);
      clearInterval(check);
    };
  }, [wake]);
  useEffect(() => {
    if (!resting) return;
    let stop: ReturnType<typeof setTimeout> | undefined;
    const bob = setInterval(() => {
      setBobbing(true);
      stop = setTimeout(() => setBobbing(false), BOB_MS);
    }, BOB_EVERY_MS);
    return () => {
      clearInterval(bob);
      clearTimeout(stop);
      setBobbing(false);
    };
  }, [resting]);

  // Sync UI Color Theme Hue (CSS variable)
  useEffect(() => {
    if (settings) {
      const hue = settings.themeHue ?? 263;
      document.documentElement.style.setProperty('--theme-hue', hue.toString());
    }
  }, [settings]);


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

  const handleSaveSettings = (newSettings: Partial<AppSettings>): void => {
    window.api.saveSettings(newSettings);
  };

  const handleMouseDown = (e: React.MouseEvent): void => {
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

    const handleMouseMove = (moveEvent: MouseEvent): void => {
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

    const finish = (allowClick: boolean): void => {
      if (!isDragActive.current) return;
      isDragActive.current = false;
      endPress.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('blur', handleBlur);
      if (isDragging.current) {
        window.api.dragEnd(measureBuddy()); // host stops the drag, picks a side, saves position, re-enables click-through
      } else if (allowClick) {
        handleBuddyClick();
      }
    };
    const handleMouseUp = (): void => finish(true);
    const handleBlur = (): void => finish(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('blur', handleBlur);
    endPress.current = () => finish(false);
  };

  const toggleWidgets = (): void => {
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

  const handleBuddyClick = (): void => {
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

    const skin = resolveAvatarSkin(settingsRef.current?.avatarSkin, new Date(), settingsRef.current?.claimedSkins);
    const tired = !!stateDataRef.current && buddyMood(stateDataRef.current, false) === 'tired';
    const randomQuote = tired
      ? TIRED_LINES[Math.floor(Math.random() * TIRED_LINES.length)]
      : getRandomBuddyLine(new Date(), skin === 'classic' ? [] : FESTIVE_LINES[skin]);
    setClickedDialogue(randomQuote);

    // Only use buddy-jump on click — never buddy-spin (which rotates GIFs)
    setClickAnimClass('buddy-jump');
    setTimeout(() => {
      setClickAnimClass('');
    }, 600);
  };

  const handleFileDrop = async (filePath: string): Promise<void> => {
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

  // The buddy leads a short routine through the first minute or so of each break, then a new
  // tip every 15 seconds (worked out from the time, so every tab shows the same one).
  const breakElapsed = settings.breakDuration * 60 - stateData.breakSecondsLeft;
  const breakStep = stateData.state === 'BREAK'
    ? stepAt(routineForBreak(settings.statsBreaksCompletedToday ?? 0), breakElapsed)
    : null;
  const breakTip = BREAK_TIPS[(Math.floor(breakElapsed / 15) + (settings.statsBreaksCompletedToday ?? 0) * 3) % BREAK_TIPS.length];

  // Festival buddies are limited-time: take enough breaks during the festival to claim one.
  const claim = claimStatus(settings);
  const showClaim =
    !!claim && claim.earned && !claim.claimed && claim.breaks > claimLaterAt &&
    stateData.state === 'WORKING' && !clickedDialogue && !showHydrationReminder;
  const claimBuddy = (): void => {
    if (!claim) return;
    const { skin, name } = claim.festival.festival;
    handleSaveSettings({ claimedSkins: [...(settings.claimedSkins ?? []), skin] });
    setClickedDialogue(`It's yours! 🎁\nWear the ${name} buddy any time from Settings.`);
  };

  const usingVideo = !!settings.customVideoPath && !isImageFile(settings.customVideoPath);
  const showBatteryTip =
    onBattery && usingVideo && !batteryTipDismissed &&
    stateData.state === 'WORKING' && !clickedDialogue && !showHydrationReminder && !showClaim;

  // Asked once, in a calm moment after a few completed breaks.
  const showReviewAsk =
    stateData.state === 'WORKING' && !clickedDialogue && !showHydrationReminder && !showClaim && !showBatteryTip &&
    settings.reviewAskAt >= 0 && (settings.lifetimeBreaksCompleted ?? 0) >= settings.reviewAskAt;
  const answerReviewAsk = (answer: 'yes' | 'later' | 'never'): void => {
    if (answer === 'yes') window.open(STORE_REVIEW_URL || GITHUB_URL, '_blank', 'noopener');
    handleSaveSettings({ reviewAskAt: answer === 'later' ? (settings.lifetimeBreaksCompleted ?? 0) + 10 : -1 });
  };

  // Determine if dialogue speech bubble should be shown
  const showSpeechBubble = 
    stateData.state === 'POPUP' || 
    stateData.state === 'BREAK' || 
    stateData.state === 'IDLE' || 
    showHydrationReminder ||
    showClaim ||
    showBatteryTip ||
    showReviewAsk ||
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
              tip={breakStep ? breakStep.step.text : breakTip}
              breakTitle={breakStep?.routine.title}
              customDialogue={
                clickedDialogue || 
                (showHydrationReminder
                  ? `Hey ${settings.userName || 'there'}!\nTime for a water break! 💧\nStay hydrated to keep focused.` 
                  : showBatteryTip
                    ? `On battery 🔋\nVideo avatars use the most energy. A picture, a GIF or the classic buddy lasts longer.`
                  : showClaim && claim
                    ? `You earned the ${claim.festival.festival.name} buddy! ${claim.festival.festival.emoji}\nClaim it to keep it, even after the festival.`
                    : showReviewAsk
                      ? `We've taken ${settings.lifetimeBreaksCompleted} breaks together! 🎉\n${STORE_REVIEW_URL ? 'A quick rating' : 'A GitHub star'} would really help me find new friends.`
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
                    onClick={openSettings}
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

              {showBatteryTip && (
                <div className="action-buttons non-draggable">
                  <button className="btn btn-primary" onClick={() => handleSaveSettings({ customVideoPath: null })}>
                    Use classic buddy
                  </button>
                  <button className="btn btn-secondary" onClick={() => setBatteryTipDismissed(true)}>
                    Keep video
                  </button>
                </div>
              )}

              {showClaim && claim && (
                <div className="action-buttons non-draggable">
                  <button className="btn btn-primary" onClick={claimBuddy}>
                    Claim it 🎁
                  </button>
                  <button className="btn btn-secondary" onClick={() => setClaimLaterAt(claim.breaks)}>
                    Later
                  </button>
                </div>
              )}

              {showReviewAsk && (
                <div className="action-buttons non-draggable">
                  <button className="btn btn-primary" onClick={() => answerReviewAsk('yes')}>
                    {STORE_REVIEW_URL ? 'Rate ⭐' : 'Star ⭐'}
                  </button>
                  <button className="btn btn-secondary" onClick={() => answerReviewAsk('later')}>
                    Later
                  </button>
                  <button className="btn btn-secondary" onClick={() => answerReviewAsk('never')}>
                    Never
                  </button>
                </div>
              )}

              {/* Guided routine progress */}
              {breakStep && !clickedDialogue && (
                <div className="routine-steps" aria-label={`Step ${breakStep.index + 1} of ${breakStep.routine.steps.length}`}>
                  {breakStep.routine.steps.map((_, i) => (
                    <span key={i} className={i < breakStep.index ? 'done' : i === breakStep.index ? 'active' : ''} />
                  ))}
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
                  onClick={openSettings}
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
              defaultSrc={avatarSrc(resolveAvatarSkin(settings.avatarSkin, new Date(), settings.claimedSkins), !festiveAnimating || (resting && !bobbing))}
              resting={resting}
              mood={buddyMood(stateData, happy)}
              keyingMode={settings.keyingMode}
              debugKeyer={settings.debugKeyer}
              clickAnimClass={clickAnimClass || (breakStep && !clickedDialogue ? `buddy-motion-${breakStep.step.motion}` : '') || (bobbing ? 'buddy-bob' : '')}
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
