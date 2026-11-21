import { describe, expect, it } from 'vitest';
import { detectMeeting, micInUseFromHelper, micInUseFromRegistry } from '../meetings';

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
