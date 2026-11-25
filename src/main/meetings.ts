import { execFile } from 'child_process';
import { existsSync } from 'fs';
import * as path from 'path';

// Desktop call detection, kept cheap: one small system query every POLL_MS, nothing more.
// - Windows: is any app using the microphone right now? Windows records this per app in the
//   registry (LastUsedTimeStop is 0 while the mic is in use). Covers Zoom, Teams, Slack, Discord,
//   Meet in a browser: any call.
// - macOS: the same question, asked of Core Audio by a tiny bundled helper
//   (native/mac/mic-in-use.swift → resources/mac/mic-in-use). It never opens the microphone, so it
//   needs no permission, and covers Zoom, Teams, Slack, FaceTime, Meet in a browser: any call.
//   If the helper is missing or can't run, it falls back to Zoom's meeting process (CptHost runs
//   only while you're in a Zoom meeting).

export const MEETING_POLL_MS = 20000;

const MIC_CONSENT_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone';

function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 5000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      // pgrep exits 1 when nothing matches; that's an answer, not a failure.
      resolve(error && !stdout ? '' : String(stdout));
    });
  });
}

/** `reg query` output: an app whose LastUsedTimeStop is 0 is using the microphone now. */
export function micInUseFromRegistry(output: string): boolean {
  return /LastUsedTimeStop\s+REG_QWORD\s+0x0\s*$/im.test(output);
}

/** The macOS helper: unpacked next to app.asar in a packaged app, in resources/ during development. */
export const MAC_MIC_HELPER = path
  .join(__dirname, '../../resources/mac/mic-in-use')
  .replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);

/** The helper prints 1 or 0; anything else (missing, blocked, crashed) means "don't know". */
export function micInUseFromHelper(output: string): boolean | null {
  const answer = output.trim();
  return answer === '1' ? true : answer === '0' ? false : null;
}

/** `pmset -g assertions`: a video player or browser playing video holds a display-sleep assertion. */
export function mediaPlayingFromAssertions(output: string): boolean {
  return /PreventUserIdleDisplaySleep\s+[1-9]/.test(output);
}

/** `busctl --user list`: the names of media players (browsers, VLC, mpv...) that speak MPRIS. */
export function mprisPlayers(output: string): string[] {
  const names = output.split('\n').map((line) => line.trim().split(/\s+/)[0] ?? '');
  return names.filter((name) => /^org\.mpris\.MediaPlayer2\.[A-Za-z0-9_.-]+$/.test(name)).slice(0, 8);
}

/** `busctl get-property ... PlaybackStatus` prints `s "Playing"`. */
export function mprisIsPlaying(output: string): boolean {
  return /^s\s+"Playing"\s*$/m.test(output);
}

// Windows: is sound coming out of the default speakers? Playing video (any app or browser)
// makes the output's peak level rise above zero. Windows exposes this through Core Audio
// (IAudioMeterInformation); a tiny inline C# call reads it without admin rights or any permission.
// A video with no sound isn't noticed.
const WIN_AUDIO_PEAK_SCRIPT = `
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int EnumAudioEndpoints(int f, int s, out IntPtr d); int GetDefaultAudioEndpoint(int f, int r, out IMMDevice d); }
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid id, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
[Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioMeterInformation { int GetPeakValue(out float peak); }
public static class PixelBuddyAudio {
  public static float Peak() {
    var e = (IMMDeviceEnumerator)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")));
    IMMDevice d; e.GetDefaultAudioEndpoint(0, 1, out d);
    var iid = new Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"); object o; d.Activate(ref iid, 23, IntPtr.Zero, out o);
    float p; ((IAudioMeterInformation)o).GetPeakValue(out p); return p;
  }
}
"@
[PixelBuddyAudio]::Peak()
`;
const WIN_AUDIO_PEAK_ARGS = [
  '-NoProfile',
  '-NonInteractive',
  '-EncodedCommand',
  Buffer.from(WIN_AUDIO_PEAK_SCRIPT, 'utf16le').toString('base64'),
];

/** The script prints the peak level, 0 to 1. Above a whisper means sound is playing. */
export function soundPlayingFromPeak(output: string): boolean {
  const peak = Number.parseFloat(output.trim().split(/\s+/).pop() ?? '');
  return Number.isFinite(peak) && peak > 0.001;
}

/** How often to check for playing media: Windows starts PowerShell each time, so it checks less often. */
export const mediaPollMs = (platform: NodeJS.Platform = process.platform): number => (platform === 'win32' ? 20000 : 10000);

/**
 * Is a video playing? Anything that can't be asked, or fails, counts as no.
 * - macOS: a playing video holds a display-sleep assertion.
 * - Windows: sound is coming out of the speakers.
 * - Linux: a media player (browser, VLC, mpv...) reports "Playing" over MPRIS.
 */
export async function detectMediaPlaying(platform: NodeJS.Platform = process.platform): Promise<boolean> {
  if (platform === 'darwin') return mediaPlayingFromAssertions(await run('/usr/bin/pmset', ['-g', 'assertions']));
  if (platform === 'win32') return soundPlayingFromPeak(await run('powershell.exe', WIN_AUDIO_PEAK_ARGS));
  if (platform === 'linux') {
    for (const name of mprisPlayers(await run('busctl', ['--user', 'list', '--no-legend']))) {
      const status = await run('busctl', ['--user', 'get-property', name, '/org/mpris/MediaPlayer2', 'org.mpris.MediaPlayer2.Player', 'PlaybackStatus']);
      if (mprisIsPlaying(status)) return true;
    }
  }
  return false;
}

export async function detectMeeting(platform: NodeJS.Platform = process.platform, macHelper = MAC_MIC_HELPER): Promise<boolean> {
  if (platform === 'win32') {
    return micInUseFromRegistry(await run('reg', ['query', MIC_CONSENT_KEY, '/s', '/v', 'LastUsedTimeStop']));
  }
  if (platform === 'darwin') {
    const mic = existsSync(macHelper) ? micInUseFromHelper(await run(macHelper, [])) : null;
    if (mic !== null) return mic;
    return (await run('/usr/bin/pgrep', ['-x', 'CptHost'])).trim().length > 0;
  }
  return false;
}
