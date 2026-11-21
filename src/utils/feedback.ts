import { version as PACKAGE_VERSION } from '../../package.json';
import { CHROME_REVIEW_URL, EDGE_ADDONS_URL, GITHUB_URL, WEBSITE_URL } from './links';

// In-app feedback: a star rating, what you like, what could be better, and a note. Sent only
// when you press Send, to the website's Netlify form "feedback" (see website/dist/feedback.html,
// which registers the form and is the fallback when sending from the app fails).

export const FEEDBACK_LIKES = [
  'Break reminders',
  'Guided breaks',
  'Water reminders',
  'The buddy',
  'Festival buddies',
  'Dashboard',
  'Break notes',
  'Quiet during calls',
] as const;

export const FEEDBACK_IMPROVE = [
  'Reminders at bad times',
  'Gets in the way',
  'Battery or heat',
  'Hard to set up',
  'Missing a feature',
  'Something broke',
] as const;

export const FEEDBACK_MESSAGE_MAX = 1000;
export const FEEDBACK_EMAIL_MAX = 120;
/** Four or five stars: happy enough to be asked for a public review first. */
export const HAPPY_RATING = 4;

export interface Feedback {
  rating: number;
  liked: string[];
  improve: string[];
  message: string;
  email: string;
}

export type FeedbackPlatform = 'chrome-extension' | 'edge-extension' | 'mac' | 'windows' | 'linux';

const IN_EXTENSION = typeof location !== 'undefined' && location.protocol === 'chrome-extension:';
const IS_EDGE = typeof navigator !== 'undefined' && /\bEdg\//.test(navigator.userAgent);

export function feedbackPlatform(userAgent = navigator.userAgent, extension = IN_EXTENSION): FeedbackPlatform {
  if (extension) return /\bEdg\//.test(userAgent) ? 'edge-extension' : 'chrome-extension';
  return userAgent.includes('Windows') ? 'windows' : userAgent.includes('Mac') ? 'mac' : 'linux';
}

type ExtensionGlobal = { chrome?: { runtime?: { getManifest?: () => { version: string } } } };
export function appVersion(): string {
  try {
    const manifest = IN_EXTENSION ? (globalThis as ExtensionGlobal).chrome?.runtime?.getManifest?.() : undefined;
    if (manifest?.version) return manifest.version;
  } catch { /* not running as an extension page */ }
  return PACKAGE_VERSION;
}

/**
 * Where a public review goes: the store this copy most likely came from (Edge users can install
 * from the Chrome Web Store until the Edge listing exists). The desktop app has no store, so it
 * asks for a GitHub star instead.
 */
export const REVIEW_URL = IN_EXTENSION ? (IS_EDGE && EDGE_ADDONS_URL ? EDGE_ADDONS_URL : CHROME_REVIEW_URL) : GITHUB_URL;
export const REVIEW_IS_STORE = IN_EXTENSION;

/** The form body Netlify expects; trims and caps everything, and drops unknown options. */
export function feedbackForm(feedback: Feedback, platform: FeedbackPlatform, version: string): URLSearchParams {
  const known = (picked: string[], options: readonly string[]): string => picked.filter((o) => options.includes(o)).join(', ');
  return new URLSearchParams({
    'form-name': 'feedback',
    rating: String(Math.min(5, Math.max(1, Math.round(feedback.rating)))),
    liked: known(feedback.liked, FEEDBACK_LIKES),
    improve: known(feedback.improve, FEEDBACK_IMPROVE),
    message: feedback.message.trim().slice(0, FEEDBACK_MESSAGE_MAX),
    email: feedback.email.trim().slice(0, FEEDBACK_EMAIL_MAX),
    platform,
    version: version.slice(0, 20),
    company: '', // honeypot: people leave it empty
  });
}

/**
 * Posts the feedback. The response is opaque (the website sends no CORS headers), so this
 * resolves true once the request went out and false when it couldn't (offline, blocked).
 */
export async function sendFeedback(feedback: Feedback): Promise<boolean> {
  try {
    await fetch(WEBSITE_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: feedbackForm(feedback, feedbackPlatform(), appVersion()).toString(),
    });
    return true;
  } catch {
    return false;
  }
}

/** The website's feedback page, for when sending from the app didn't work. Carries no personal data. */
export function feedbackPageUrl(rating: number): string {
  const params = new URLSearchParams({ rating: String(rating || ''), p: feedbackPlatform(), v: appVersion() });
  return `${WEBSITE_URL}feedback.html?${params}`;
}
