import { useEffect, useState, type JSX } from 'react';
import App from '../../src/renderer/src/App';
import buddy from '../../src/renderer/src/assets/buddy.svg';
import { KEY_ENABLED, KEY_HIDDEN_SITES, KEY_PAGES_ENABLED } from './protocol';

const KEYS = [KEY_ENABLED, KEY_PAGES_ENABLED, KEY_HIDDEN_SITES];

/**
 * The popup's content: settings and stats while Pixel Buddy is on, a "Turn on" card while it's off.
 * `onChange` gets each storage change (it updates the switches above) and says whether it's on.
 */
export function PopupRoot({ onChange, onTurnOn }: { onChange: (values: Record<string, unknown>) => boolean; onTurnOn: () => void }): JSX.Element | null {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    void chrome.storage.local.get(KEYS).then(stored => setOn(onChange(stored)));
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
      if (area !== 'local' || !KEYS.some(key => key in changes)) return;
      const values: Record<string, unknown> = {};
      for (const key of KEYS) if (key in changes) values[key] = changes[key].newValue;
      setOn(onChange(values));
    };
    chrome.storage.onChanged.addListener(changed);
    return () => chrome.storage.onChanged.removeListener(changed);
  }, [onChange]);
  if (on === null) return null;
  if (on) return <App />;
  return (
    <div className="popup-off">
      <img src={buddy} alt="" width={88} height={88} />
      <h2>Pixel Buddy is off</h2>
      <p>No reminders, no sounds, and nothing runs on your pages. Your settings, stats and notes are kept.</p>
      <button type="button" className="btn btn-primary" onClick={onTurnOn}>Turn on</button>
    </div>
  );
}
