// The festival calendar. Festival buddies are limited-time: during a festival the buddy
// turns into that festival's character, and taking CLAIM_BREAKS breaks while it lasts lets
// you claim it and keep it. Once the festival is over, an unclaimed character is gone until
// next year and the buddy goes back to its classic look.

export type FestivalSkin =
  | 'newyear'
  | 'sankranti'
  | 'lunarnewyear'
  | 'eid'
  | 'holi'
  | 'onam'
  | 'halloween'
  | 'diwali'
  | 'christmas';
export type AvatarSkin = 'classic' | FestivalSkin;
export type AvatarSkinSetting = 'auto' | AvatarSkin;

/** Breaks to take during a festival to keep its buddy. */
export const CLAIM_BREAKS = 3;

export interface Festival {
  skin: FestivalSkin;
  name: string;
  emoji: string;
  /** Short wish for the speech bubble and the share card. */
  wish: string;
  /** Main day each year (local date, YYYY-MM-DD) for festivals that follow a lunar calendar. */
  dates?: string[];
  /** Main day every year (MM-DD) for fixed-date festivals. */
  annual?: string;
  /** Days before and after the main day that still count as the festival. */
  before: number;
  after: number;
  /** Share card colours. */
  card: { paper: string; dots: string; line: string; accent: string };
}

// In calendar order. Lunar and moon-sighting dates can shift by a day by region; the windows
// leave room for that. Add future years to `dates` as they're announced.
export const FESTIVALS: Festival[] = [
  {
    skin: 'newyear',
    name: 'New Year',
    emoji: '🎉',
    wish: 'Happy New Year! 🎉',
    annual: '01-01', // from New Year's Eve
    before: 1,
    after: 1,
    card: { paper: '#f4f1ff', dots: '#b9a8ff66', line: '#ddd4ff', accent: '#5a3fd1' },
  },
  {
    skin: 'sankranti',
    name: 'Sankranti & Pongal',
    emoji: '🪁',
    wish: 'Happy Sankranti & Pongal! 🪁',
    annual: '01-14', // Lohri the day before, Pongal through the 15th
    before: 1,
    after: 1,
    card: { paper: '#eef8fc', dots: '#9fd6ec66', line: '#c5e6f2', accent: '#1b6f99' },
  },
  {
    skin: 'lunarnewyear',
    name: 'Lunar New Year',
    emoji: '🧧',
    wish: 'Happy Lunar New Year! 🧧',
    dates: ['2027-02-06', '2028-01-26', '2029-02-13', '2030-02-03'],
    before: 1,
    after: 3,
    card: { paper: '#fdf1ee', dots: '#f4a6a066', line: '#f2cfc7', accent: '#b5121b' },
  },
  {
    skin: 'eid',
    name: 'Eid',
    emoji: '🌙',
    wish: 'Eid Mubarak! 🌙',
    // Eid al-Fitr and Eid al-Adha each year, by moon sighting
    dates: ['2027-03-10', '2027-05-17', '2028-02-27', '2028-05-05', '2029-02-14', '2029-04-24', '2030-02-04', '2030-04-13'],
    before: 1,
    after: 2,
    card: { paper: '#eefaf6', dots: '#8fd8c766', line: '#c6ebe1', accent: '#11685b' },
  },
  {
    skin: 'holi',
    name: 'Holi',
    emoji: '🎨',
    wish: 'Happy Holi! 🎨',
    dates: ['2027-03-22', '2028-03-11', '2029-03-01', '2030-03-20'], // Rangwali Holi (Dhulandi)
    before: 1,
    after: 1,
    card: { paper: '#fff6fb', dots: '#ff9fcf55', line: '#f7d3e6', accent: '#d6337a' },
  },
  {
    skin: 'onam',
    name: 'Onam',
    emoji: '🌼',
    wish: 'Happy Onam! 🌼',
    dates: ['2027-09-12', '2028-09-01', '2029-08-22', '2030-09-09'], // Thiruvonam
    before: 2,
    after: 1,
    card: { paper: '#fffaf0', dots: '#f0cf7a66', line: '#efdcae', accent: '#b5121b' },
  },
  {
    skin: 'halloween',
    name: 'Halloween',
    emoji: '🎃',
    wish: 'Happy Halloween! 🎃',
    annual: '10-31',
    before: 1,
    after: 0,
    card: { paper: '#fff4ea', dots: '#f7b27a66', line: '#f3d2b4', accent: '#5a189a' },
  },
  {
    skin: 'diwali',
    name: 'Diwali',
    emoji: '🪔',
    wish: 'Shubh Deepavali! ✨',
    dates: ['2026-11-08', '2027-10-29', '2028-10-17', '2029-11-05', '2030-10-26'], // Lakshmi Puja; the window covers Dhanteras to Bhai Dooj
    before: 3,
    after: 3,
    card: { paper: '#fff7df', dots: '#f5c94e66', line: '#f1d58c', accent: '#b45309' },
  },
  {
    skin: 'christmas',
    name: 'Christmas',
    emoji: '🎄',
    wish: 'Merry Christmas! 🎄',
    annual: '12-25',
    before: 3,
    after: 1,
    card: { paper: '#fdf3f1', dots: '#f2a7a066', line: '#f0cfc9', accent: '#b8241f' },
  },
];

