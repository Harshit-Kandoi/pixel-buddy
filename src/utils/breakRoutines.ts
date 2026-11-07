// Short guided routines the buddy leads during a break, acting out each step. After the
// routine ends, the break falls back to rotating tips.

export type BuddyMotion = 'reach' | 'sway' | 'look' | 'breathe' | 'wiggle';

export interface RoutineStep {
  text: string;
  seconds: number;
  motion: BuddyMotion;
}

export interface BreakRoutine {
  id: string;
  title: string;
  steps: RoutineStep[];
}

export const BREAK_ROUTINES: BreakRoutine[] = [
  {
    id: 'stretch',
    title: '🙆 Stretch with me',
    steps: [
      { text: 'Stand up and reach both arms to the sky. Big stretch!', seconds: 15, motion: 'reach' },
      { text: 'Lean slowly to the left… now to the right.', seconds: 15, motion: 'sway' },
      { text: 'Roll your shoulders back, five slow times.', seconds: 12, motion: 'sway' },
      { text: 'Clasp your hands behind you and open your chest.', seconds: 15, motion: 'reach' },
      { text: 'Shake out your hands and wrists. Lovely!', seconds: 10, motion: 'wiggle' },
    ],
  },
  {
    id: 'eyes',
    title: '👀 Eye refresh · 20-20-20',
    steps: [
      { text: 'Look at something at least 20 feet away. Hold it for 20 seconds.', seconds: 20, motion: 'look' },
      { text: 'Now look left… and right… slowly, with me.', seconds: 15, motion: 'look' },
      { text: 'Close your eyes and breathe gently.', seconds: 15, motion: 'breathe' },
      { text: 'Blink quickly ten times to refresh them.', seconds: 10, motion: 'wiggle' },
    ],
  },
  {
    id: 'breathe',
    title: '🌬️ Breathe with me',
    steps: [
      { text: 'Sit back and let your shoulders drop.', seconds: 10, motion: 'breathe' },
      { text: 'Breathe in as I grow… out as I shrink.', seconds: 40, motion: 'breathe' },
      { text: 'Unclench your jaw. Soften your face.', seconds: 10, motion: 'breathe' },
      { text: 'One last slow breath. Welcome back.', seconds: 10, motion: 'breathe' },
    ],
  },
];

export interface ActiveStep {
  routine: BreakRoutine;
  step: RoutineStep;
  index: number;
  secondsLeftInStep: number;
}

/** Each break gets the next routine, so stretch, eyes and breathing take turns. */
export function routineForBreak(breaksCompletedToday: number): BreakRoutine {
  const n = Math.max(0, Math.floor(breaksCompletedToday));
  return BREAK_ROUTINES[n % BREAK_ROUTINES.length];
}

/** The step for this many seconds into the break, or null once the routine is over. */
export function stepAt(routine: BreakRoutine, elapsedSeconds: number): ActiveStep | null {
  let start = 0;
  for (let index = 0; index < routine.steps.length; index++) {
    const step = routine.steps[index];
    if (elapsedSeconds < start + step.seconds) {
      return { routine, step, index, secondsLeftInStep: start + step.seconds - Math.max(0, elapsedSeconds) };
    }
    start += step.seconds;
  }
  return null;
}
