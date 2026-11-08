import { describe, expect, it } from 'vitest';
import { BREAK_ROUTINES, routineForBreak, stepAt } from '../../utils/breakRoutines';

describe('guided break routines', () => {
  it('rotates through routines break by break', () => {
    const ids = [0, 1, 2, 3].map(n => routineForBreak(n).id);
    expect(ids).toEqual(['stretch', 'eyes', 'breathe', 'stretch']);
  });

  it('walks through steps by elapsed time', () => {
    const stretch = BREAK_ROUTINES[0];
    expect(stepAt(stretch, 0)).toMatchObject({ index: 0, secondsLeftInStep: 15 });
    expect(stepAt(stretch, 14)).toMatchObject({ index: 0, secondsLeftInStep: 1 });
    expect(stepAt(stretch, 15)).toMatchObject({ index: 1, secondsLeftInStep: 15 });
  });

  it('ends after the last step so the break falls back to tips', () => {
    const eyes = BREAK_ROUTINES[1];
    const total = eyes.steps.reduce((sum, s) => sum + s.seconds, 0);
    expect(stepAt(eyes, total - 1)?.index).toBe(eyes.steps.length - 1);
    expect(stepAt(eyes, total)).toBeNull();
  });

  it('keeps every routine short enough for a one-minute-ish break', () => {
    for (const routine of BREAK_ROUTINES) {
      expect(routine.steps.reduce((sum, s) => sum + s.seconds, 0)).toBeLessThanOrEqual(75);
    }
  });
});