export interface FestivalDay {
  festival: Festival;
  /** The main day, local time. */
  day: Date;
  /** First and last day of the window, local time. */
  firstDay: Date;
  lastDay: Date;
}

const DAY = 24 * 60 * 60 * 1000;

function localDay(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

// Every dated occurrence of a festival from the year before `now` to two years after.
function occurrences(festival: Festival, now: Date): FestivalDay[] {
  const days: Date[] = [];
  if (festival.annual) {
    const [m, d] = festival.annual.split('-').map(Number);
    for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 2; y++) days.push(localDay(y, m, d));
  }
  for (const iso of festival.dates ?? []) {
    const [y, m, d] = iso.split('-').map(Number);
    days.push(localDay(y, m, d));
  }
  return days.map(day => ({
    festival,
    day,
    firstDay: new Date(day.getFullYear(), day.getMonth(), day.getDate() - festival.before),
    lastDay: new Date(day.getFullYear(), day.getMonth(), day.getDate() + festival.after),
  }));
}

const inWindow = (o: FestivalDay, now: Date): boolean => now >= o.firstDay && now.getTime() < o.lastDay.getTime() + DAY;
const daysFrom = (o: FestivalDay, now: Date): number =>
  Math.abs(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - o.day.getTime());

/** The festival happening now. When two windows overlap, the one whose main day is closer wins. */
export function activeFestival(now: Date = new Date()): FestivalDay | null {
  const hits = FESTIVALS.flatMap(f => occurrences(f, now)).filter(o => inWindow(o, now));
  hits.sort((a, b) => daysFrom(a, now) - daysFrom(b, now));
  return hits[0] ?? null;
}

/** Festivals whose window starts after `now`, soonest first. */
export function upcomingFestivals(now: Date = new Date(), count = 3): FestivalDay[] {
  return FESTIVALS.flatMap(f => occurrences(f, now))
    .filter(o => o.firstDay > now)
    .sort((a, b) => a.day.getTime() - b.day.getTime())
    .slice(0, count);
}

export const festivalFor = (skin: FestivalSkin): Festival => FESTIVALS.find(f => f.skin === skin)!;

/** Identifies one festival season, e.g. "diwali-2026-11", so progress never carries over. */
export const seasonKey = (o: FestivalDay): string => `${o.festival.skin}-${o.day.getFullYear()}-${o.day.getMonth() + 1}`;

/** Counts a completed break toward the current festival's buddy. Keeps only recent seasons. */
export function recordFestivalBreak(progress: Record<string, number> | undefined, now: Date = new Date()): Record<string, number> {
  const festival = activeFestival(now);
  if (!festival) return progress ?? {};
  const key = seasonKey(festival);
  const recent = Object.entries(progress ?? {}).filter(([k]) => k !== key).slice(-4);
  return { ...Object.fromEntries(recent), [key]: (progress?.[key] ?? 0) + 1 };
}

export interface ClaimStatus {
  festival: FestivalDay;
  breaks: number;
  claimed: boolean;
  /** Enough breaks taken this season to claim the buddy. */
  earned: boolean;
}

/** Where you stand on the current festival's buddy, or null between festivals. */
export function claimStatus(
  settings: { claimedSkins?: FestivalSkin[]; festivalBreaks?: Record<string, number> },
  now: Date = new Date(),
): ClaimStatus | null {
  const festival = activeFestival(now);
  if (!festival) return null;
  const breaks = settings.festivalBreaks?.[seasonKey(festival)] ?? 0;
  return { festival, breaks, claimed: !!settings.claimedSkins?.includes(festival.festival.skin), earned: breaks >= CLAIM_BREAKS };
}

/** The classic buddy and claimed characters can be worn any time; the others only in season. */
export function canWear(skin: AvatarSkin, claimed: FestivalSkin[] = [], now: Date = new Date()): boolean {
  return skin === 'classic' || claimed.includes(skin) || activeFestival(now)?.festival.skin === skin;
}

const SKINS = new Set<string>(['classic', ...FESTIVALS.map(f => f.skin)]);

export function resolveAvatarSkin(setting: AvatarSkinSetting | undefined, now: Date = new Date(), claimed: FestivalSkin[] = []): AvatarSkin {
  if (setting && setting !== 'auto' && SKINS.has(setting)) return canWear(setting, claimed, now) ? setting : 'classic';
  return activeFestival(now)?.festival.skin ?? 'classic';
}
