import { execFile } from 'child_process';

// Desktop call detection, kept cheap: one small system query every POLL_MS, nothing more.
// - Windows: is any app using the microphone right now? Windows records this per app in the
//   registry (LastUsedTimeStop is 0 while the mic is in use). Covers Zoom, Teams, Slack, Discord,
//   Meet in a browser: any call.
// - macOS: there's no microphone check without native code, so it looks for Zoom's meeting
//   process (CptHost runs only while you're in a Zoom meeting). Calls in other apps or in the
//   browser aren't seen on macOS; the Chrome extension detects browser calls on its own.

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

export async function detectMeeting(platform: NodeJS.Platform = process.platform): Promise<boolean> {
  if (platform === 'win32') {
    return micInUseFromRegistry(await run('reg', ['query', MIC_CONSENT_KEY, '/s', '/v', 'LastUsedTimeStop']));
  }
  if (platform === 'darwin') {
    return (await run('/usr/bin/pgrep', ['-x', 'CptHost'])).trim().length > 0;
  }
  return false;
}
