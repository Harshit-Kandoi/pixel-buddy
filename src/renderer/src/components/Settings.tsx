import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppSettings } from '../../../utils/types';
import { AWAY_MINUTE_CHOICES } from '../../../utils/constants';
import { notesAsText, removeNote, visibleNotes } from '../../../utils/notes';
import { toMediaUrl } from '../../../utils/mediaUrl';
import { AVATAR_SKINS } from '../avatars';
import { drawShareCard, downloadBlob } from '../shareCard';
import { FORMAT_GUIDE, SUPPORTED_FORMATS_TEXT, formatHint, isImageFile, mediaTypeLabel } from '../../../utils/mediaFormats';
import { backgroundAdvice, classifyBackground, type BackgroundKind } from '../../../utils/backgroundCheck';
import { CLAIM_BREAKS, FESTIVALS, claimStatus, upcomingFestivals, resolveAvatarSkin, type AvatarSkin, type FestivalSkin } from '../../../utils/seasons';

interface SettingsProps {
  settings: AppSettings;
  onSave: (settings: Partial<AppSettings>) => void;
  onClose: () => void;
  onHeaderMouseDown?: (e: React.MouseEvent) => void;
}

const IN_EXTENSION_PAGE = location.protocol === 'chrome-extension:';
// "3:10 pm" for today's notes, "11 Nov" for older ones.
function noteTime(at: number): string {
  const date = new Date(at);
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// What "Quiet during calls" can see differs by platform (see src/main/meetings.ts).
const CALL_DETECTION_HELP =
  IN_EXTENSION_PAGE
    ? 'Break and water reminders wait while a tab is on a call (Meet, Zoom, Teams, any camera or mic call).'
    : navigator.userAgent.includes('Windows')
      ? 'Break and water reminders wait while any app is using your microphone.'
      : navigator.userAgent.includes('Mac')
        ? 'Break and water reminders wait while you are in a Zoom meeting.'
        : 'Break and water reminders wait during calls (not detected on Linux yet).';

// Friendly label from a library path like custom_buddy_<ts>__<original>.<ext>
function getFilename(p: string): string {
  const file = p.split(/[/\\]/).pop() ?? '';
  return file.replace(/\.[^.]+$/, '').replace(/^custom_buddy_\d+(__)?/, '');
}


export const Settings: React.FC<SettingsProps> = ({ settings, onSave, onClose, onHeaderMouseDown }) => {
  const [workDuration, setWorkDuration] = useState(settings.workDuration);
  const [breakDuration, setBreakDuration] = useState(settings.breakDuration);
  const [snoozeDuration, setSnoozeDuration] = useState(settings.snoozeDuration);
  const [sound, setSound] = useState(settings.sound);
  const [startOnBoot, setStartOnBoot] = useState(settings.startOnBoot);
  const [alwaysVisible, setAlwaysVisible] = useState(settings.alwaysVisible ?? true);
  const [themeHue, setThemeHue] = useState(settings.themeHue ?? 263);
  const [customVideoPath, setCustomVideoPath] = useState(settings.customVideoPath ?? null);
  const [customSoundPath, setCustomSoundPath] = useState(settings.customSoundPath ?? null);
  const [keyingMode, setKeyingMode] = useState(settings.keyingMode ?? 'auto');
  const [debugKeyer, setDebugKeyer] = useState(settings.debugKeyer ?? false);
  const [hasPermission, setHasPermission] = useState(false);
  const [userName, setUserName] = useState(settings.userName ?? '');
  const [mediaLibrary, setMediaLibrary] = useState<string[]>(settings.mediaLibrary ?? []);
  const [hydrationEnabled, setHydrationEnabled] = useState(settings.hydrationEnabled ?? true);
  const [hydrationInterval, setHydrationInterval] = useState(settings.hydrationInterval ?? 60);
  const [hydrationGoal, setHydrationGoal] = useState(settings.hydrationGoal ?? 8);
  const [smartMonitoringEnabled, setSmartMonitoringEnabled] = useState(settings.smartMonitoringEnabled ?? true);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'config' | 'stats'>('config');
  const [isSoundPlaying, setIsSoundPlaying] = useState(false);
  const soundPreviewRef = useRef<HTMLAudioElement | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const refreshLibrary = useCallback(async () => {
    const lib = await window.api.getMediaLibrary();
    setMediaLibrary(lib);
  }, []);

  useEffect(() => {
    let current = true;
    window.api.getMediaLibrary().then((lib) => { if (current) setMediaLibrary(lib); });
    return () => { current = false; };
  }, []);

  // What the system will really do at login (macOS may be waiting for the user to allow it).
  const [loginItem, setLoginItem] = useState<{ enabled: boolean; needsApproval: boolean } | null>(null);
  const refreshLoginItem = useCallback(() => {
    window.api.getLoginItemStatus().then(setLoginItem).catch(() => {});
  }, []);
  useEffect(() => {
    let current = true;
    window.api.getLoginItemStatus().then((status) => { if (current) setLoginItem(status); }).catch(() => {});
    return () => { current = false; };
  }, []);

  // When settings change elsewhere (another tab, the tray, the scheduler), follow them. This
  // adjusts state while rendering, React's recommended alternative to syncing in an effect.
  const [syncedSettings, setSyncedSettings] = useState(settings);
  if (settings !== syncedSettings) {
    setSyncedSettings(settings);
    setWorkDuration(settings.workDuration);
    setStartOnBoot(settings.startOnBoot);
    setBreakDuration(settings.breakDuration);
    setSnoozeDuration(settings.snoozeDuration);
    setCustomVideoPath(settings.customVideoPath);
    setMediaLibrary(settings.mediaLibrary);
  }

  useEffect(() => () => { soundPreviewRef.current?.pause(); }, []);

  useEffect(() => {
    // Check permission on load
    window.api.getPermissionStatus().then((status) => {
      setHasPermission(status);
    });

    // Check permission periodically while settings is open
    const interval = setInterval(() => {
      window.api.getPermissionStatus().then((status) => {
        setHasPermission(status);
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Set once "Grant Access" was clicked but the app still isn't trusted: the switch in System
  // Settings is off, or it's on for an older copy of the app (see the hint below).
  const [askedPermission, setAskedPermission] = useState(false);
  const handleGrantPermission = async (): Promise<void> => {
    const granted = await window.api.requestPermission();
    setHasPermission(granted);
    if (!granted) setAskedPermission(true);
  };

  const handleSave = <K extends keyof AppSettings>(key: K, value: AppSettings[K]): void => {
    onSave({ [key]: value } as Partial<AppSettings>);
  };

  const handleSelectMedia = async (): Promise<void> => {
    const newPath = await window.api.selectMedia();
    if (newPath) {
      setCustomVideoPath(newPath);
      handleSave('customVideoPath', newPath);
      await refreshLibrary();
    }
  };

  const handleSelectSkin = (skin: AvatarSkin): void => {
    setCustomVideoPath(null);
    onSave({ customVideoPath: null, avatarSkin: skin });
  };

  // Festival buddies are limited-time: you see the classic buddy, the ones you've claimed, and
  // the current festival's (claim it with breaks); the rest stay a surprise.
  const claimed: FestivalSkin[] = settings.claimedSkins ?? [];
  const claim = claimStatus(settings);
  const festival = claim?.festival ?? null;
  const upcoming = upcomingFestivals(new Date(), 3);
  const shortDate = (d: Date): string => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const shownSkin = resolveAvatarSkin(settings.avatarSkin, new Date(), claimed);
  const festiveAuto = (settings.avatarSkin ?? 'auto') === 'auto';
  const visibleSkins = AVATAR_SKINS.filter((s) => s.id === 'classic' || claimed.includes(s.id as FestivalSkin) || s.id === festival?.festival.skin);
  const lockedCount = FESTIVALS.length - visibleSkins.length + 1;
  const breaksLeft = claim ? Math.max(0, CLAIM_BREAKS - claim.breaks) : 0;

  const handleSkinTile = (skin: AvatarSkin): void => {
    if (claim && !claim.claimed && claim.earned && skin === claim.festival.festival.skin) {
      setCustomVideoPath(null);
      onSave({ customVideoPath: null, avatarSkin: skin, claimedSkins: [...claimed, skin] });
      return;
    }
    handleSelectSkin(skin);
  };

  const [shareStatus, setShareStatus] = useState('');
  const notes = visibleNotes(settings.breakNotes);

  // Is the chosen picture really see-through? (A drawn-in checkerboard or a solid background
  // shows as a box.) Videos get the green-screen hint instead.
  // Keyed by file, so switching avatars never shows the previous picture's result.
  const [checked, setChecked] = useState<{ path: string; kind: BackgroundKind } | null>(null);
  const backgroundKind = checked && checked.path === customVideoPath ? checked.kind : null;
  useEffect(() => {
    if (!customVideoPath || !isImageFile(customVideoPath)) return undefined;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = toMediaUrl(customVideoPath);
    img.decode().then(() => {
      const scale = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = Object.assign(document.createElement('canvas'), { width: w, height: h }).getContext('2d');
      if (!ctx || cancelled) return;
      ctx.drawImage(img, 0, 0, w, h);
      setChecked({ path: customVideoPath, kind: classifyBackground(ctx.getImageData(0, 0, w, h).data, w, h) });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [customVideoPath]);
  const avatarTip = !customVideoPath ? null : isImageFile(customVideoPath) ? (backgroundKind && backgroundAdvice(backgroundKind)) : formatHint(customVideoPath);
  const handleShare = async (mode: 'download' | 'copy'): Promise<void> => {
    try {
      const blob = await drawShareCard(settings, shownSkin);
      if (mode === 'copy') {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setShareStatus('Copied! Paste it into your post. ✨');
      } else {
        downloadBlob(blob, `pixel-buddy-${new Date().toLocaleDateString('en-CA')}.png`);
        setShareStatus('Saved your card. Share the good vibes! ✨');
      }
    } catch {
      setShareStatus(mode === 'copy' ? "Couldn't copy here. Try Download instead." : "Couldn't save the card. Please try again.");
    }
  };

  const handleSelectLibraryItem = (p: string): void => {
    setCustomVideoPath(p);
    handleSave('customVideoPath', p);
  };

  const handleDeleteLibraryItem = async (p: string, e: React.MouseEvent): Promise<void> => {
    e.stopPropagation();
    const newLib = await window.api.deleteMediaLibraryItem(p);
    setMediaLibrary(newLib);
    if (customVideoPath === p) {
      setCustomVideoPath(null);
      handleSave('customVideoPath', null);
    }
  };

  const handleSelectSound = async (): Promise<void> => {
    const newPath = await window.api.selectSound();
    if (newPath) {
      setCustomSoundPath(newPath);
      handleSave('customSoundPath', newPath);
    }
  };

  const handleResetSound = async (): Promise<void> => {
    await window.api.resetSound();
    setCustomSoundPath(null);
    handleSave('customSoundPath', null);
  };

  const handlePreviewSound = (): void => {
    if (!customSoundPath) return;
    if (isSoundPlaying && soundPreviewRef.current) {
      soundPreviewRef.current.pause();
      soundPreviewRef.current.currentTime = 0;
      setIsSoundPlaying(false);
      return;
    }
    const audio = new Audio(toMediaUrl(customSoundPath));
    soundPreviewRef.current = audio;
    audio.play().then(() => {
      setIsSoundPlaying(true);
    }).catch(() => setIsSoundPlaying(false));
    audio.onended = () => setIsSoundPlaying(false);
  };

  const getSoundFilename = (): string => {
    if (!customSoundPath) return 'Default Cute Chime';
    const parts = customSoundPath.split(/[/\\]/);
    return parts[parts.length - 1].replace(/^custom_sound_\d+/, '').replace(/^\.|^_/, '') || parts[parts.length - 1];
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent): void => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent): Promise<void> => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      const filePath = window.api.getPathForFile(file);
      if (filePath) {
        const copiedPath = await window.api.saveCustomMedia(filePath);
        if (copiedPath) {
          setCustomVideoPath(copiedPath);
          handleSave('customVideoPath', copiedPath);
          await refreshLibrary();
        }
      }
    }
  };

  return (
    <div 
      className="settings-panel non-draggable"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Draggable header — allows moving the window from settings panel title bar */}
      <div
        className="settings-header draggable-handle"
        onMouseDown={onHeaderMouseDown}
      >
        <div className="settings-title-group">
          <svg className="settings-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span className="settings-title">Pixel Buddy</span>
        </div>
        <button className="settings-close non-draggable" onClick={onClose} aria-label="Close settings" onMouseDown={(e) => e.stopPropagation()}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="settings-welcome"><span className="settings-eyebrow">YOUR LITTLE WORKDAY COMPANION</span><p>A good day starts with a little balance.</p></div>
      {/* Tab Selectors Bar */}
      <div className="settings-tab-bar">
        <button 
          className={`settings-tab-btn ${activeSettingsTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveSettingsTab('config')}
        >
          ⚙️ Configure
        </button>
        <button 
          className={`settings-tab-btn ${activeSettingsTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveSettingsTab('stats')}
        >
          📊 Dashboard
        </button>
      </div>

      <div className="settings-scroll-container" ref={scrollRef}>
        {activeSettingsTab === 'config' ? (
          <>
            {/* Personalization — Your Name */}
            <div className="setting-row">
              <div className="setting-header-row">
                <span className="setting-label">Your Name</span>
                <span className="setting-badge" style={{ fontSize: '9px' }}>Personalize</span>
              </div>
              <div className="setting-input-wrapper">
                <input
                  type="text"
                  className="setting-text-input"
                  placeholder="Hey there! (leave blank for default)"
                  maxLength={24}
                  aria-label="Your name" value={userName}
                  onChange={(e) => {
                    setUserName(e.target.value);
                    handleSave('userName', e.target.value || null);
                  }}
                />
              </div>
            </div>

            <div className="setting-row"><span className="setting-label">Find your rhythm</span><div className="routine-presets">
              {[{ label: 'Pomodoro', work: 25, rest: 5 }, { label: 'Balanced', work: 55, rest: 5 }, { label: 'Deep focus', work: 90, rest: 10 }].map((preset) => <button key={preset.label} className={`routine-preset ${workDuration === preset.work && breakDuration === preset.rest ? 'selected' : ''}`} onClick={() => onSave({ workDuration: preset.work, breakDuration: preset.rest })}><strong>{preset.label}</strong><span>{preset.work} / {preset.rest} min</span></button>)}
            </div><p className="setting-help">Changes save automatically. Make it your own below.</p></div>
            {/* Timers Section */}
            <div className="setting-row">
              <div className="setting-header-row">
                <span className="setting-label">Work Timer</span>
                <span className="setting-badge">{workDuration}m</span>
              </div>
              <div className="setting-input-wrapper">
                <input
                  type="range"
                  min="5"
                  max="120"
                  step="5"
                  aria-label="Work duration" value={workDuration}
                  className="setting-slider"
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setWorkDuration(val);
                    handleSave('workDuration', val);
                  }}
                />
              </div>
            </div>

            <div className="setting-row">
              <div className="setting-header-row">
                <span className="setting-label">Break Timer</span>
                <span className="setting-badge break-badge">{breakDuration}m</span>
              </div>
              <div className="setting-input-wrapper">
                <input
                  type="range"
                  min="1"
                  max="30"
                  aria-label="Break duration" value={breakDuration}
                  className="setting-slider break-slider"
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setBreakDuration(val);
                    handleSave('breakDuration', val);
                  }}
                />
              </div>
            </div>

            <div className="setting-row">
              <div className="setting-header-row">
                <span className="setting-label">Snooze Timer</span>
                <span className="setting-badge snooze-badge">{snoozeDuration}m</span>
              </div>
              <div className="setting-input-wrapper">
                <input
                  type="range"
                  min="5"
                  max="60"
                  step="5"
                  aria-label="Snooze duration" value={snoozeDuration}
                  className="setting-slider snooze-slider"
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setSnoozeDuration(val);
                    handleSave('snoozeDuration', val);
                  }}
                />
              </div>
            </div>

            {/* Hydration Reminders Section */}
            <div className="setting-row" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '12px' }}>
              <div className="setting-header-row">
                <span className="setting-label">Water Reminders</span>
                <label className="switch non-draggable">
                  <input
                    type="checkbox"
                    aria-label="Water reminders" checked={hydrationEnabled}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setHydrationEnabled(val);
                      handleSave('hydrationEnabled', val);
                    }}
                  />
                  <span className="slider"></span>
                </label>
              </div>
            </div>

            {hydrationEnabled && (
              <>
                <div className="setting-row">
                  <div className="setting-header-row">
                    <span className="setting-label">Water Interval</span>
                    <span className="setting-badge" style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#60a5fa', borderColor: 'rgba(59, 130, 246, 0.2)' }}>{hydrationInterval}m</span>
                  </div>
                  <div className="setting-input-wrapper">
                    <input
                      type="range"
                      min="10"
                      max="180"
                      step="5"
                      aria-label="Water reminder interval" value={hydrationInterval}
                      className="setting-slider break-slider"
                      style={{ accentColor: '#3b82f6' }}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setHydrationInterval(val);
                        handleSave('hydrationInterval', val);
                      }}
                    />
                  </div>
                </div>

                <div className="setting-row">
                  <div className="setting-header-row">
                    <span className="setting-label">Daily Goal</span>
                    <span className="setting-badge" style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#60a5fa', borderColor: 'rgba(59, 130, 246, 0.2)' }}>{hydrationGoal} glasses</span>
                  </div>
                  <div className="setting-input-wrapper">
                    <input
                      type="range"
                      min="1"
                      max="20"
                      step="1"
                      aria-label="Daily water goal" value={hydrationGoal}
                      className="setting-slider break-slider"
                      style={{ accentColor: '#3b82f6' }}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setHydrationGoal(val);
                        handleSave('hydrationGoal', val);
                      }}
                    />
                  </div>
                </div>
              </>
            )}

            {/* ========== Media Library (Wallpaper Engine style) ========== */}
            <div className="setting-row" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '12px' }}>
              <div className="setting-header-row" style={{ marginBottom: '8px' }}>
                <span className="setting-label">Companion Avatar</span>
              </div>

              {/* Avatar grid: default mascot, uploaded media, then an "add" tile */}
              <div className="media-library-grid">
                {visibleSkins.map((skin) => {
                  const isActive = !customVideoPath && shownSkin === skin.id;
                  const limited = !!claim && !claim.claimed && claim.festival.festival.skin === skin.id;
                  const label = !limited ? skin.label : claim.earned ? 'Claim it 🎁' : `${skin.label} · ${claim.breaks}/${CLAIM_BREAKS}`;
                  return (
                    <div
                      key={skin.id}
                      role="button"
                      tabIndex={0}
                      className={`media-card ${isActive ? 'media-card-active' : ''}`}
                      onClick={() => handleSkinTile(skin.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSkinTile(skin.id); } }}
                      aria-pressed={isActive}
                      title={limited ? `Limited time: take ${CLAIM_BREAKS} breaks during ${skin.label} to keep this buddy` : skin.title}
                    >
                      <div className="media-card-thumb">
                        <img src={skin.src} alt="" className="media-card-preview" />
                        {limited && <span className="media-card-limited">Limited</span>}
                        {isActive && <div className="media-card-check">✓</div>}
                      </div>
                      <div className="media-card-label">{label}</div>
                    </div>
                  );
                })}

                {lockedCount > 0 && (
                  <div className="media-card media-card-locked" title="Festival buddies appear during their festival. Take breaks while it lasts to keep one.">
                    <div className="media-card-thumb">
                      <span className="media-card-lock">🔒</span>
                    </div>
                    <div className="media-card-label">{lockedCount} to collect</div>
                    {upcoming[0] && <div className="media-card-sub">Next: {upcoming[0].festival.emoji} {shortDate(upcoming[0].day)}</div>}
                  </div>
                )}

                {mediaLibrary.map((p, i) => {
                  const isActive = customVideoPath === p;
                  const name = getFilename(p) || `Custom ${i + 1}`;
                  return (
                    <div
                      key={p}
                      role="button"
                      tabIndex={0}
                      className={`media-card ${isActive ? 'media-card-active' : ''}`}
                      onClick={() => handleSelectLibraryItem(p)}
                      title={formatHint(p) ? `${name}\n${formatHint(p)}` : name}
                    >
                      <div className="media-card-thumb">
                        {isImageFile(p) ? (
                          <img src={toMediaUrl(p)} alt={name} className="media-card-preview" />
                        ) : (
                          <video src={toMediaUrl(p)} className="media-card-preview" muted loop autoPlay playsInline />
                        )}
                        <span className="media-card-ext">{mediaTypeLabel(p)}</span>
                        {isActive && <div className="media-card-check">✓</div>}
                        <button
                          type="button"
                          aria-label={`Remove ${name}`}
                          className="media-card-delete non-draggable"
                          onClick={(e) => handleDeleteLibraryItem(p, e)}
                          title="Remove from library"
                        >
                          ×
                        </button>
                      </div>
                      <div className="media-card-label">{name}</div>
                    </div>
                  );
                })}

                <button
                  type="button"
                  className="media-card media-card-add non-draggable"
                  onClick={handleSelectMedia}
                  title={`Add a ${SUPPORTED_FORMATS_TEXT}\n\n${FORMAT_GUIDE.map((g) => `${g.title} (${g.formats}): ${g.text}`).join('\n')}`}
                >
                  <div className="media-card-thumb">
                    <span className="media-card-add-icon">+</span>
                  </div>
                  <div className="media-card-label">Add avatar</div>
                </button>
              </div>
              <p className="setting-help">
                Drop a {SUPPORTED_FORMATS_TEXT} here or on the buddy.{' '}
                <span className="format-tip" tabIndex={0} aria-describedby="format-guide">Which format? ⓘ</span>
              </p>
              <div id="format-guide" className="format-guide" role="tooltip">
                {FORMAT_GUIDE.map((g) => (
                  <p key={g.title}><b>{g.title}</b> <span className="format-guide-formats">{g.formats}</span><br />{g.text}</p>
                ))}
              </div>
              {avatarTip && <p className="format-hint">💡 {avatarTip}</p>}
              <div className="switch-row" style={{ marginTop: '10px' }}>
                <div className="switch-label-group">
                  <span className="switch-label">Dress up for festivals</span>
                  <span className="switch-sublabel">
                    {festiveAuto && claim && festival
                      ? claim.claimed
                        ? `${festival.festival.emoji} It's ${festival.festival.name}! Dressed up until ${shortDate(festival.lastDay)}`
                        : claim.earned
                          ? `${festival.festival.emoji} You earned the ${festival.festival.name} buddy! Tap its tile to keep it`
                          : `${festival.festival.emoji} It's ${festival.festival.name}! Take ${breaksLeft} more break${breaksLeft === 1 ? '' : 's'} by ${shortDate(festival.lastDay)} to keep this buddy`
                      : `Limited-time festival buddies: take ${CLAIM_BREAKS} breaks during a festival to keep its buddy`}
                  </span>
                </div>
                <label className="switch non-draggable">
                  <input
                    type="checkbox"
                    aria-label="Dress up for festivals" checked={festiveAuto}
                    onChange={(e) => handleSave('avatarSkin', e.target.checked ? 'auto' : 'classic')}
                  />
                  <span className="slider"></span>
                </label>
              </div>
              {festiveAuto && upcoming.length > 0 && (
                <div className="festival-calendar" aria-label="Festival calendar">
                  <span className="festival-calendar-title">Coming up</span>
                  {upcoming.map((u) => (
                    <div key={`${u.festival.skin}-${u.day.getTime()}`} className="festival-calendar-row">
                      <span>{u.festival.emoji} {u.festival.name}</span>
                      <span>{shortDate(u.day)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Custom Alarm Sound Selector */}
            <div className="setting-row">
              <span className="setting-label" style={{ marginBottom: '6px' }}>Alarm Sound</span>
              <div className="media-selector-box">
                <div className="media-file-info" title={customSoundPath || 'Default Cute Chime'}>
                  {getSoundFilename()}
                </div>
                <div className="media-buttons">
                  <button className="btn btn-secondary btn-sm non-draggable" onClick={handleSelectSound}>
                    {customSoundPath ? 'Change' : 'Custom Sound'}
                  </button>
                  {customSoundPath && (
                    <>
                      <button
                        className={`btn btn-sm non-draggable ${isSoundPlaying ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={handlePreviewSound}
                        title={isSoundPlaying ? 'Stop preview' : 'Preview sound'}
                      >
                        {isSoundPlaying ? '■' : '▶'}
                      </button>
                      <button className="btn btn-danger btn-sm non-draggable" onClick={handleResetSound}>
                        Reset
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Keying Mode Selection */}
            <div className="setting-row">
              <div className="setting-header-row">
                <span className="setting-label">Keying / Transparency</span>
              </div>
              <select
                value={keyingMode}
                className="setting-select non-draggable"
                onChange={(e) => {
                  const val = e.target.value as 'auto' | 'native' | 'none';
                  setKeyingMode(val);
                  handleSave('keyingMode', val);
                }}
              >
                <option value="auto">Auto (GPU Chroma Key)</option>
                <option value="native">Native (Alpha Channel / GIFs)</option>
                <option value="none">No Keying (Solid Background)</option>
              </select>
            </div>

            {/* Custom Theme Hue Slider */}
            <div className="setting-row">
              <div className="setting-header-row">
                <span className="setting-label">UI Color Theme</span>
                <span 
                  className="setting-badge theme-badge" 
                  style={{ backgroundColor: 'var(--theme-primary)', color: 'white' }}
                >
                  Theme
                </span>
              </div>
              <div className="setting-input-wrapper">
                <input
                  type="range"
                  min="0"
                  max="360"
                  aria-label="Theme color" value={themeHue}
                  className="setting-slider"
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setThemeHue(val);
                    handleSave('themeHue', val);
                  }}
                />
              </div>
            </div>

            {/* Toggle Switches */}
            <div className="switch-group" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '12px' }}>
              <div className="switch-row">
                <div className="switch-label-group">
                  <span className="switch-label">Always On Screen</span>
                  <span className="switch-sublabel">Show buddy during work sessions, not just on break</span>
                </div>
                <label className="switch non-draggable">
                  <input
                    type="checkbox"
                    aria-label="Keep buddy visible" checked={alwaysVisible}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setAlwaysVisible(val);
                      handleSave('alwaysVisible', val);
                    }}
                  />
                  <span className="slider"></span>
                </label>
              </div>

              <div className="switch-row">
                <div className="switch-label-group">
                  <span className="switch-label">Keyer Debug View</span>
                  <span className="switch-sublabel">Highlights removed background in magenta for tuning</span>
                </div>
                <label className="switch non-draggable">
                  <input
                    type="checkbox"
                    aria-label="Preview background removal" checked={debugKeyer}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setDebugKeyer(val);
                      handleSave('debugKeyer', val);
                    }}
                  />
                  <span className="slider"></span>
                </label>
              </div>

              <div className="switch-row">
                <div className="switch-label-group">
                  <span className="switch-label">Buddy Moods</span>
                  <span className="switch-sublabel">A small badge: 🎧 on a call, ✨ after a break, 😪 after a skipped or snoozed one. Click it to see why.</span>
                </div>
                <label className="switch non-draggable">
                  <input
                    type="checkbox"
                    aria-label="Show buddy moods"
                    checked={settings.showMoods ?? true}
                    onChange={(e) => handleSave('showMoods', e.target.checked)}
                  />
                  <span className="slider"></span>
                </label>
              </div>

              <div className="switch-row">
                <div className="switch-label-group">
                  <span className="switch-label">Sound Effects</span>
                  <span className="switch-sublabel">Play chimes on break reminders and buddy clicks</span>
                </div>
                <label className="switch non-draggable">
                  <input
                    type="checkbox"
                    aria-label="Sound alerts" checked={sound}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setSound(val);
                      handleSave('sound', val);
                    }}
                  />
                  <span className="slider"></span>
                </label>
              </div>

              {!IN_EXTENSION_PAGE && (
                <div className="switch-row">
                  <div className="switch-label-group">
                    <span className="switch-label">Open at Login</span>
                    <span className="switch-sublabel">
                      {loginItem?.needsApproval && startOnBoot
                        ? 'macOS needs your OK: System Settings → General → Login Items → turn on Pixel Buddy.'
                        : 'Start Pixel Buddy when you sign in. Turn off to open it yourself. Also in the tray menu.'}
                    </span>
                  </div>
                  <label className="switch non-draggable">
                    <input
                      type="checkbox"
                      aria-label="Open at login" checked={startOnBoot}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setStartOnBoot(val);
                        handleSave('startOnBoot', val);
                        setTimeout(refreshLoginItem, 500);
                      }}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              )}
            </div>

            {/* Away time and calls */}
            <div className="switch-group" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '12px' }}>
              {smartMonitoringEnabled && (
                <div className="switch-row">
                  <div className="switch-label-group">
                    <span className="switch-label">Away After</span>
                    <span className="switch-sublabel">No keyboard or mouse this long pauses the focus timer. Being away this long counts as a break.</span>
                  </div>
                  <select
                    aria-label="Away after"
                    className="setting-select setting-select-compact non-draggable"
                    value={settings.awayMinutes ?? 5}
                    onChange={(e) => handleSave('awayMinutes', Number(e.target.value))}
                  >
                    {AWAY_MINUTE_CHOICES.map((m) => (
                      <option key={m} value={m}>{m} min</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="switch-row">
                <div className="switch-label-group">
                  <span className="switch-label">Quiet During Calls</span>
                  <span className="switch-sublabel">{CALL_DETECTION_HELP}</span>
                </div>
                <label className="switch non-draggable">
                  <input
                    type="checkbox"
                    aria-label="Hold reminders during calls"
                    checked={settings.meetingAware ?? true}
                    onChange={(e) => handleSave('meetingAware', e.target.checked)}
                  />
                  <span className="slider"></span>
                </label>
              </div>
            </div>

            {/* Permissions Block */}
            <div className="permission-box">
              <div className="permission-header-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <svg className="permission-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <span className="permission-title">Smart Input Tracking</span>
                </div>
                {hasPermission && (
                  <label className="switch non-draggable" style={{ transform: 'scale(0.8)' }}>
                    <input
                      type="checkbox"
                      aria-label="Smart activity monitoring" checked={smartMonitoringEnabled}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setSmartMonitoringEnabled(val);
                        handleSave('smartMonitoringEnabled', val);
                      }}
                    />
                    <span className="slider"></span>
                  </label>
                )}
              </div>
              <p className="permission-description">Optimizes reminders by pausing timers when away from your keyboard and mouse.</p>
              <div className="permission-status">
                {smartMonitoringEnabled && hasPermission ? (
                  <span className="badge badge-success">Smart Tracking Active</span>
                ) : (
                  <>
                    <span className="badge badge-warning">Basic Mode (Idle Only)</span>
                    {!hasPermission && (
                      <button 
                        className="btn btn-grant non-draggable" 
                        onClick={askedPermission ? () => void window.api.openPermissionSettings() : handleGrantPermission}
                      >
                        {askedPermission ? 'Open Settings' : 'Grant Access'}
                      </button>
                    )}
                  </>
                )}
              </div>
              {!hasPermission && askedPermission && (
                <p className="permission-hint">
                  Turn on <b>Pixel Buddy</b> in Privacy &amp; Security → Accessibility. Already on? macOS may still
                  remember an older copy of the app: turn it off and on again (or remove it with − and add it back).
                  This updates by itself within a few seconds.
                </p>
              )}
            </div>
          </>
        ) : (
          /* Stats Dashboard Tab */
          <div className="settings-dashboard-view">
            {/* Daily Focus Time */}
            <div className="dashboard-stats-card">
              <div className="stat-card-title">Focused Time Today</div>
              <div className="focus-time-display">
                <span className="focus-value-number">
                  {Math.floor((settings.statsFocusMinutesToday ?? 0) / 60)}h{' '}
                  {(settings.statsFocusMinutesToday ?? 0) % 60}m
                </span>
                <span className="focus-streak-text">focused sessions</span>
              </div>
            </div>

            {/* Daily Hydration Progress */}
            <div className="dashboard-stats-card water-stats-card">
              <div className="stat-card-title">Daily Hydration</div>
              <div className="water-ratio-display">
                <span className="water-ratio-current">{settings.hydrationDrankToday ?? 0}</span>
                <span className="water-ratio-separator">/</span>
                <span className="water-ratio-total">{settings.hydrationGoal ?? 8}</span>
                <span className="water-ratio-label">glasses</span>
              </div>
              <div className="dashboard-progress-container">
                <div 
                  className="dashboard-progress-bar water-progress-bar"
                  style={{ width: `${Math.min(100, ((settings.hydrationDrankToday ?? 0) / (settings.hydrationGoal ?? 8)) * 100)}%` }}
                />
              </div>
              {/* Log glasses by hand, e.g. ones you drank away from the computer */}
              <div className="water-log-buttons">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm non-draggable"
                  aria-label="Remove a glass"
                  title="Remove a glass"
                  disabled={(settings.hydrationDrankToday ?? 0) === 0}
                  onClick={() => onSave({ hydrationDrankToday: Math.max(0, (settings.hydrationDrankToday ?? 0) - 1) })}
                >
                  −
                </button>
                <button type="button" className="btn btn-primary btn-sm non-draggable" onClick={() => window.api.logHydration()} title="Log a glass you drank">
                  + Add a glass 💧
                </button>
              </div>
            </div>

            {/* Daily Break Metrics */}
            <div className="dashboard-breaks-grid">
              <div className="break-grid-card completed">
                <div className="grid-card-value">{settings.statsBreaksCompletedToday ?? 0}</div>
                <div className="grid-card-label">Breaks Done</div>
              </div>
              <div className="break-grid-card snoozed">
                <div className="grid-card-value">{settings.statsBreaksSnoozedToday ?? 0}</div>
                <div className="grid-card-label">Snoozed</div>
              </div>
              <div className="break-grid-card skipped">
                <div className="grid-card-value">{settings.statsBreaksSkippedToday ?? 0}</div>
                <div className="grid-card-label">Skipped</div>
              </div>
            </div>

            {/* Motivational nudge */}
            <div className="dashboard-motivational">
              <div className="quote-icon">✨</div>
              <div className="quote-text">
                {(settings.statsFocusMinutesToday ?? 0) > 0 
                  ? "Great job staying productive today! Keep maintaining your focus streaks."
                  : "Let's start focusing! Your pixel companion is waiting to check in."}
              </div>
            </div>

            {/* Break notes: what you were doing before each break */}
            <div className="dashboard-stats-card notes-card">
              <div className="stat-card-title">Break Notes</div>
              {notes.length ? (
                <ul className="notes-list">
                  {notes.slice(0, 5).map((note) => (
                    <li key={note.id}>
                      <time dateTime={new Date(note.at).toISOString()}>{noteTime(note.at)}</time>
                      <span className="note-text">{note.text}</span>
                      <button type="button" className="non-draggable" aria-label={`Delete note: ${note.text}`} title="Delete" onClick={() => onSave({ breakNotes: removeNote(settings.breakNotes, note.id) })}>✕</button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="notes-empty">When a break is due, jot what you were doing. Your buddy shows it when you&apos;re back.</p>
              )}
              {notes.length > 0 && (
                <div className="notes-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm non-draggable"
                    title={`Save all ${notes.length} notes as a text file`}
                    onClick={() => downloadBlob(new Blob([notesAsText(settings.breakNotes)], { type: 'text/plain' }), 'pixel-buddy-notes.txt')}
                  >
                    Export notes
                  </button>
                </div>
              )}
              {IN_EXTENSION_PAGE && <p className="notes-empty">With Chrome sync on, your notes follow you to your other computers.</p>}
            </div>

            {/* Share today's stats as an image */}
            <div className="share-day">
              <button className="btn btn-primary non-draggable" onClick={() => handleShare('download')} title="Save a picture of today's stats with your buddy">
                📸 Share my day
              </button>
              <button className="btn btn-secondary non-draggable" onClick={() => handleShare('copy')} title="Copy the picture to paste into a post or chat">
                Copy image
              </button>
            </div>
            <p className="share-status" role="status">{shareStatus}</p>
          </div>
        )}

        {/* Quit Button (visible on both tabs for convenience) */}
        <button 
          className="btn btn-danger quit-btn non-draggable" 
          onClick={() => window.api.quit()}
          style={{ marginTop: '16px', width: '100%', display: 'flex', justifyContent: 'center' }}
        >
          Quit Pixel Buddy
        </button>
      </div>
    </div>
  );
};
