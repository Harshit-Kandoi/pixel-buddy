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
