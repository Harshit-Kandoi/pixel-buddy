import { describe, expect, it } from 'vitest';
import {
  CLAIM_BREAKS,
  FESTIVALS,
  activeFestival,
  canWear,
  claimStatus,
  recordFestivalBreak,
  resolveAvatarSkin,
  upcomingFestivals,
} from '../../utils/seasons';

const at = (y: number, m: number, d: number, h = 12): Date => new Date(y, m - 1, d, h);

describe('festival calendar', () => {
  it('dresses up for Diwali from Dhanteras through Bhai Dooj', () => {
    expect(resolveAvatarSkin('auto', at(2026, 11, 5, 0))).toBe('diwali');
    expect(resolveAvatarSkin('auto', at(2026, 11, 8))).toBe('diwali');
    expect(resolveAvatarSkin('auto', at(2026, 11, 11, 23))).toBe('diwali');
    expect(resolveAvatarSkin('auto', at(2028, 10, 17))).toBe('diwali');
  });

  it('covers the fixed-date festivals every year', () => {
    expect(resolveAvatarSkin('auto', at(2026, 12, 25))).toBe('christmas');
    expect(resolveAvatarSkin('auto', at(2030, 12, 24))).toBe('christmas');
    expect(resolveAvatarSkin('auto', at(2026, 12, 31, 20))).toBe('newyear');
    expect(resolveAvatarSkin('auto', at(2027, 1, 14))).toBe('sankranti');
    expect(resolveAvatarSkin('auto', at(2027, 1, 15))).toBe('sankranti'); // Pongal
    expect(resolveAvatarSkin('auto', at(2029, 10, 31))).toBe('halloween');
  });

  it('covers the lunar and moon-sighting festivals', () => {
    expect(resolveAvatarSkin('auto', at(2027, 2, 6))).toBe('lunarnewyear');
    expect(resolveAvatarSkin('auto', at(2028, 1, 26))).toBe('lunarnewyear');
    expect(resolveAvatarSkin('auto', at(2027, 3, 10))).toBe('eid');
    expect(resolveAvatarSkin('auto', at(2027, 5, 17))).toBe('eid');
    expect(resolveAvatarSkin('auto', at(2027, 3, 22))).toBe('holi');
    expect(resolveAvatarSkin('auto', at(2027, 9, 12))).toBe('onam');
    expect(resolveAvatarSkin('auto', at(2028, 9, 1))).toBe('onam');
  });

  it('has every festival in every year through 2030', () => {
    for (let year = 2027; year <= 2030; year++) {
      for (const festival of FESTIVALS) {
        const days = festival.annual ? [`${year}-${festival.annual}`] : (festival.dates ?? []).filter(d => d.startsWith(`${year}-`));
        expect(days.length, `${festival.name} ${year}`).toBeGreaterThan(0);
      }
    }
  });

  it('wears the classic look between festivals', () => {
    expect(resolveAvatarSkin('auto', at(2026, 11, 4, 23))).toBe('classic');
    expect(resolveAvatarSkin('auto', at(2026, 11, 12, 0))).toBe('classic');
    expect(resolveAvatarSkin('auto', at(2026, 12, 28))).toBe('classic');
    expect(resolveAvatarSkin(undefined, at(2027, 6, 1))).toBe('classic');
  });

  it('gives an overlapping day to the festival whose main day is closer', () => {
    // Diwali 2027 runs 26 Oct – 1 Nov; Halloween is the 31st.
    expect(resolveAvatarSkin('auto', at(2027, 10, 29))).toBe('diwali');
    expect(resolveAvatarSkin('auto', at(2027, 10, 31))).toBe('halloween');
    expect(resolveAvatarSkin('auto', at(2027, 11, 1))).toBe('diwali');
  });

  it('never lets one festival hide another on its main day', () => {
    for (const festival of FESTIVALS) {
      const days = festival.dates ?? ['2027', '2028'].map(y => `${y}-${festival.annual}`);
      for (const iso of days) {
        const [y, m, d] = iso.split('-').map(Number);
        expect(activeFestival(at(y, m, d))?.festival.skin, iso).toBe(festival.skin);
      }
    }
  });

  it('lists what is coming up next', () => {
    expect(upcomingFestivals(at(2026, 11, 8)).map(u => u.festival.skin)).toEqual(['christmas', 'newyear', 'sankranti']);
    expect(upcomingFestivals(at(2027, 2, 1), 3).map(u => u.festival.skin)).toEqual(['lunarnewyear', 'eid', 'holi']);
  });

  it('reports the last festive day', () => {
    expect(activeFestival(at(2026, 11, 8))?.lastDay).toEqual(new Date(2026, 10, 11));
  });
});

describe('limited-time festival buddies', () => {
  const diwali = at(2026, 11, 8);

  it('counts breaks per festival season, and nothing between festivals', () => {
    let progress = recordFestivalBreak({}, diwali);
    progress = recordFestivalBreak(progress, diwali);
    expect(progress).toEqual({ 'diwali-2026-11': 2 });
    expect(recordFestivalBreak(progress, at(2027, 6, 1))).toEqual(progress);
    expect(recordFestivalBreak(progress, at(2026, 12, 25))).toEqual({ 'diwali-2026-11': 2, 'christmas-2026-12': 1 });
  });

  it('keeps Diwali progress when Halloween briefly takes over', () => {
    let progress = recordFestivalBreak({}, at(2027, 10, 29));
    progress = recordFestivalBreak(progress, at(2027, 10, 31));
    progress = recordFestivalBreak(progress, at(2027, 11, 1));
    expect(progress['diwali-2027-10']).toBe(2);
  });

  it(`is earned after ${CLAIM_BREAKS} breaks and only claimed when you claim it`, () => {
    expect(claimStatus({ festivalBreaks: { 'diwali-2026-11': 2 } }, diwali)).toMatchObject({ breaks: 2, earned: false, claimed: false });
    expect(claimStatus({ festivalBreaks: { 'diwali-2026-11': 3 } }, diwali)).toMatchObject({ earned: true, claimed: false });
    expect(claimStatus({ claimedSkins: ['diwali'] }, diwali)).toMatchObject({ claimed: true });
    expect(claimStatus({}, at(2027, 6, 1))).toBeNull();
  });

  it('does not count last year toward this year', () => {
    expect(claimStatus({ festivalBreaks: { 'diwali-2026-11': 5 } }, at(2027, 10, 29))).toMatchObject({ breaks: 0, earned: false });
  });

  it('lets you wear a festival buddy in season, or any time once claimed', () => {
    expect(canWear('diwali', [], diwali)).toBe(true);
    expect(canWear('diwali', [], at(2027, 6, 1))).toBe(false);
    expect(canWear('diwali', ['diwali'], at(2027, 6, 1))).toBe(true);
    expect(canWear('classic', [], at(2027, 6, 1))).toBe(true);
  });

  it('falls back to the classic buddy when an unclaimed choice goes out of season', () => {
    expect(resolveAvatarSkin('holi', at(2027, 6, 1))).toBe('classic');
    expect(resolveAvatarSkin('holi', at(2027, 6, 1), ['holi'])).toBe('holi');
    expect(resolveAvatarSkin('classic', diwali)).toBe('classic');
    expect(resolveAvatarSkin('nonsense' as never, at(2027, 6, 1))).toBe('classic');
  });
});
