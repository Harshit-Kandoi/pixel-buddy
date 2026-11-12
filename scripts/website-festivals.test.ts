import { describe, expect, it } from 'vitest';
import { FESTIVALS, activeFestival as appActiveFestival } from '../src/utils/seasons';
// @ts-expect-error -- plain JavaScript module served as-is by the buildless website
import { FESTIVALS as SITE_FESTIVALS, activeFestival, nextOfEach } from '../website/dist/festivals.mjs';

type SiteFestival = { skin: string };
const pick = ({ skin, name, emoji, annual, dates, before, after }: (typeof FESTIVALS)[number]): object =>
  ({ skin, name, emoji, annual, dates, before, after });

describe('website festival calendar', () => {
  it('matches the app calendar', () => {
    expect(SITE_FESTIVALS.map((f: SiteFestival) => ({ annual: undefined, dates: undefined, ...f }))).toEqual(FESTIVALS.map(pick));
  });

  it('has artwork for every festival', async () => {
    const { existsSync } = await import('node:fs');
    for (const f of SITE_FESTIVALS as SiteFestival[]) expect(existsSync(`website/dist/assets/buddy-${f.skin}.svg`)).toBe(true);
  });

  it('knows today is Diwali and what comes next', () => {
    const now = new Date(2026, 10, 8, 12);
    expect(activeFestival(now)?.festival.skin).toBe('diwali');
    expect(nextOfEach(now).map((o: { festival: SiteFestival }) => o.festival.skin)).toEqual([
      'diwali', 'christmas', 'newyear', 'sankranti', 'lunarnewyear', 'eid', 'holi', 'onam', 'halloween',
    ]);
  });

  it('picks the same festival as the app on every day through 2030', () => {
    for (let d = new Date(2027, 0, 1, 12); d.getFullYear() < 2031; d.setDate(d.getDate() + 1)) {
      expect(activeFestival(d)?.festival.skin ?? null, d.toDateString()).toBe(appActiveFestival(d)?.festival.skin ?? null);
    }
  });
});
