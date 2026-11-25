import { describe, expect, it } from 'vitest';
import { detectMeeting, detectMediaPlaying, mediaPlayingFromAssertions, mediaPollMs, mprisIsPlaying, mprisPlayers, micInUseFromHelper, micInUseFromRegistry, soundPlayingFromPeak } from '../meetings';

const KEY = 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone';

describe('call detection', () => {
  it('reads "microphone in use" from the Windows registry', () => {
    const idle = `\r\n${KEY}\\NonPackaged\\C:#Program Files#Zoom#bin#Zoom.exe\r\n    LastUsedTimeStop    REG_QWORD    0x1db0a3c8e5f2b10\r\n\r\nEnd of search: 1 match(es) found.\r\n`;
    const inUse = `${idle}${KEY}\\MicrosoftTeams_8wekyb3d8bbwe\r\n    LastUsedTimeStop    REG_QWORD    0x0\r\n`;
    expect(micInUseFromRegistry(idle)).toBe(false);
    expect(micInUseFromRegistry(inUse)).toBe(true);
    expect(micInUseFromRegistry('')).toBe(false);
  });

  it("reads the macOS helper's answer, and treats anything else as unknown", () => {
    expect(micInUseFromHelper('1\n')).toBe(true);
    expect(micInUseFromHelper('0\n')).toBe(false);
    expect(micInUseFromHelper('')).toBeNull();
    expect(micInUseFromHelper('Killed: 9')).toBeNull();
  });

  it('falls back to the Zoom check on macOS when the helper is missing', async () => {
    if (process.platform !== 'darwin') return;
    expect(typeof (await detectMeeting('darwin', '/nonexistent/mic-in-use'))).toBe('boolean');
  });

  it('never reports a call on platforms it cannot check', async () => {
    expect(await detectMeeting('linux')).toBe(false);
  });
});

describe('mediaPlayingFromAssertions', () => {
  it('is true while a display-sleep assertion is held (video playing)', () => {
    expect(mediaPlayingFromAssertions('   PreventUserIdleDisplaySleep    1\n')).toBe(true);
  });
  it('is false when none is held', () => {
    expect(mediaPlayingFromAssertions('   PreventUserIdleDisplaySleep    0\n')).toBe(false);
    expect(mediaPlayingFromAssertions('')).toBe(false);
  });
});

describe('media detection on Windows and Linux', () => {
  it('reads the speaker peak level on Windows', () => {
    expect(soundPlayingFromPeak('0.2315\r\n')).toBe(true);
    expect(soundPlayingFromPeak('0\r\n')).toBe(false);
    expect(soundPlayingFromPeak('')).toBe(false);
    expect(soundPlayingFromPeak('Add-Type : error')).toBe(false);
  });
  it('finds MPRIS players and their playback status on Linux', () => {
    const list = 'org.freedesktop.DBus  1 dbus-daemon -  -  -  -  -\norg.mpris.MediaPlayer2.firefox.instance123  9 firefox  me  :1.9  session-1.scope  -  -\norg.mpris.MediaPlayer2.vlc  4 vlc me :1.4 x - -\n';
    expect(mprisPlayers(list)).toEqual(['org.mpris.MediaPlayer2.firefox.instance123', 'org.mpris.MediaPlayer2.vlc']);
    expect(mprisPlayers('')).toEqual([]);
    expect(mprisIsPlaying('s "Playing"\n')).toBe(true);
    expect(mprisIsPlaying('s "Paused"\n')).toBe(false);
  });
  it('checks Windows less often because it starts PowerShell each time', () => {
    expect(mediaPollMs('win32')).toBeGreaterThan(mediaPollMs('darwin'));
  });
  it('says no on platforms it cannot ask', async () => {
    await expect(detectMediaPlaying('freebsd')).resolves.toBe(false);
  });
});
