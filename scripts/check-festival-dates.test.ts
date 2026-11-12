import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain JavaScript module run by Node in the release workflow
import { datesRunningOut } from './check-festival-dates.mjs';

describe('festival date warning', () => {
  it('is quiet while every moon-based festival has dates ahead', () => {
    expect(datesRunningOut(new Date(2026, 10, 12))).toEqual([]);
  });

  it('warns about festivals whose dates end within 9 months', () => {
    const names = datesRunningOut(new Date(2030, 3, 1)).map((f: { name: string }) => f.name);
    expect(names).toEqual(expect.arrayContaining(['Lunar New Year', 'Eid', 'Holi']));
    expect(names).not.toContain('Christmas'); // fixed date: never runs out
  });
});
