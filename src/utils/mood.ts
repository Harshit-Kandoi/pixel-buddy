import type { StateMachineData } from './types';

// The buddy's mood, shown as a small badge by its head (static, so it costs no battery):
// - call: a call or meeting is on, so reminders wait (🎧)
// - happy: for a minute after a break you finished (✨)
// - tired: you skipped or snoozed a break, or have been focused for a long stretch (😪)
export type Mood = 'call' | 'happy' | 'tired';

export const TIRED_AFTER_SECONDS = 90 * 60;
export const HAPPY_FOR_MS = 60_000;

export const MOOD_BADGES: Record<Mood, { emoji: string; label: string }> = {
  call: { emoji: '🎧', label: 'On a call. Reminders wait until it ends.' },
  happy: { emoji: '✨', label: 'Feeling fresh after that break!' },
  tired: { emoji: '😪', label: 'Getting tired. A break would help.' },
};

// What the buddy says when clicked while tired.
export const TIRED_LINES = [
  "*yawn* Long stretch, huh? A short break soon? 😪",
  "My eyes are getting heavy. Yours too? 👀",
  "We skipped one… a quick stretch would feel so good.",
  "Running on fumes here. Water and a stretch? 💧",
];

export function buddyMood(data: StateMachineData, happy: boolean): Mood | null {
  if (data.isPaused) return null;
  const working = data.state === 'WORKING' || data.state === 'SNOOZE';
  if (!working) return null;
  if (data.inMeeting) return 'call';
  if (happy && data.state === 'WORKING') return 'happy';
  if (data.state === 'SNOOZE' || data.skipsCount > 0 || data.activeWorkSeconds >= TIRED_AFTER_SECONDS) return 'tired';
  return null;
}

/** What the buddy says when you click its mood badge: why it's there. */
export function moodReason(mood: Mood, data: StateMachineData): string {
  if (mood === 'call') return "🎧 You're on a call, so I'm holding your break and water reminders until it ends.";
  if (mood === 'happy') return '✨ That was a proper break. I feel fresh. Hope you do too!';
  if (data.state === 'SNOOZE') return "😪 We snoozed the break, so I'm getting sleepy. I'll ask again soon.";
  if (data.skipsCount > 0) return `😪 We skipped ${data.skipsCount === 1 ? 'a break' : `${data.skipsCount} breaks`}, so I'm getting tired. A short one soon?`;
  return `😪 That's ${Math.floor(data.activeWorkSeconds / 60)} minutes of focus in a row. A quick stretch would help us both.`;
}

/** A break you saw through to the end (not one cut short by getting back to work). */
export function finishedBreak(previous: StateMachineData | null, next: StateMachineData): boolean {
  return previous?.state === 'BREAK' && next.state === 'WORKING' && previous.breakSecondsLeft <= 1;
}
