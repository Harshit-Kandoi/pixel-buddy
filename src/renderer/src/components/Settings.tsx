import React, { useState, useEffect, useRef } from 'react';
import { AppSettings } from '../../../utils/types';

interface SettingsProps {
  settings: AppSettings;
  onSave: (settings: Partial<AppSettings>) => void;
  onClose: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ settings, onSave, onClose }) => {
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

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop += e.deltaY;
      }
    };
    const el = scrollRef.current;
    if (el) {
      el.addEventListener('wheel', handleWheel, { passive: true });
    }
    return () => {
      if (el) {
        el.removeEventListener('wheel', handleWheel);
      }
    };
  }, []);

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

  const handleGrantPermission = async () => {
    const granted = await window.api.requestPermission();
    setHasPermission(granted);
  };

  const handleSave = (key: keyof AppSettings, value: any) => {
    onSave({ [key]: value });
  };

  const handleSelectMedia = async () => {
    const newPath = await window.api.selectMedia();
    if (newPath) {
      setCustomVideoPath(newPath);
      handleSave('customVideoPath', newPath);
    }
  };

  const handleResetMedia = async () => {
    await window.api.resetMedia();
    setCustomVideoPath(null);
    handleSave('customVideoPath', null);
  };

  // Get filename from absolute path
  const getMediaFilename = () => {
    if (!customVideoPath) return 'Default Pixel Companion';
    const parts = customVideoPath.split(/[/\\]/);
    const rawName = parts[parts.length - 1];
    return rawName.replace(/^custom_buddy_\d+_/, '');
  };

  const handleSelectSound = async () => {
    const newPath = await window.api.selectSound();
    if (newPath) {
      setCustomSoundPath(newPath);
      handleSave('customSoundPath', newPath);
    }
  };

  const handleResetSound = async () => {
    await window.api.resetSound();
    setCustomSoundPath(null);
    handleSave('customSoundPath', null);
  };

  const getSoundFilename = () => {
    if (!customSoundPath) return 'Default Cute Chime';
    const parts = customSoundPath.split(/[/\\]/);
    const rawName = parts[parts.length - 1];
    return rawName.replace(/^custom_sound_\d+_\d+/, '').replace(/^custom_sound_\d+/, '');
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      const filePath = (file as any).path;
      if (filePath) {
        const copiedPath = await window.api.saveCustomMedia(filePath);
        if (copiedPath) {
          setCustomVideoPath(copiedPath);
          handleSave('customVideoPath', copiedPath);
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
      <div className="settings-header">
        <div className="settings-title-group">
          <svg className="settings-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span className="settings-title">Buddy Settings</span>
        </div>
        <button className="settings-close" onClick={onClose} aria-label="Close settings">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="settings-scroll-container" ref={scrollRef}>
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
              value={workDuration}
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
              value={breakDuration}
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
              value={snoozeDuration}
              className="setting-slider snooze-slider"
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setSnoozeDuration(val);
                handleSave('snoozeDuration', val);
              }}
            />
          </div>
        </div>

        {/* Custom Companion Media Selector */}
        <div className="setting-row" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '12px' }}>
          <span className="setting-label" style={{ marginBottom: '6px' }}>Companion Avatar (Drag & Drop here)</span>
          <div className="media-selector-box">
            <div className="media-file-info" title={customVideoPath || 'Default Companion'}>
              {getMediaFilename()}
            </div>
            <div className="media-buttons">
              <button className="btn btn-secondary btn-sm" onClick={handleSelectMedia}>
                Change File
              </button>
              {customVideoPath && (
                <button className="btn btn-danger btn-sm" onClick={handleResetMedia}>
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Custom Alarm Sound Selector */}
        <div className="setting-row">
          <span className="setting-label" style={{ marginBottom: '6px' }}>Custom Alarm Sound</span>
          <div className="media-selector-box">
            <div className="media-file-info" title={customSoundPath || 'Default Cute Chime'}>
              {getSoundFilename()}
            </div>
            <div className="media-buttons">
              <button className="btn btn-secondary btn-sm" onClick={handleSelectSound}>
                Change Sound
              </button>
              {customSoundPath && (
                <button className="btn btn-danger btn-sm" onClick={handleResetSound}>
                  Reset
                </button>
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
            className="setting-select"
            onChange={(e) => {
              const val = e.target.value as 'auto' | 'native' | 'none';
              setKeyingMode(val);
              handleSave('keyingMode', val);
            }}
          >
            <option value="auto">Auto (Key Background)</option>
            <option value="native">Native (Alpha Channel/GIFs)</option>
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
              value={themeHue}
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
            <span className="switch-label">Always On Screen</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={alwaysVisible}
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
            <span className="switch-label">Show Keyer Debugger</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={debugKeyer}
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
            <span className="switch-label">Sound Effects</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={sound}
                onChange={(e) => {
                  const val = e.target.checked;
                  setSound(val);
                  handleSave('sound', val);
                }}
              />
              <span className="slider"></span>
            </label>
          </div>

          <div className="switch-row">
            <span className="switch-label">Start on Boot</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={startOnBoot}
                onChange={(e) => {
                  const val = e.target.checked;
                  setStartOnBoot(val);
                  handleSave('startOnBoot', val);
                }}
              />
              <span className="slider"></span>
            </label>
          </div>
        </div>

        {/* Permissions Block */}
        <div className="permission-box">
          <div className="permission-header-group">
            <svg className="permission-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="permission-title">macOS Smart Monitoring</span>
          </div>
          <p className="permission-description">Optimizes reminders by pausing timers when away from your keyboard and mouse.</p>
          <div className="permission-status">
            {hasPermission ? (
              <span className="badge badge-success">Smart Tracking Active</span>
            ) : (
              <>
                <span className="badge badge-warning">Basic Mode (Idle Only)</span>
                <button 
                  className="btn btn-grant non-draggable" 
                  onClick={handleGrantPermission}
                >
                  Grant Access
                </button>
              </>
            )}
          </div>
        </div>

        {/* Quit Button */}
        <button 
          className="btn btn-danger quit-btn" 
          onClick={() => window.api.quit()}
          style={{ marginTop: '16px', width: '100%', display: 'flex', justifyContent: 'center' }}
        >
          Quit Pixel Buddy
        </button>
      </div>
    </div>
  );
};
