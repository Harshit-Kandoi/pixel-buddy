// The festival calendar for the website. Mirrors src/utils/seasons.ts in the app;
// scripts/website-festivals.test.ts fails if the two drift apart.
export const FESTIVALS = [
  { skin: 'newyear', name: 'New Year', emoji: '🎉', annual: '01-01', before: 1, after: 1 },
  { skin: 'sankranti', name: 'Sankranti & Pongal', emoji: '🪁', annual: '01-14', before: 1, after: 1 },
  { skin: 'lunarnewyear', name: 'Lunar New Year', emoji: '🧧', dates: ['2027-02-06', '2028-01-26'], before: 1, after: 3 },
  { skin: 'eid', name: 'Eid', emoji: '🌙', dates: ['2027-03-10', '2027-05-17', '2028-02-27'], before: 1, after: 2 },
  { skin: 'holi', name: 'Holi', emoji: '🎨', dates: ['2027-03-22', '2028-03-11'], before: 1, after: 1 },
  { skin: 'onam', name: 'Onam', emoji: '🌼', dates: ['2027-09-12', '2028-09-01'], before: 2, after: 1 },
  { skin: 'halloween', name: 'Halloween', emoji: '🎃', annual: '10-31', before: 1, after: 0 },
  { skin: 'diwali', name: 'Diwali', emoji: '🪔', dates: ['2026-11-08', '2027-10-29', '2028-10-17'], before: 3, after: 3 },
  { skin: 'christmas', name: 'Christmas', emoji: '🎄', annual: '12-25', before: 3, after: 1 },
];

const DAY = 24 * 60 * 60 * 1000;

function occurrences(festival, now) {
  const days = [];
  if (festival.annual) {
    const [m, d] = festival.annual.split('-').map(Number);
    for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 2; y++) days.push(new Date(y, m - 1, d));
  }
  for (const iso of festival.dates ?? []) {
    const [y, m, d] = iso.split('-').map(Number);
    days.push(new Date(y, m - 1, d));
  }
  return days.map(day => ({
    festival,
    day,
    firstDay: new Date(day.getFullYear(), day.getMonth(), day.getDate() - festival.before),
    lastDay: new Date(day.getFullYear(), day.getMonth(), day.getDate() + festival.after),
  }));
}

const inWindow = (o, now) => now >= o.firstDay && now.getTime() < o.lastDay.getTime() + DAY;
const daysFrom = (o, now) => Math.abs(new Date(now.getFullYear(), now.getMonth(), now.getDate()) - o.day);

/** The festival happening now; when windows overlap, the closer main day wins (as in the app). */
export function activeFestival(now = new Date()) {
  const hits = FESTIVALS.flatMap(f => occurrences(f, now)).filter(o => inWindow(o, now));
  hits.sort((a, b) => daysFrom(a, now) - daysFrom(b, now));
  return hits[0] ?? null;
}

/** Each festival's current or next occurrence, soonest first. */
export function nextOfEach(now = new Date()) {
  return FESTIVALS.map(f => occurrences(f, now)
    .filter(o => now.getTime() < o.lastDay.getTime() + DAY)
    .sort((a, b) => a.day - b.day)[0])
    .filter(Boolean)
    .sort((a, b) => a.day - b.day);
}
